"use client";

type Op = "add" | "sub" | "mul" | "div";

const OP_SYMBOL: Record<Op, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

// Speed-app rule: problems snap. The drill is the product; any animation
// between problems (fade, slide, blur) costs perceived latency on every
// correct answer. The blinking caret + score odometer carry enough motion.
export function AnimatedProblem({
  a,
  op,
  b,
  className = "",
}: {
  a: number;
  op: Op;
  b: number;
  index?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`font-extralight tracking-[-0.05em] leading-none whitespace-nowrap ${className}`}
    >
      {a}
      <span className="text-white/42 font-extralight mx-[0.18em]">{OP_SYMBOL[op]}</span>
      {b}
    </div>
  );
}
