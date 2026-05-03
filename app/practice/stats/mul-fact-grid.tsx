"use client";

import { MUL_FACT_MAX, MUL_FACT_MIN, type FactSummary } from "@/lib/practice-stats";

type Props = {
  facts: FactSummary[];
};

const COLD_START_THRESHOLD = 5;

function fmtLatencyShort(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function MulFactGrid({ facts }: Props) {
  // Index facts by canonical key (lo×hi) for O(1) lookup. Cold-start cells
  // simply aren't in the map; the grid below renders them grayed.
  const byKey = new Map<string, FactSummary>();
  for (const f of facts) {
    byKey.set(`${Math.min(f.a, f.b)}x${Math.max(f.a, f.b)}`, f);
  }

  // Determine the latency range for the color ramp. Slowest = brightest
  // (the "weak fact" highlight). Cells with n < COLD_START_THRESHOLD are
  // excluded from the range calc so a single sample doesn't blow the scale.
  let minLat = Infinity;
  let maxLat = 0;
  for (const f of facts) {
    if (f.n < COLD_START_THRESHOLD) continue;
    if (f.meanLatencyMs < minLat) minLat = f.meanLatencyMs;
    if (f.meanLatencyMs > maxLat) maxLat = f.meanLatencyMs;
  }
  const haveRange = isFinite(minLat) && maxLat > minLat;

  const factors: number[] = [];
  for (let i = MUL_FACT_MIN; i <= MUL_FACT_MAX; i++) factors.push(i);

  const totalCells = factors.length * factors.length;
  const populated = facts.filter((f) => f.n >= COLD_START_THRESHOLD).length;

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="border-collapse" role="grid">
          <thead>
            <tr>
              <th aria-label="row labels" className="w-7 sm:w-8" />
              {factors.map((b) => (
                <th
                  key={b}
                  scope="col"
                  className="font-mono text-[10px] tracking-[0.1em] tabular-nums text-white/42 font-normal w-7 h-7 sm:w-8 sm:h-8 text-center"
                >
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factors.map((a) => (
              <tr key={a}>
                <th
                  scope="row"
                  className="font-mono text-[10px] tracking-[0.1em] tabular-nums text-white/42 font-normal w-7 h-7 sm:w-8 sm:h-8 text-right pr-1.5"
                >
                  {a}
                </th>
                {factors.map((b) => {
                  const key = `${Math.min(a, b)}x${Math.max(a, b)}`;
                  const fact = byKey.get(key);
                  const cold = !fact || fact.n < COLD_START_THRESHOLD;
                  let opacity = 0.06;
                  if (!cold && haveRange) {
                    // Linear ramp; clamp to [0.18, 0.92].
                    const t = (fact!.meanLatencyMs - minLat) / (maxLat - minLat);
                    opacity = 0.18 + t * (0.92 - 0.18);
                  } else if (!cold) {
                    opacity = 0.55; // single populated cell — no range to ramp against
                  }
                  const title = fact
                    ? cold
                      ? `${a} × ${b} — ${fact.n} attempt${fact.n === 1 ? "" : "s"}`
                      : `${a} × ${b} = ${a * b} — ${fmtLatencyShort(
                          fact.meanLatencyMs,
                        )}, ${Math.round(fact.accuracy * 100)}% over ${fact.n}`
                    : `${a} × ${b} — no data yet`;
                  return (
                    <td
                      key={`${a}-${b}`}
                      className="p-0"
                    >
                      <div
                        title={title}
                        aria-label={title}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-mono text-[9px] tabular-nums motion-safe:transition-[background-color] motion-safe:duration-300"
                        style={{
                          backgroundColor: `rgba(255,255,255,${opacity})`,
                        }}
                      >
                        {cold && fact ? (
                          <span className="text-white/42">{fact.n}</span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42">
        <span>
          {populated}/{totalCells} cells with ≥{COLD_START_THRESHOLD} samples
        </span>
        <span className="flex items-center gap-2">
          fast
          <span className="flex">
            {[0.18, 0.35, 0.55, 0.75, 0.92].map((o) => (
              <span
                key={o}
                className="block w-3 h-3"
                style={{ backgroundColor: `rgba(255,255,255,${o})` }}
              />
            ))}
          </span>
          slow
        </span>
      </div>
    </div>
  );
}
