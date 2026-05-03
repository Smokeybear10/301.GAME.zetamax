"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LeagueRow = {
  league_id: string;
  slug: string;
  name: string;
  member_count: number;
  joined_at: string;
};

type Phase = "loading" | "ready";

export function LeaguesScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_my_leagues");
    if (error) {
      setError(error.message);
      setLeagues([]);
    } else {
      setLeagues((data ?? []) as LeagueRow[]);
    }
    setPhase("ready");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/leagues/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `error_${res.status}`);
        setCreating(false);
        return;
      }
      router.push(`/competitive/leagues/${body.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <Link
        href="/competitive"
        aria-label="Back to competitive modes"
        className="absolute top-6 left-6 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
      >
        ← modes
      </Link>

      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
        <header className="mb-12 sm:mb-16">
          <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
            Leagues
          </p>
          <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] leading-tight">
            Where you and your friends compete.
          </h1>
        </header>

        <section className="mb-16">
          <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-5">
            Your leagues
          </h2>

          {phase === "loading" ? (
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
              loading…
            </p>
          ) : leagues.length === 0 ? (
            <p className="text-white/65 leading-relaxed">
              No leagues yet. Create one below, or paste an invite link from a
              friend into your address bar.
            </p>
          ) : (
            <ul className="divide-y divide-white/10 border-t border-b border-white/10">
              {leagues.map((l) => (
                <li key={l.league_id}>
                  <Link
                    href={`/competitive/leagues/${l.slug}`}
                    className="flex items-center justify-between gap-4 py-4 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-light tracking-[-0.01em] text-white group-hover:underline underline-offset-4 decoration-white/30 truncate">
                        {l.name}
                      </div>
                      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mt-1">
                        {l.member_count} {l.member_count === 1 ? "member" : "members"}
                      </div>
                    </div>
                    <span
                      className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 group-hover:text-white transition-colors"
                      aria-hidden="true"
                    >
                      open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-5">
            Create league
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="MIT Math Group"
              aria-label="League name"
              className="flex-1 px-4 py-3 bg-transparent border border-white/15 text-white placeholder-white/30 font-light focus:outline-none focus:border-white transition-colors"
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || name.trim().length < 1}
              className="px-7 py-3 bg-white text-black font-medium text-sm hover:bg-transparent hover:text-white border border-white transition-colors disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
          {error && (
            <p className="font-mono text-[11px] text-white/65 mt-3">{error}</p>
          )}
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 mt-4">
            you&apos;ll get a share URL — anyone with it can join
          </p>
        </section>
      </div>
    </main>
  );
}
