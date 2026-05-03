"use client";

import { useEffect, useState } from "react";
import {
  KEYBIND_DEFAULTS,
  PRACTICE_DEFAULTS,
  RESERVED_KEYS,
  type KeyBinds,
  type Op,
  type OpRange,
  type PracticeConfig,
} from "@/lib/drill";

type Props = {
  config: PracticeConfig;
  onSave: (next: PracticeConfig) => void;
  onClose: () => void;
};

type Tab = "problems" | "keybinds";

const OP_LABEL: Record<Op, string> = {
  add: "Addition",
  sub: "Subtraction",
  mul: "Multiplication",
  div: "Division",
};

const OP_SYMBOL: Record<Op, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

const KEYBIND_LABELS: Record<keyof KeyBinds, { label: string; desc: string }> = {
  submit: { label: "Submit", desc: "lock in your answer" },
  skip: { label: "Skip", desc: "give up on this problem" },
  delete: { label: "Delete", desc: "remove last digit" },
};

function prettyKey(k: string): string {
  if (k === " ") return "Space";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

export function SettingsModal({ config, onSave, onClose }: Props) {
  // Local copy of config — committed only on Save.
  const [draft, setDraft] = useState<PracticeConfig>(config);
  const [tab, setTab] = useState<Tab>("problems");
  const [capturing, setCapturing] = useState<keyof KeyBinds | null>(null);
  const [bindError, setBindError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  // Esc closes the modal — unless we're capturing a key, in which case Esc
  // cancels the capture instead.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (capturing) {
          e.preventDefault();
          setCapturing(null);
          setBindError(null);
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, capturing]);

  // Capture mode: next non-Escape keydown rebinds the slot.
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") return; // handled by the other listener
      e.preventDefault();
      e.stopPropagation();
      if (RESERVED_KEYS.has(e.key)) {
        setBindError(`${prettyKey(e.key)} is reserved.`);
        return;
      }
      // Reject collisions with other slots.
      const collidesWith = (Object.keys(draft.keybinds) as (keyof KeyBinds)[]).find(
        (slot) => slot !== capturing && draft.keybinds[slot] === e.key,
      );
      if (collidesWith) {
        setBindError(`${prettyKey(e.key)} is already bound to ${KEYBIND_LABELS[collidesWith].label}.`);
        return;
      }
      setDraft({
        ...draft,
        keybinds: { ...draft.keybinds, [capturing]: e.key },
      });
      setCapturing(null);
      setBindError(null);
    };
    window.addEventListener("keydown", handler, true); // capture phase
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, draft]);

  function setOp(op: Op, partial: Partial<OpRange>) {
    setDraft({
      ...draft,
      generator: {
        ...draft.generator,
        ops: {
          ...draft.generator.ops,
          [op]: { ...draft.generator.ops[op], ...partial },
        },
      },
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-20 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-black border border-white/10 p-8 w-full max-w-lg my-8 text-white antialiased"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-baseline mb-4 pb-4 border-b border-white/10">
          <h2 className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/65">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-[0.18em] text-white/42 hover:text-white uppercase transition-colors"
            aria-label="Close"
          >
            esc
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mb-6 -mt-1">
          <TabButton active={tab === "problems"} onClick={() => setTab("problems")}>
            Problems
          </TabButton>
          <TabButton active={tab === "keybinds"} onClick={() => setTab("keybinds")}>
            Keybinds
          </TabButton>
        </div>

        {tab === "problems" && (
          <>
            {/* Duration */}
            <div className="mb-6">
              <label className="block font-mono text-[10px] uppercase tracking-[0.32em] text-white/42 mb-3">
                Length
              </label>
              <div className="flex items-baseline gap-3">
                <input
                  type="number"
                  min={5}
                  max={3600}
                  value={Math.round(draft.durationMs / 1000)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      durationMs:
                        Math.max(5, Math.min(3600, parseInt(e.target.value, 10) || 0)) *
                        1000,
                    })
                  }
                  className="w-24 px-3 py-2 bg-transparent border border-white/10 font-mono text-base tabular-nums text-white text-center focus:outline-none focus:border-white"
                  aria-label="Round duration in seconds"
                />
                <span className="font-mono text-xs tracking-[0.18em] text-white/42 uppercase">seconds</span>
              </div>
            </div>

            {/* Operations */}
            <div className="mb-6">
              <label className="block font-mono text-[10px] uppercase tracking-[0.32em] text-white/42 mb-4">
                Problems
              </label>
              <div className="space-y-3">
                {(["add", "sub", "mul", "div"] as Op[]).map((op) => (
                  <OpRow
                    key={op}
                    op={op}
                    range={draft.generator.ops[op]}
                    onChange={(partial) => setOp(op, partial)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "keybinds" && (
          <div className="mb-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/42 mb-4">
              Keybinds
            </p>
            <div className="space-y-2">
              {(Object.keys(KEYBIND_LABELS) as (keyof KeyBinds)[]).map((slot) => (
                <KeybindRow
                  key={slot}
                  label={KEYBIND_LABELS[slot].label}
                  desc={KEYBIND_LABELS[slot].desc}
                  current={draft.keybinds[slot]}
                  capturing={capturing === slot}
                  onCapture={() => {
                    setBindError(null);
                    setCapturing(slot);
                  }}
                />
              ))}
            </div>
            {bindError && (
              <p className="mt-3 font-mono text-[11px] text-white/65">{bindError}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setDraft({ ...draft, keybinds: KEYBIND_DEFAULTS });
                setCapturing(null);
                setBindError(null);
              }}
              className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/42 hover:text-white transition-colors"
            >
              Reset keybinds
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-6 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              setDraft(PRACTICE_DEFAULTS);
              setCapturing(null);
              setBindError(null);
            }}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42 hover:text-white transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm text-white/65 hover:text-white border border-transparent hover:border-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="px-5 py-2 text-sm bg-white text-black font-medium hover:bg-transparent hover:text-white border border-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.28em] transition-colors border-b ${
        active
          ? "text-white border-white"
          : "text-white/42 border-transparent hover:text-white/65"
      }`}
    >
      {children}
    </button>
  );
}

function KeybindRow({
  label,
  desc,
  current,
  capturing,
  onCapture,
}: {
  label: string;
  desc: string;
  current: string;
  capturing: boolean;
  onCapture: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <div className="text-sm text-white">{label}</div>
        <div className="font-mono text-[10px] tracking-[0.18em] text-white/42 uppercase">
          {desc}
        </div>
      </div>
      <button
        type="button"
        onClick={onCapture}
        className={`min-w-[120px] px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] border transition-colors ${
          capturing
            ? "border-white text-white bg-white/[0.06] motion-safe:animate-pulse"
            : "border-white/10 text-white/65 hover:border-white/30 hover:text-white"
        }`}
      >
        {capturing ? "press a key…" : prettyKey(current)}
      </button>
    </div>
  );
}

function OpRow({
  op,
  range,
  onChange,
}: {
  op: Op;
  range: OpRange;
  onChange: (partial: Partial<OpRange>) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 transition-opacity ${
        range.enabled ? "" : "opacity-40"
      }`}
    >
      <label className="flex items-center gap-2 cursor-pointer w-32 shrink-0">
        <input
          type="checkbox"
          checked={range.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="w-4 h-4 accent-white"
        />
        <span className="text-sm text-white/65">{OP_LABEL[op]}</span>
      </label>
      <NumberInput
        value={range.aMin}
        onChange={(v) => onChange({ aMin: v })}
        disabled={!range.enabled}
      />
      <span className="text-white/30 text-xs">to</span>
      <NumberInput
        value={range.aMax}
        onChange={(v) => onChange({ aMax: v })}
        disabled={!range.enabled}
      />
      <span className="text-white/42 font-mono w-4 text-center">
        {OP_SYMBOL[op]}
      </span>
      <NumberInput
        value={range.bMin}
        onChange={(v) => onChange({ bMin: v })}
        disabled={!range.enabled}
      />
      <span className="text-white/30 text-xs">to</span>
      <NumberInput
        value={range.bMax}
        onChange={(v) => onChange({ bMax: v })}
        disabled={!range.enabled}
      />
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      max={9999}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      className="w-16 px-2 py-1 bg-transparent border border-white/10 font-mono text-sm tabular-nums text-white text-center focus:outline-none focus:border-white disabled:cursor-not-allowed"
    />
  );
}
