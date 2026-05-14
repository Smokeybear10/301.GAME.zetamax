"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { ZpButton } from "@/components/ui/zp-button";

type Preview = {
  league_id: string;
  name: string;
  member_count: number;
  is_member: boolean;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number;
  peak_rating: number;
  is_provisional: boolean;
  best_score: number;
  best_started_at: string | null;
  runs_played: number;
};

type Phase =
  | { tag: "loading" }
  | { tag: "not-found" }
  | { tag: "join"; preview: Preview }
  | { tag: "ready"; preview: Preview; rows: LeaderboardRow[]; viewerId: string };

type Props = {
  slug: string;
};

export function LeagueDetailScreen({ slug }: Props) {
  const [phase, setPhase] = useState<Phase>({ tag: "loading" });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setPhase({ tag: "loading" });
    setError(null);
    const supabase = createClient();
    const [{ data: userRes }, previewRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("get_league_preview", { league_slug: slug }),
    ]);
    const viewerId = userRes.user?.id ?? null;
    if (previewRes.error) {
      setError(previewRes.error.message);
      setPhase({ tag: "not-found" });
      return;
    }
    const previewRows = (previewRes.data ?? []) as Preview[];
    if (previewRows.length === 0) {
      setPhase({ tag: "not-found" });
      return;
    }
    const preview = previewRows[0];
    if (!preview.is_member) {
      setPhase({ tag: "join", preview });
      return;
    }
    if (!viewerId) {
      setPhase({ tag: "not-found" });
      return;
    }
    const lbRes = await supabase.rpc("get_league_leaderboard", {
      league_slug: slug,
    });
    if (lbRes.error) {
      setError(lbRes.error.message);
      setPhase({ tag: "ready", preview, rows: [], viewerId });
      return;
    }
    setPhase({
      tag: "ready",
      preview,
      rows: (lbRes.data ?? []) as LeaderboardRow[],
      viewerId,
    });
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${slug}/join`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `error_${res.status}`);
        setJoining(false);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
    } finally {
      setJoining(false);
    }
  };

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/competitive/leagues/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard may be unavailable in private mode — silently no-op
    }
  };

  return (
    <main className="min-h-screen bg-black text-white antialiased">
      <ZpButton asChild variant="chip" className="absolute top-6 left-6">
        <Link href="/competitive/leagues" aria-label="Back to your leagues">← leagues</Link>
      </ZpButton>

      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
        {phase.tag === "loading" && (
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
            loading league…
          </p>
        )}

        {phase.tag === "not-found" && (
          <NotFoundState />
        )}

        {phase.tag === "join" && (
          <JoinPanel
            preview={phase.preview}
            joining={joining}
            error={error}
            onJoin={handleJoin}
          />
        )}

        {phase.tag === "ready" && (
          <ReadyPanel
            slug={slug}
            preview={phase.preview}
            rows={phase.rows}
            viewerId={phase.viewerId}
            error={error}
            copied={copied}
            onCopy={handleCopy}
          />
        )}
      </div>
    </main>
  );
}

function NotFoundState() {
  return (
    <div className="text-center max-w-md mx-auto py-20">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
        League not found
      </p>
      <p className="text-white/65 leading-relaxed mb-10">
        The link is wrong, expired, or you don&apos;t have access.
        Ask the person who shared it for a new link.
      </p>
      <ZpButton asChild variant="chip">
        <Link href="/competitive/leagues">your leagues</Link>
      </ZpButton>
    </div>
  );
}

function JoinPanel({
  preview,
  joining,
  error,
  onJoin,
}: {
  preview: Preview;
  joining: boolean;
  error: string | null;
  onJoin: () => void;
}) {
  return (
    <div className="text-center max-w-md mx-auto py-12 sm:py-20">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
        Invite
      </p>
      <h1 className="font-extralight text-4xl sm:text-5xl tracking-[-0.02em] leading-tight mb-3">
        {preview.name}
      </h1>
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42 mb-12">
        {preview.member_count} {preview.member_count === 1 ? "member" : "members"}
      </p>
      <ZpButton variant="primary" onClick={onJoin} disabled={joining}>
        {joining ? "Joining…" : "Join league"}
      </ZpButton>
      {error && (
        <p className="font-mono text-[11px] text-white/65 mt-4">{error}</p>
      )}
      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 mt-8">
        your scores will appear on this league&apos;s board
      </p>
    </div>
  );
}

function ReadyPanel({
  slug,
  preview,
  rows,
  viewerId,
  error,
  copied,
  onCopy,
}: {
  slug: string;
  preview: Preview;
  rows: LeaderboardRow[];
  viewerId: string;
  error: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/competitive/leagues/${slug}`
      : `/competitive/leagues/${slug}`;

  return (
    <>
      <header className="mb-10 sm:mb-12">
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-3">
          League
        </p>
        <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] leading-tight mb-2">
          {preview.name}
        </h1>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42">
          {preview.member_count} {preview.member_count === 1 ? "member" : "members"}{" "}
          · best over last 30 days
        </p>
      </header>

      <section className="mb-12 sm:mb-14">
        {rows.length === 0 ? (
          <p className="text-white/65 leading-relaxed">
            No qualifying runs in the last 30 days yet. Drill a ranked round to
            put yourself on the board.
          </p>
        ) : (
          <div className="border-t border-b border-white/10 divide-y divide-white/10">
            <AnimatePresence initial={false}>
              {rows.map((r, i) => {
                const isYou = r.user_id === viewerId;
                return (
                  <motion.div
                    key={r.user_id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    className={`flex items-center gap-3 sm:gap-4 px-3 py-3 ${
                      isYou
                        ? "bg-white/[0.06] border-l-2 border-white -ml-[2px]"
                        : "border-l-2 border-transparent -ml-[2px]"
                    }`}
                  >
                    <motion.span layout="position" className="font-mono tabular-nums text-white/42 w-7 text-right">
                      {i + 1}
                    </motion.span>
                    <span
                      className={`flex-1 min-w-0 truncate ${
                        isYou ? "text-white" : "text-white/85"
                      }`}
                    >
                      {isYou ? "You" : r.display_name ?? "Player"}
                      {r.is_provisional && (
                        <span
                          title="Provisional — first 30 rated rounds"
                          className="ml-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 align-middle"
                        >
                          provisional
                        </span>
                      )}
                    </span>
                    <span
                      className="hidden sm:inline font-mono tabular-nums text-white/42 text-[11px] whitespace-nowrap"
                      title="Best score in last 30 days"
                    >
                      best {r.best_score}
                    </span>
                    <span
                      className="hidden sm:inline font-mono tabular-nums text-white/42 text-[11px] whitespace-nowrap"
                      title="Runs played in last 30 days"
                    >
                      {r.runs_played} {r.runs_played === 1 ? "run" : "runs"}
                    </span>
                    <span
                      className="font-mono tabular-nums text-white text-lg w-14 text-right"
                      title="ELO rating"
                    >
                      {r.rating}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        {error && (
          <p className="font-mono text-[11px] text-white/65 mt-3">{error}</p>
        )}
      </section>

      <section className="mb-12">
        <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3">
          Share link
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <code className="flex-1 px-4 py-3 bg-white/[0.04] border border-white/10 font-mono text-xs text-white/65 truncate">
            {shareUrl}
          </code>
          <ZpButton variant="chip" onClick={onCopy}>
            {copied ? "copied" : "copy"}
          </ZpButton>
        </div>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 mt-3">
          anyone signed in with this link joins the league
        </p>
      </section>

      <section className="flex flex-col sm:flex-row gap-3">
        <ZpButton asChild variant="primary" className="text-center">
          <Link href="/competitive/ranked">Drill ranked</Link>
        </ZpButton>
        <ZpButton asChild variant="secondary" className="text-center">
          <Link href="/competitive/leagues">Your leagues</Link>
        </ZpButton>
      </section>
    </>
  );
}
