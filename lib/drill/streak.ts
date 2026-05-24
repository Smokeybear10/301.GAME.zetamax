import type { AnswerEvent } from "./types";

/**
 * Max time (ms) between consecutive correct submits before the streak
 * resets. Matches the audio mixer's streak window so the visible counter
 * and the layered build stay in lockstep.
 */
export const STREAK_WINDOW_MS = 3000;

/**
 * Current consecutive-correct streak under the "in a row, each within
 * STREAK_WINDOW_MS of the previous" rule. Walks backward from the latest
 * event; stops at the first wrong answer or the first gap > window.
 *
 * `msElapsed` is the elapsed time since round start (round-relative ms,
 * same units as `AnswerEvent.submittedAt`). Passing the current elapsed
 * time lets the streak naturally decay to 0 when the player goes idle —
 * a stale streak shouldn't keep showing while the player stares at the
 * screen.
 */
export function currentStreak(
  events: AnswerEvent[],
  msElapsed: number,
): number {
  if (events.length === 0) return 0;
  let streak = 0;
  let lastTime = msElapsed;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev.correct) break;
    if (lastTime - ev.submittedAt > STREAK_WINDOW_MS) break;
    streak++;
    lastTime = ev.submittedAt;
  }
  return streak;
}
