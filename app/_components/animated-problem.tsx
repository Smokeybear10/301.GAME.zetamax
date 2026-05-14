"use client";

import { AnimatePresence, motion } from "framer-motion";

type Op = "add" | "sub" | "mul" | "div";

const OP_SYMBOL: Record<Op, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function AnimatedProblem({
  a,
  op,
  b,
  index,
  className = "",
}: {
  a: number;
  op: Op;
  b: number;
  index: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`font-extralight tracking-[-0.05em] leading-none whitespace-nowrap flex items-baseline justify-center ${className}`}
    >
      <Token id={`a-${index}`} delay={0}>
        {a}
      </Token>
      <Token id={`op-${index}`} delay={0.05} className="text-white/42 mx-[0.18em]">
        {OP_SYMBOL[op]}
      </Token>
      <Token id={`b-${index}`} delay={0.1}>
        {b}
      </Token>
    </div>
  );
}

function Token({
  id,
  delay,
  className = "",
  children,
}: {
  id: string;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`relative inline-block ${className}`}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={id}
          initial={{ y: "55%", opacity: 0, filter: "blur(6px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-55%", opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.26, delay, ease: EASE }}
          className="inline-block"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
