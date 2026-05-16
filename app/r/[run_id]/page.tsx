import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReplayScreen } from "./replay-screen";

type RunMeta = {
  mode: "classic" | "ranked" | "daily";
  dailyDate: string | null;
  score: number;
  correct: number;
  attempted: number;
  durationMs: number;
  displayName: string;
} | null;

async function loadRunMeta(runId: string): Promise<RunMeta> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  try {
    const admin = createAdminClient();
    const { data: run } = await admin
      .from("runs")
      .select("user_id, mode, daily_date, score, problems_correct, problems_attempted, duration_ms, validation_status")
      .eq("id", runId)
      .maybeSingle();
    if (!run || run.validation_status !== "ok") return null;

    const u = await admin.auth.admin.getUserById(run.user_id);
    const meta = (u.data?.user?.user_metadata ?? {}) as Record<string, string | undefined>;
    const displayName =
      meta.display_name?.trim() ||
      meta.name?.trim() ||
      meta.full_name?.trim() ||
      (u.data?.user?.email ? u.data.user.email.split("@")[0] : "") ||
      "Someone";

    return {
      mode: run.mode as "classic" | "ranked" | "daily",
      dailyDate: run.daily_date,
      score: run.score ?? 0,
      correct: run.problems_correct ?? 0,
      attempted: run.problems_attempted ?? 0,
      durationMs: run.duration_ms ?? 0,
      displayName,
    };
  } catch {
    return null;
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ run_id: string }>;
}): Promise<Metadata> {
  const { run_id } = await params;
  const meta = await loadRunMeta(run_id);

  if (!meta) {
    return {
      title: "ZETAMAX | Replay",
      description: "Two minutes. Mental arithmetic. Open and drill.",
    };
  }

  const modeLabel = meta.mode === "daily" && meta.dailyDate
    ? `Daily ${meta.dailyDate}`
    : meta.mode === "ranked"
      ? "Ranked"
      : "Classic";

  const headline = meta.mode === "daily"
    ? `${meta.displayName} finished ${modeLabel} in ${formatDuration(meta.durationMs)}`
    : `${meta.displayName} scored ${meta.score} on ${modeLabel}`;

  const accuracy = meta.attempted > 0
    ? `${Math.round((meta.correct / meta.attempted) * 100)}% accuracy`
    : null;
  const desc = [
    meta.mode === "daily" ? `${meta.correct} correct` : `${formatDuration(meta.durationMs)}`,
    accuracy,
    "Beat them →",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: `ZETAMAX | ${headline}`,
    description: desc,
    openGraph: {
      title: `ZETAMAX | ${headline}`,
      description: desc,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `ZETAMAX | ${headline}`,
      description: desc,
    },
  };
}

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ run_id: string }>;
}) {
  const { run_id } = await params;
  return <ReplayScreen runId={run_id} />;
}
