export type Op = "add" | "sub" | "mul" | "div";

export type Problem = {
  /** Stable id derived from (seed, index). Correlates with answer events. */
  id: string;
  op: Op;
  /** Displayed first operand. */
  a: number;
  /** Displayed second operand. */
  b: number;
  /** Correct answer. The engine uses it for auto-submit; the server uses it for validation. */
  answer: number;
};

export type Keystroke = {
  /** A digit ("0"-"9"), "Backspace", "Enter", or "Tab". Other keys are ignored. */
  key: string;
  /** Milliseconds since the current problem was shown. */
  t: number;
};

export type AnswerEvent = {
  problemId: string;
  /** Final typed string when the answer was committed. */
  typed: string;
  /** Full keystroke log for this problem. Substrate for the replay scrubber. */
  keystrokes: Keystroke[];
  /** Milliseconds since round start when the answer was committed. */
  submittedAt: number;
  correct: boolean;
  /** submittedAt minus problemShownAt. */
  latencyMs: number;
  /** Number of Backspace keystrokes used. */
  corrections: number;
};

export type RoundResult = {
  score: number;
  problemsAttempted: number;
  problemsCorrect: number;
  /** Fraction in [0, 1]. 0 if no problems attempted. */
  accuracy: number;
  /** Mean per-problem latency in ms. 0 if no problems attempted. */
  meanLatencyMs: number;
  events: AnswerEvent[];
};

export type DrillStatus = "idle" | "running" | "ended";

export type DrillState = {
  status: DrillStatus;
  startedAt: number | null;
  endsAt: number | null;
  durationMs: number;
  currentProblemIndex: number;
  currentProblem: Problem | null;
  currentProblemShownAt: number | null;
  typedAnswer: string;
  events: AnswerEvent[];
  score: number;
  /** Computed against now() each call. Clamped to 0 once ended. */
  msRemaining: number;
};

export type DrillConfig = {
  /** Stable string seed. Determines the entire problem stream. */
  seed: string;
  /** Round duration in ms. Defaults to 120_000 (Zetamac classic). */
  durationMs?: number;
  /** Time source. Defaults to performance.now(). Inject for tests. */
  now?: () => number;
};
