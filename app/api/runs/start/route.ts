import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { precomputeAnswerKey } from "@/lib/drill/precompute";
import type { StartRunResponse } from "@/lib/runs-api";

const ACTIVE_RUN_RATE_LIMIT_MS = 125_000;
const DEFAULT_DURATION_MS = 120_000;

export async function POST(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Rate limit: if user has a 'pending' run started in the last 125s, return it.
  // Prevents the "spawn many runs, precompute, submit fast" attack.
  const cutoff = new Date(Date.now() - ACTIVE_RUN_RATE_LIMIT_MS).toISOString();
  const { data: pending } = await admin
    .from("runs")
    .select("id, seed")
    .eq("user_id", user.id)
    .eq("validation_status", "pending")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    const body: StartRunResponse = {
      run_id: pending.id,
      seed: pending.seed,
      duration_ms: DEFAULT_DURATION_MS,
      resumed: true,
    };
    return NextResponse.json(body);
  }

  // Fresh run.
  const seed = `${user.id}:${Date.now()}:${crypto.randomUUID()}`;
  const answerKey = precomputeAnswerKey(seed);
  const startedAt = new Date().toISOString();

  const { data: inserted, error } = await admin
    .from("runs")
    .insert({
      user_id: user.id,
      seed,
      answer_key: answerKey,
      started_at: startedAt,
      validation_status: "pending",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("/api/runs/start insert failed:", error);
    return NextResponse.json({ error: "could not start run" }, { status: 500 });
  }

  const body: StartRunResponse = {
    run_id: inserted.id,
    seed,
    duration_ms: DEFAULT_DURATION_MS,
    resumed: false,
  };
  return NextResponse.json(body);
}
