"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ZpButton } from "@/components/ui/zp-button";

const NAME_MIN = 1;
const NAME_MAX = 32;

type AuthedUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  /** Whether display_name is a user-set custom value (vs OAuth/email default). */
  is_custom_name: boolean;
  avatar_url: string | null;
};

function deriveDisplayName(
  meta: Record<string, unknown>,
  email: string | null,
): { name: string | null; is_custom: boolean } {
  const custom =
    typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  if (custom.length > 0) return { name: custom, is_custom: true };

  const fromName = typeof meta.name === "string" ? meta.name.trim() : "";
  if (fromName.length > 0) return { name: fromName, is_custom: false };

  const fromFull =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fromFull.length > 0) return { name: fromFull, is_custom: false };

  if (email) return { name: email.split("@")[0], is_custom: false };
  return { name: null, is_custom: false };
}

type Rating = {
  rating: number;
  peak_rating: number;
  matches_played: number;
  last_match_at: string | null;
};

type DailySummary = {
  mean_duration_ms: number;
  runs_completed: number;
  runs_forfeited: number;
  played_today: boolean;
};

function formatDailyTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Phase =
  | { tag: "loading" }
  | { tag: "signed-out" }
  | {
      tag: "ready";
      user: AuthedUser;
      rating: Rating | null;
      daily: DailySummary | null;
    };

export function ProfileSection() {
  const [phase, setPhase] = useState<Phase>({ tag: "loading" });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = userRes.user;
      if (!u) {
        setPhase({ tag: "signed-out" });
        return;
      }
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const { name: display_name, is_custom: is_custom_name } = deriveDisplayName(
        meta,
        u.email ?? null,
      );
      const avatar_url =
        typeof meta.avatar_url === "string" ? meta.avatar_url : null;

      const [{ data: ratingRow }, { data: dailyRows }] = await Promise.all([
        supabase
          .from("user_ratings")
          .select("rating, peak_rating, matches_played, last_match_at")
          .eq("user_id", u.id)
          .maybeSingle(),
        supabase.rpc("get_my_daily_summary"),
      ]);

      if (cancelled) return;

      const daily =
        Array.isArray(dailyRows) && dailyRows.length > 0
          ? ({
              mean_duration_ms: Number(
                (dailyRows[0] as { mean_duration_ms: number }).mean_duration_ms ?? 0,
              ),
              runs_completed: (dailyRows[0] as { runs_completed: number })
                .runs_completed ?? 0,
              runs_forfeited: (dailyRows[0] as { runs_forfeited: number })
                .runs_forfeited ?? 0,
              played_today: (dailyRows[0] as { played_today: boolean })
                .played_today ?? false,
            } satisfies DailySummary)
          : null;

      setPhase({
        tag: "ready",
        user: {
          id: u.id,
          email: u.email ?? null,
          display_name,
          is_custom_name,
          avatar_url,
        },
        rating: ratingRow ?? null,
        daily,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.tag === "loading") {
    return (
      <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/42">
        loading…
      </p>
    );
  }

  if (phase.tag === "signed-out") {
    return <SignedOutCTA />;
  }

  const onUserChange = (next: AuthedUser) =>
    setPhase((prev) => (prev.tag === "ready" ? { ...prev, user: next } : prev));

  return (
    <ProfileCard
      user={phase.user}
      rating={phase.rating}
      daily={phase.daily}
      onUserChange={onUserChange}
    />
  );
}

function SignedOutCTA() {
  return (
    <div className="text-center py-12 sm:py-16 border border-white/10">
      <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
        Signed out
      </p>
      <h2 className="font-extralight text-2xl sm:text-3xl tracking-[-0.02em] mb-6 max-w-md mx-auto">
        Sign in to see your name and ELO.
      </h2>
      <p className="text-white/65 max-w-md mx-auto leading-relaxed mb-8 px-6">
        Profile shows your ranked rating and identity from your Google account.
        Practice stats below work without signing in.
      </p>
      <ZpButton asChild variant="primary">
        <Link href="/auth/login">Continue with Google</Link>
      </ZpButton>
    </div>
  );
}

function ProfileCard({
  user,
  rating,
  daily,
  onUserChange,
}: {
  user: AuthedUser;
  rating: Rating | null;
  daily: DailySummary | null;
  onUserChange: (next: AuthedUser) => void;
}) {
  const provisional = (rating?.matches_played ?? 0) < 30;
  const matches = rating?.matches_played ?? 0;
  const r = rating?.rating ?? 1200;
  const peak = rating?.peak_rating ?? 1200;

  return (
    <div className="space-y-12 sm:space-y-14">
      <section className="flex items-center gap-5">
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="w-16 h-16 rounded-full border border-white/10"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center font-mono text-white/42">
            {user.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <NameEditor user={user} onUserChange={onUserChange} />
      </section>

      <section>
        <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-5">
          Ranked
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10">
          <Stat label="rating" value={`${r}`} highlight />
          <Stat label="peak" value={`${peak}`} />
          <Stat label="matches" value={`${matches}`} />
          <Stat
            label="status"
            value={provisional ? "provisional" : "rated"}
          />
        </div>
        {rating === null && (
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mt-4">
            no ranked rounds yet — drill in competitive to start your rating
          </p>
        )}
        {provisional && rating && (
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mt-4">
            {30 - matches} provisional{" "}
            {30 - matches === 1 ? "round" : "rounds"} remaining
          </p>
        )}
      </section>

      <section>
        <h2 className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-5">
          Daily · last 30 days
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10">
          <Stat
            label="mean"
            value={
              daily && daily.runs_completed > 0
                ? formatDailyTime(daily.mean_duration_ms)
                : "—"
            }
            highlight={!!(daily && daily.runs_completed > 0)}
          />
          <Stat label="completed" value={`${daily?.runs_completed ?? 0}`} />
          <Stat label="forfeited" value={`${daily?.runs_forfeited ?? 0}`} />
          <Stat
            label="today"
            value={daily?.played_today ? "done" : "open"}
          />
        </div>
        {!daily?.played_today && (
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 mt-4">
            today&apos;s puzzle is still open
          </p>
        )}
      </section>

      <SignOutLink />
    </div>
  );
}

function SignOutLink() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }, [router]);

  return (
    <section className="pt-8 border-t border-white/10">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 hover:text-white transition-colors disabled:opacity-50"
      >
        {loading ? "signing out…" : "sign out"}
      </button>
    </section>
  );
}

