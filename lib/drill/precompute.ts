import { generateProblem } from "./generator";
import { hashString } from "./rng";

/**
 * Maximum problems precomputed per round. Even the fastest solvers don't
 * exceed ~80-100 in 120s; 200 is comfortable headroom.
 */
export const MAX_PROBLEMS_PER_ROUND = 200;

/**
 * Given a seed, return the array of correct answers for the first
 * MAX_PROBLEMS_PER_ROUND problems. Stored server-side as `runs.answer_key`;
 * never returned to the client.
 *
 * The client only ever sees the seed. The seed renders the problem TEXT
 * (e.g. "47 + 38"), but deriving the answer requires this same function.
 * Since the client uses the seed deterministically with the same generator,
 * client and server agree on every problem and answer — the server just
 * doesn't have to trust the client's score.
 */
export function precomputeAnswerKey(seed: string): number[] {
  const seedHash = hashString(seed);
  const answers: number[] = [];
  for (let i = 0; i < MAX_PROBLEMS_PER_ROUND; i++) {
    answers.push(generateProblem(seedHash, i).answer);
  }
  return answers;
}
