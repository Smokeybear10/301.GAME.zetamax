"use client";

import { useCallback, useEffect, useState } from "react";
import {
  normalizePracticeConfig,
  PRACTICE_DEFAULTS,
  type PracticeConfig,
} from "@/lib/drill/config";

const STORAGE_KEY = "zetamax:practice-config";

function readConfig(): PracticeConfig {
  if (typeof window === "undefined") return PRACTICE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return PRACTICE_DEFAULTS;
    return normalizePracticeConfig(JSON.parse(raw));
  } catch {
    return PRACTICE_DEFAULTS;
  }
}

function writeConfig(config: PracticeConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // QuotaExceededError, private browsing — silent drop is fine
  }
}

/**
 * Hook for reading/writing the practice config.
 *
 * On first mount, returns PRACTICE_DEFAULTS (avoids hydration mismatch with
 * SSR), then loads the user's stored config from localStorage in an effect.
 * Updates persist immediately.
 */
export function usePracticeConfig(): {
  config: PracticeConfig;
  setConfig: (next: PracticeConfig) => void;
  resetConfig: () => void;
} {
  const [config, setConfigState] = useState<PracticeConfig>(PRACTICE_DEFAULTS);

  useEffect(() => {
    setConfigState(readConfig());
  }, []);

  const setConfig = useCallback((next: PracticeConfig) => {
    const normalized = normalizePracticeConfig(next);
    writeConfig(normalized);
    setConfigState(normalized);
  }, []);

  const resetConfig = useCallback(() => {
    writeConfig(PRACTICE_DEFAULTS);
    setConfigState(PRACTICE_DEFAULTS);
  }, []);

  return { config, setConfig, resetConfig };
}
