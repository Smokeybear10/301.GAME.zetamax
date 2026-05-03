/**
 * Shared types + thin client wrappers for the /api/runs/* routes.
 */
import type { AnswerEvent } from "@/lib/drill";
import type { ValidationStatus } from "@/lib/drill/validate";

export type StartRunRequest = {
  /** Defaults to "ranked". */
  mode?: "ranked" | "daily";
  /** Required when mode = "daily". YYYY-MM-DD in America/New_York. */
  daily_date?: string;
};

export type StartRunResponse = {
  run_id: string;
  seed: string;
  duration_ms: number;
  /** True if an existing pending run was returned (instead of a fresh one). */
  resumed: boolean;
};

export type StartRunError = {
  error:
    | "unauthorized"
    | "could not start run"
    | "invalid mode"
    | "invalid daily_date"
    | "already_attempted";
  /** Set when error="already_attempted" — gives the existing run's state. */
  existing_status?: string;
};

export type FinishRunRequest = {
  run_id: string;
  events: AnswerEvent[];
  started_at_client?: string;
  completed_at_client?: string;
};

export type EloOpponentBreakdown = {
  opp_id: string;
  opp_name: string;
  opp_score: number;
  my_score: number;
  delta: number;
};

export type EloUpdate = {
  rating_delta: number;
  new_rating: number;
  opponent_count: number;
  is_provisional: boolean;
  breakdown: EloOpponentBreakdown[];
};

export type FinishRunResponse = {
  validation_status: ValidationStatus | "unknown";
  score: number;
  /** True if the result was already finalized; this response is the cached value. */
  cached?: boolean;
  /** Present only when validation_status='ok' and apply_run_elo ran. */
  elo?: EloUpdate;
};

export type FinishRunError = {
  error: "unauthorized" | "run not found" | "missing run_id or events" | "invalid json" | "could not finalize";
};

// ---------------------------------------------------------------------------
// Client wrappers. Browser-only — run_id is the natural idempotency key, so
// retries can replay the same finish request without server-side dedup work
// (the route handler returns the cached result for non-pending runs).
// ---------------------------------------------------------------------------

const FINISH_RETRY_DELAYS_MS = [0, 5_000, 30_000];

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const code = detail?.error ?? `http_${res.status}`;
    throw new Error(code);
  }
  return res.json();
}

export async function startRun(
  opts: StartRunRequest = {},
): Promise<StartRunResponse> {
  return postJson<StartRunResponse>("/api/runs/start", opts);
}

export async function forfeitRun(runId: string): Promise<void> {
  // Best-effort beacon-style call. We don't surface failures to the user.
  try {
    await fetch(`/api/runs/forfeit/${encodeURIComponent(runId)}`, {
      method: "POST",
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

/**
 * Submit a finished run. Retries on network failures (offline, DNS, abort);
 * does NOT retry on server-issued errors — those mean the server already
 * decided. Each retry replays the same body; the run_id makes it idempotent.
 */
export async function finishRun(body: FinishRunRequest): Promise<FinishRunResponse> {
  let lastError: unknown = null;
  for (const delay of FINISH_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await postJson<FinishRunResponse>("/api/runs/finish", body);
    } catch (e) {
      // TypeError = network failure (offline, DNS, fetch aborted). Retry.
      // Anything else came from the server — bubble up immediately.
      if (e instanceof TypeError) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("network_failure"));
}
