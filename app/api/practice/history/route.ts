import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Returns the authed user's practice rows, newest first. Shape matches the
 * client's StoredRun (v4) so the /me Stats hub can drop server rows into
 * the same render path as local rows without conversion.
 *
 * Query params:
 *   limit (optional) — clamped to [1, 1000]; defaults to 200.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const requested = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(requested) ? requested : DEFAULT_LIMIT),
  );

  // RLS gates this to the user's own rows, but we filter explicitly anyway so
  // the query plan uses the (user_id, ended_at DESC) index cleanly.
  const { data, error } = await supabase
    .from("practice_runs")
    .select(
      "id, mode, score, problems_attempted, problems_correct, mean_latency_ms, duration_ms, ended_at, by_op, mul_facts, by_tag, tag_version",
    )
    .eq("user_id", user.id)
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reshape DB columns into StoredRun (v4). Client merges these into its
  // local cache by id; identical ids overwrite.
  const rows = (data ?? []).map((r) => ({
    v: 4 as const,
    runId: r.id as string,
    mode: r.mode as string,
    score: r.score as number,
    problemsAttempted: r.problems_attempted as number,
    problemsCorrect: r.problems_correct as number,
    meanLatencyMs: r.mean_latency_ms as number,
    durationMs: r.duration_ms as number,
    endedAt: new Date(r.ended_at as string).getTime(),
    byOp: (r.by_op ?? {}) as Record<string, unknown>,
    mulFacts: (r.mul_facts ?? {}) as Record<string, unknown>,
    byTag: (r.by_tag ?? {}) as Record<string, unknown>,
    tagVersion: (r.tag_version ?? 0) as number,
  }));

  return NextResponse.json({ rows });
}
