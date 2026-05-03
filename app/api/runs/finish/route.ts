import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRun } from "@/lib/drill/validate";
import type { FinishRunRequest, FinishRunResponse } from "@/lib/runs-api";

export async function POST(req: NextRequest) {
  let body: FinishRunRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.run_id || !Array.isArray(body.events)) {
    return NextResponse.json(
      { error: "missing run_id or events" },
      { status: 400 },
    );
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: run } = await admin
    .from("runs")
    .select("id, user_id, started_at, validation_status, answer_key, score")
    .eq("id", body.run_id)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  if (run.user_id !== user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  // Idempotency: if already finalized, return the cached result. Safe for
  // network-drop retries — same run_id always returns the same outcome.
  if (run.validation_status !== "pending") {
    const cached: FinishRunResponse = {
      validation_status: run.validation_status,
      score: run.score ?? 0,
      cached: true,
    };
    return NextResponse.json(cached);
  }

  const startedAtMs = new Date(run.started_at).getTime();
  const completedAtMs = Date.now();

  const validation = validateRun({
    answerKey: run.answer_key as number[],
    events: body.events,
    startedAtMs,
    completedAtMs,
  });

  // Atomic update: only succeeds if still 'pending'. Race protection against
  // two concurrent finish requests for the same run_id.
  const { data: updated, error: updateError } = await admin
    .from("runs")
    .update({
      score: validation.score,
      problems_attempted: validation.problemsAttempted,
      problems_correct: validation.problemsCorrect,
      completed_at: new Date(completedAtMs).toISOString(),
      duration_ms: validation.durationMs,
      validation_status: validation.status,
      client_payload: {
        events: body.events,
        started_at_client: body.started_at_client,
        completed_at_client: body.completed_at_client,
      },
    })
    .eq("id", body.run_id)
    .eq("validation_status", "pending")
    .select("validation_status, score")
    .maybeSingle();

  if (updateError) {
    console.error("/api/runs/finish update failed:", updateError);
    return NextResponse.json({ error: "could not finalize" }, { status: 500 });
  }

  if (!updated) {
    // Race: another request finalized first. Read the actual state.
    const { data: latest } = await admin
      .from("runs")
      .select("validation_status, score")
      .eq("id", body.run_id)
      .maybeSingle();
    const cached: FinishRunResponse = {
      validation_status: latest?.validation_status ?? "unknown",
      score: latest?.score ?? 0,
      cached: true,
    };
    return NextResponse.json(cached);
  }

  const result: FinishRunResponse = {
    validation_status: updated.validation_status,
    score: updated.score ?? 0,
  };
  return NextResponse.json(result);
}
