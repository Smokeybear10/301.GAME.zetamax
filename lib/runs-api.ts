/**
 * Shared types between client and server for the /api/runs/* routes.
 */
import type { AnswerEvent } from "@/lib/drill";
import type { ValidationStatus } from "@/lib/drill/validate";

export type StartRunResponse = {
  run_id: string;
  seed: string;
  duration_ms: number;
  /** True if an existing pending run was returned (instead of a fresh one). */
  resumed: boolean;
};

export type StartRunError = {
  error: "unauthorized" | "could not start run";
};

export type FinishRunRequest = {
  run_id: string;
  events: AnswerEvent[];
  started_at_client?: string;
  completed_at_client?: string;
};

export type FinishRunResponse = {
  validation_status: ValidationStatus | "unknown";
  score: number;
  /** True if the result was already finalized; this response is the cached value. */
  cached?: boolean;
};

export type FinishRunError = {
  error: "unauthorized" | "run not found" | "missing run_id or events" | "invalid json" | "could not finalize";
};
