"use client";

import Link from "next/link";
import { useState } from "react";
import { ProfileSection } from "./profile-section";
import { StatsSection } from "./stats-section";

type Tab = "profile" | "stats";

export function MeScreen() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 sm:py-16">
        <header className="flex items-center justify-between mb-8 sm:mb-10">
          <div>
            <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-2">
              You
            </p>
            <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.03em] leading-none">
              My profile
            </h1>
          </div>
          <Link
            href="/"
            className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
          >
            ← menu
          </Link>
        </header>

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
      </div>
    </main>
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
