"use client";

import type { ScorePoint } from "@/lib/practice-stats";

type Props = {
  points: ScorePoint[];
};

const VB_W = 600;
const VB_H = 100;
const PAD_X = 16;
const PAD_Y = 12;

export function ScoreSparkline({ points }: Props) {
  if (points.length < 2) {
    return (
      <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
        Drill at least two rounds to see a trend.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.score), 1);
  const min = Math.min(...points.map((p) => p.score), 0);
  const range = Math.max(max - min, 1);

  const xs = (i: number) =>
    PAD_X + (i / (points.length - 1)) * (VB_W - 2 * PAD_X);
  const ys = (s: number) =>
    VB_H - PAD_Y - ((s - min) / range) * (VB_H - 2 * PAD_Y);

  const polyline = points.map((p, i) => `${xs(i)},${ys(p.score)}`).join(" ");

  // Find the latest point to highlight ("you are here").
  const lastIdx = points.length - 1;
  const last = points[lastIdx];

  // Find the highest-scoring point to label.
  let bestIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].score > points[bestIdx].score) bestIdx = i;
  }
  const best = points[bestIdx];

  return (
    <div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-24 motion-safe:[stroke-dasharray:1500] motion-safe:[stroke-dashoffset:0] motion-safe:animate-[zp-spark-draw_1.2s_ease-out_both]"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Score over the last ${points.length} runs. Latest: ${last.score}. Best: ${best.score}.`}
      >
        {/* baseline */}
        <line
          x1={PAD_X}
          y1={VB_H - PAD_Y}
          x2={VB_W - PAD_X}
          y2={VB_H - PAD_Y}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {/* path */}
        <polyline
          points={polyline}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* dot at latest */}
        <circle
          cx={xs(lastIdx)}
          cy={ys(last.score)}
          r={3}
          fill="#ffffff"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mt-2 px-1">
        <span>{points.length} runs</span>
        <span>
          best <span className="text-white/65 tabular-nums">{best.score}</span>
          <span className="mx-2 text-white/20">·</span>
          latest <span className="text-white/65 tabular-nums">{last.score}</span>
        </span>
      </div>
      <style jsx>{`
        @keyframes zp-spark-draw {
          from {
            stroke-dashoffset: 1500;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
