"use client";

import type { KeyBinds } from "@/lib/drill";

const DIGIT_ROWS: readonly (readonly string[])[] = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

type Props = {
  onKey: (key: string) => void;
  keybinds: KeyBinds;
};

export function MobileKeypad({ onKey, keybinds }: Props) {
  return (
    <div
      className="sm:hidden flex flex-col items-center gap-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 select-none"
      style={{ touchAction: "manipulation" }}
      role="group"
      aria-label="Numeric keypad"
    >
      <button
        type="button"
        onClick={() => onKey(keybinds.skip)}
        className="px-4 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 active:text-white border border-white/10 active:border-white/30 transition-colors"
        aria-label="Skip current problem"
      >
        skip
      </button>
      <div className="grid grid-cols-3 gap-2">
        {DIGIT_ROWS.flat().map((d) => (
          <KeypadButton key={d} onClick={() => onKey(d)} label={d} aria-label={d} />
        ))}
        <KeypadButton
          onClick={() => onKey(keybinds.delete)}
          label="⌫"
          symbol
          aria-label="Delete last digit"
        />
        <KeypadButton onClick={() => onKey("0")} label="0" aria-label="0" />
        <KeypadButton
          onClick={() => onKey(keybinds.submit)}
          label="↵"
          symbol
          aria-label="Submit answer"
        />
      </div>
    </div>
  );
}

function KeypadButton({
  onClick,
  label,
  symbol,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  label: string;
  symbol?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-14 h-14 flex items-center justify-center font-mono ${
        symbol ? "text-xl text-white/65" : "text-2xl font-light text-white"
      } border border-white/10 active:border-white/40 active:bg-white/[0.06] transition-colors`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {label}
    </button>
  );
}
