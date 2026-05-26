"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Settings } from "lucide-react";
import {
  setMusicDynamicStems,
  setMusicVolume,
  useMusicSettings,
} from "@/lib/audio/music-settings";

export function MusicSettingsMenu() {
  const { volume, dynamicStems } = useMusicSettings();
  const volumePct = Math.round(volume * 100);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Settings"
          className="inline-flex items-center justify-center text-white/55 hover:text-white border border-transparent hover:border-white/[0.12] px-2.5 py-1.5 transition-colors font-mono"
        >
          <Settings size={13} strokeWidth={1.5} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 min-w-[280px] bg-[#0c0c0c] border border-white/[0.12] p-4 font-mono shadow-2xl outline-none"
        >
          <div className="text-[10px] tracking-[0.24em] uppercase text-white/42 pb-2 mb-3 border-b border-white/[0.08]">
            settings
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label
                  htmlFor="music-volume"
                  className="text-[10.5px] tracking-[0.18em] uppercase text-white/55"
                >
                  music volume
                </label>
                <span className="text-[11px] tabular-nums text-white">
                  {volumePct}%
                </span>
              </div>
              <input
                id="music-volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-[10.5px] tracking-[0.18em] uppercase text-white/55">
                dynamic stems
              </span>
              <input
                type="checkbox"
                checked={dynamicStems}
                onChange={(e) => setMusicDynamicStems(e.target.checked)}
                className="h-4 w-4 accent-white cursor-pointer"
              />
            </label>

            <p className="text-[10px] leading-relaxed text-white/42">
              streak earns extra instruments. off = lobby mix only.
            </p>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
