"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDrill,
  type Drill,
  type DrillState,
  type GeneratorConfig,
  type KeyBinds,
} from "@/lib/drill";

export type DrillModeOpts = {
  terminationMode?: "time" | "count";
  targetCount?: number;
  disableSkip?: boolean;
};

/**
 * React hook wrapping the drill engine.
 *
 * Re-renders on every animation frame so the timer display updates smoothly.
 * Despite the per-frame render, the drill engine itself does no React work —
 * its state lives in a closure, getState() is O(1), and the input field updates
 * are imperative (bypassing React's reconciler).
 *
 * Pass a stable seed string. When seed, durationMs, generatorConfig, or any
 * mode flag changes, a fresh drill is created (state resets).
 */
export function useDrill(
  seed: string,
  durationMs?: number,
  generatorConfig?: GeneratorConfig,
  keybinds?: KeyBinds,
  modeOpts?: DrillModeOpts,
): { state: DrillState; drill: Drill } {
  const terminationMode = modeOpts?.terminationMode;
  const targetCount = modeOpts?.targetCount;
  const disableSkip = modeOpts?.disableSkip;

  const drill = useMemo(
    () =>
      createDrill({
        seed,
        durationMs,
        generatorConfig,
        keybinds,
        terminationMode,
        targetCount,
        disableSkip,
      }),
    [seed, durationMs, generatorConfig, keybinds, terminationMode, targetCount, disableSkip],
  );

  // tick is a force-render counter; we don't use its value
  const [, forceRender] = useState(0);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      drill.tick();
      forceRender((n) => n + 1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [drill]);

  return { state: drill.getState(), drill };
}