function NameEditor({
  user,
  onUserChange,
}: {
  user: AuthedUser;
  onUserChange: (next: AuthedUser) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft if the parent's user changes (e.g. after save) and we open
  // the editor again.
  useEffect(() => {
    if (!editing) setDraft(user.display_name ?? "");
  }, [user.display_name, editing]);

  const startEdit = useCallback(() => {
    setDraft(user.display_name ?? "");
    setError(null);
    setEditing(true);
  }, [user.display_name]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      setError(`Name must be ${NAME_MIN}–${NAME_MAX} characters.`);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: trimmed },
    });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    onUserChange({ ...user, display_name: trimmed, is_custom_name: true });
    setSaving(false);
    setEditing(false);
  }, [draft, user, onUserChange]);

  const reset = useCallback(async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { display_name: null },
    });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    // Re-derive from the updated metadata
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const { name: nextName, is_custom } = deriveDisplayName(meta, user.email);
    onUserChange({ ...user, display_name: nextName, is_custom_name: is_custom });
    setSaving(false);
    setEditing(false);
  }, [user, onUserChange]);

  if (editing) {
    return (
      <div className="min-w-0 flex-1">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="Display name"
            aria-label="Display name"
            autoFocus
            disabled={saving}
            className="flex-1 px-3 py-2 bg-transparent border border-white/15 text-white placeholder-white/30 font-light text-lg focus:outline-none focus:border-white transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
          <div className="flex gap-2">
            <ZpButton
              variant="primary"
              size="sm"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </ZpButton>
            <ZpButton
              variant="secondary"
              size="sm"
              onClick={cancel}
              disabled={saving}
            >
              Cancel
            </ZpButton>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-2">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30">
            shown on every league leaderboard
          </p>
          {user.is_custom_name && (
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
            >
              reset to default
            </button>
          )}
        </div>
        {error && (
          <p className="font-mono text-[11px] text-white/65 mt-2">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="font-extralight text-2xl sm:text-3xl tracking-[-0.02em] truncate">
          {user.display_name ?? "Player"}
        </div>
        <button
          type="button"
          onClick={startEdit}
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/42 hover:text-white transition-colors"
        >
          edit
        </button>
      </div>
      {user.email && (
        <div className="font-mono text-[11px] text-white/42 truncate">
          {user.email}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-black p-4 sm:p-5">
      <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-2">
        {label}
      </div>
      <div
        className={`font-mono text-2xl sm:text-3xl tabular-nums tracking-[-0.01em] ${
          highlight ? "text-white" : "text-white/65"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
