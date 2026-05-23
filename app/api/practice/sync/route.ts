import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_MODES = new Set(["classic", "quant", "compound", "learn"]);
const MAX_BATCH_SIZE = 200;

type SyncRow = {
  id: string;
  mode: string;
  score: number;
  problemsAttempted?: number;
  problemsCorrect?: number;
  meanLatencyMs?: number;
  durationMs: number;
  endedAt: number;
  byOp?: unknown;
  mulFacts?: unknown;
  byTag?: unknown;
  tagVersion?: number;
};

type SyncBody = { rows: SyncRow[] };

function isValidUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/**
 * Accepts a single batch of practice-mode rows from the client and upserts
 * them under the authed user. Used for both:
 *   1. write-through on saveRun (one row at a time)
 *   2. first-sign-in backfill (entire local history in one batch)
 *
 * Idempotent: ON CONFLICT (id) DO NOTHING. The client owns the row id, so
 * retries of the same row are no-ops on the server.
 */
export async function POST(req: NextRequest) {
  let body: SyncBody;
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  if (body.rows.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }

  if (body.rows.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `batch too large; max ${MAX_BATCH_SIZE} rows` },
      { status: 400 },
    );
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate + normalize each row. Reject the whole batch on the first bad
  // row so the client can fix and retry; mixed success would leave gaps.
  const inserts: Array<Record<string, unknown>> = [];
  for (const row of body.rows) {
    if (!isValidUuid(row.id)) {
      return NextResponse.json({ error: "row.id must be a uuid" }, { status: 400 });
    }
    if (typeof row.mode !== "string" || !ALLOWED_MODES.has(row.mode)) {
      return NextResponse.json(
        { error: `row.mode must be one of ${[...ALLOWED_MODES].join(", ")}` },
        { status: 400 },
      );
    }
    if (typeof row.score !== "number" || !Number.isFinite(row.score)) {
      return NextResponse.json({ error: "row.score must be a finite number" }, { status: 400 });
    }
    if (typeof row.durationMs !== "number" || row.durationMs <= 0) {
      return NextResponse.json({ error: "row.durationMs must be > 0" }, { status: 400 });
    }
    if (typeof row.endedAt !== "number" || !Number.isFinite(row.endedAt)) {
      return NextResponse.json({ error: "row.endedAt must be a finite unix ms" }, { status: 400 });
    }

    inserts.push({
      id: row.id,
      user_id: user.id,
      mode: row.mode,
      score: Math.round(row.score),
      problems_attempted: Math.max(0, Math.round(row.problemsAttempted ?? 0)),
      problems_correct: Math.max(0, Math.round(row.problemsCorrect ?? 0)),
      mean_latency_ms: Math.max(0, Math.round(row.meanLatencyMs ?? 0)),
      duration_ms: Math.round(row.durationMs),
      ended_at: new Date(row.endedAt).toISOString(),
      by_op: isObject(row.byOp) ? row.byOp : {},
      mul_facts: isObject(row.mulFacts) ? row.mulFacts : {},
      by_tag: isObject(row.byTag) ? row.byTag : {},
      tag_version: typeof row.tagVersion === "number" ? row.tagVersion : 0,
    });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("practice_runs")
    .upsert(inserts, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: inserts.length });
}
