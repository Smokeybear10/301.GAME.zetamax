"use client";

import { useState } from "react";
import { ProfileSection } from "./profile-section";
import { StatsSection } from "./stats-section";

type Tab = "profile" | "stats";

export function MeScreen() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <>
      <nav
        className="flex gap-1 mb-10 sm:mb-12 border-b border-white/10"
        role="tablist"
        aria-label="Profile sections"
      >
        <TabButton
          active={tab === "profile"}
          onClick={() => setTab("profile")}
        >
          Profile
        </TabButton>
        <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
          Stats
        </TabButton>
      </nav>

      {tab === "profile" && <ProfileSection />}
      {tab === "stats" && <StatsSection />}
    </>
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-3 -mb-px font-mono text-[11px] tracking-[0.32em] uppercase border-b transition-colors ${
        active
          ? "text-white border-white"
          : "text-white/42 border-transparent hover:text-white/65"
      }`}
    >
      {children}
    </button>
  );
}
