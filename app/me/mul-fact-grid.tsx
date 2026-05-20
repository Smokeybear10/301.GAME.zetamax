"use client";

import { MUL_FACT_MAX, MUL_FACT_MIN, type FactSummary } from "@/lib/practice-stats";

type Props = {
  facts: FactSummary[];
};

// Cells with at least this many samples participate in the latency colour
// ramp. Below this they still render — at a confidence-dampened opacity that
// reflects the cell has been touched but isn't yet a stable measurement.
const RAMP_THRESHOLD = 2;
// Sample count at which a cell is considered fully-confident for opacity.
const FULL_CONFIDENCE_N = 6;

function fmtLatencyShort(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function MulFactGrid({ facts }: Props) {
  // Index facts by canonical key (lo×hi) for O(1) lookup.
  const byKey = new Map<string, FactSummary>();
  for (const f of facts) {
    byKey.set(`${Math.min(f.a, f.b)}x${Math.max(f.a, f.b)}`, f);
  }

  // Determine the latency range for the color ramp. Slowest = brightest
  // (the "weak fact" highlight). Cells with n < RAMP_THRESHOLD are excluded
  // from the range calc so a single sample doesn't blow the scale.
  let minLat = Infinity;
  let maxLat = 0;
  for (const f of facts) {
    if (f.n < RAMP_THRESHOLD) continue;
    if (f.meanLatencyMs < minLat) minLat = f.meanLatencyMs;
    if (f.meanLatencyMs > maxLat) maxLat = f.meanLatencyMs;
  }
  const haveRange = isFinite(minLat) && maxLat > minLat;

  const factors: number[] = [];
  for (let i = MUL_FACT_MIN; i <= MUL_FACT_MAX; i++) factors.push(i);

  const totalCells = factors.length * factors.length;
  const touched = facts.filter((f) => f.n >= 1).length;
  const stable = facts.filter((f) => f.n >= RAMP_THRESHOLD).length;

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
                  const n = fact?.n ?? 0;

                  // Cell shading rules:
                  //   n=0       → empty cell, thin border (still see grid).
                  //   n>=1      → latency-mapped opacity (or neutral 0.55 if
                  //               range hasn't formed), dampened by a
                  //               sample-size confidence factor 0.35..1.
                  //               Low-n cells show count so the reader knows
                  //               the colour is provisional.
                  let opacity = 0;
                  let target = 0.55;
                  if (fact && n >= 1) {
                    if (n >= RAMP_THRESHOLD && haveRange) {
                      const t =
                        (fact.meanLatencyMs - minLat) / (maxLat - minLat);
                      target = 0.18 + t * (0.92 - 0.18);
                    }
                    const confidence = Math.min(1, n / FULL_CONFIDENCE_N);
                    opacity = 0.35 + (target - 0.35) * confidence;
                  }

                  const product = a * b;
                  const title = fact
                    ? `${a} × ${b} = ${product} — ${fmtLatencyShort(
                        fact.meanLatencyMs,
                      )}, ${Math.round(fact.accuracy * 100)}% over ${n}`
                    : `${a} × ${b} = ${product} — no data yet`;

                  // Brighter ramp → darker text for legibility; faded for
                  // untouched cells so they read as "still to be filled in".
                  const textClass =
                    n === 0
                      ? "text-white/25"
                      : opacity > 0.6
                        ? "text-black/80"
                        : "text-white/85";

                  return (
                    <td key={`${a}-${b}`} className="p-0">
                      <div
                        title={title}
                        aria-label={title}
                        className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-mono text-[10px] tabular-nums motion-safe:transition-[background-color] motion-safe:duration-300 ${textClass} ${
                          n === 0 ? "border border-white/[0.06]" : ""
                        }`}
                        style={{
                          backgroundColor:
                            n === 0
                              ? "transparent"
                              : `rgba(255,255,255,${opacity})`,
                        }}
                      >
                        {product}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-2 mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42">
        <span>
          {touched}/{totalCells} touched · {stable} with ≥{RAMP_THRESHOLD}
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
