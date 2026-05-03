import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { precomputeAnswerKey } from "@/lib/drill/precompute";
import { dailySeedFor, isValidDailyDate } from "@/lib/drill/daily-seed";
import type { StartRunRequest, StartRunResponse } from "@/lib/runs-api";

const ACTIVE_RUN_RATE_LIMIT_MS = 125_000;
const DEFAULT_DURATION_MS = 120_000;

export async function POST(req: NextRequest) {
  // Body is optional. Empty body / non-JSON falls through to ranked mode.
  let body: StartRunRequest = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as StartRunRequest;
  } catch {
    // Ignore malformed body — we'll just default to ranked.
  }

  const mode = body.mode ?? "ranked";
  if (mode !== "ranked" && mode !== "daily") {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }

  if (mode === "daily") {
    if (!body.daily_date || !isValidDailyDate(body.daily_date)) {
      return NextResponse.json({ error: "invalid daily_date" }, { status: 400 });
    }
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (mode === "daily") {
    return handleDailyStart(admin, user.id, body.daily_date!);
  }

  return handleRankedStart(admin, user.id);
}

async function handleRankedStart(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<NextResponse> {
  // Rate limit: if user has a 'pending' RANKED run started in the last 125s,
  // return it. Prevents the "spawn many runs, precompute, submit fast" attack.
  // Daily runs are excluded — they don't share the resume-window semantics.
  const cutoff = new Date(Date.now() - ACTIVE_RUN_RATE_LIMIT_MS).toISOString();
  const { data: pending } = await admin
    .from("runs")
    .select("id, seed")
    .eq("user_id", userId)
    .eq("mode", "ranked")
    .eq("validation_status", "pending")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    const responseBody: StartRunResponse = {
      run_id: pending.id,
      seed: pending.seed,
      duration_ms: DEFAULT_DURATION_MS,
      resumed: true,
    };
    return NextResponse.json(responseBody);
  }

  const seed = `${userId}:${Date.now()}:${crypto.randomUUID()}`;
  const answerKey = precomputeAnswerKey(seed);
  const startedAt = new Date().toISOString();

  const { data: inserted, error } = await admin
    .from("runs")
    .insert({
      user_id: userId,
      seed,
      answer_key: answerKey,
      started_at: startedAt,
      validation_status: "pending",
      mode: "ranked",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("/api/runs/start ranked insert failed:", error);
    return NextResponse.json({ error: "could not start run" }, { status: 500 });
  }

  const responseBody: StartRunResponse = {
    run_id: inserted.id,
    seed,
    duration_ms: DEFAULT_DURATION_MS,
    resumed: false,
  };
  return NextResponse.json(responseBody);
}

async function handleDailyStart(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  dailyDate: string,
): Promise<NextResponse> {
  // Daily is one-shot per (user, date). If a row exists in any state we
  // reject — and if it's pending we flip it to 'forfeited' first so the
  // user can't retry by reloading.
  const { data: existing } = await admin
    .from("runs")
    .select("id, validation_status")
    .eq("user_id", userId)
    .eq("mode", "daily")
    .eq("daily_date", dailyDate)
    .maybeSingle();

  if (existing) {
    let existingStatus = existing.validation_status as string;
    if (existingStatus === "pending") {
      const { error: updateError } = await admin
        .from("runs")
        .update({
          validation_status: "forfeited",
          completed_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("validation_status", "pending");
      if (!updateError) existingStatus = "forfeited";
    }
    return NextResponse.json(
      { error: "already_attempted", existing_status: existingStatus },
      { status: 409 },
    );
  }

  const seed = dailySeedFor(dailyDate);
  const answerKey = precomputeAnswerKey(seed);
  const startedAt = new Date().toISOString();

  const { data: inserted, error } = await admin
    .from("runs")
    .insert({
      user_id: userId,
      seed,
      answer_key: answerKey,
      started_at: startedAt,
      validation_status: "pending",
      mode: "daily",
      daily_date: dailyDate,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // Unique-violation race: another concurrent start beat us. Treat the same
    // as the existing-row branch — already_attempted, status pending (the
    // other request's row).
    if ((error as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { error: "already_attempted", existing_status: "pending" },
        { status: 409 },
      );
    }
    console.error("/api/runs/start daily insert failed:", error);
    return NextResponse.json({ error: "could not start run" }, { status: 500 });
  }

  const responseBody: StartRunResponse = {
    run_id: inserted.id,
    seed,
    duration_ms: DEFAULT_DURATION_MS,
    resumed: false,
  };
  return NextResponse.json(responseBody);
}
