import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { RaceScreen, type Opponent } from "./race-screen";

async function loadOpponent(runId: string): Promise<Opponent | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("runs")
    .select(
      "id, user_id, mode, seed, score, duration_ms, validation_status, client_payload",
    )
    .eq("id", runId)
    .maybeSingle();

  if (!run || run.validation_status !== "ok") return null;
  if (run.mode !== "ranked") return null;
  const events = (run.client_payload?.events ?? []) as Array<{
    submittedAt: number;
    correct: boolean;
  }>;
  if (events.length === 0) return null;

  const u = await admin.auth.admin.getUserById(run.user_id);
  const meta = (u.data?.user?.user_metadata ?? {}) as Record<string, string | undefined>;
  const displayName =
    meta.display_name?.trim() ||
    meta.name?.trim() ||
    meta.full_name?.trim() ||
    (u.data?.user?.email ? u.data.user.email.split("@")[0] : "") ||
    "Opponent";

  return {
    runId: run.id,
    seed: run.seed,
    durationMs: run.duration_ms ?? 120_000,
    score: run.score ?? 0,
    displayName,
    correctTimings: events.filter((e) => e.correct).map((e) => e.submittedAt),
  };
}

export const metadata: Metadata = {
  title: "ZETAMAX | Ghost Race",
};

export default async function RacePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const opponent = await loadOpponent(runId);
  return <RaceScreen opponent={opponent} />;
}
