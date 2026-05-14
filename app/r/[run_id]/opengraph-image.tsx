import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Zetamax run";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type RunCard =
  | { kind: "ok"; mode: "classic" | "ranked" | "daily"; dailyDate: string | null; score: number; correct: number; attempted: number; durationMs: number; displayName: string }
  | { kind: "missing" };

async function loadRun(runId: string): Promise<RunCard> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return { kind: "missing" };
  try {
    const admin = createAdminClient();
    const { data: run } = await admin
      .from("runs")
      .select("user_id, mode, daily_date, score, problems_correct, problems_attempted, duration_ms, validation_status")
      .eq("id", runId)
      .maybeSingle();
    if (!run || run.validation_status !== "ok") return { kind: "missing" };

    const u = await admin.auth.admin.getUserById(run.user_id);
    const meta = (u.data?.user?.user_metadata ?? {}) as Record<string, string | undefined>;
    const displayName =
      meta.display_name?.trim() ||
      meta.name?.trim() ||
      meta.full_name?.trim() ||
      (u.data?.user?.email ? u.data.user.email.split("@")[0] : "") ||
      "Someone";

    return {
      kind: "ok",
      mode: run.mode as "classic" | "ranked" | "daily",
      dailyDate: run.daily_date,
      score: run.score ?? 0,
      correct: run.problems_correct ?? 0,
      attempted: run.problems_attempted ?? 0,
      durationMs: run.duration_ms ?? 0,
      displayName,
    };
  } catch {
    return { kind: "missing" };
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function Image({ params }: { params: Promise<{ run_id: string }> }) {
  const { run_id } = await params;
  const card = await loadRun(run_id);

  const hero = card.kind === "ok"
    ? card.mode === "daily" ? formatDuration(card.durationMs) : String(card.score)
    : "—";

  const eyebrow = card.kind === "ok"
    ? card.mode === "daily" && card.dailyDate
      ? `DAILY · ${card.dailyDate} · ${card.displayName.toUpperCase()}`
      : `${card.mode.toUpperCase()} · ${card.displayName.toUpperCase()}`
    : "RUN UNAVAILABLE";

  const accuracy = card.kind === "ok" && card.attempted > 0
    ? Math.round((card.correct / card.attempted) * 100)
    : null;

  const subtitle = card.kind === "ok"
    ? card.mode === "daily"
      ? `${card.correct} correct${accuracy !== null ? ` · ${accuracy}% accuracy` : ""}`
      : `${accuracy !== null ? `${accuracy}% accuracy · ` : ""}${formatDuration(card.durationMs)}`
    : "this link is wrong, expired, or out of reach.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: "32px",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          <span style={{ fontWeight: 200 }}>zeta</span>
          <span style={{ fontWeight: 900 }}>max</span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "28px",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.42)",
              fontWeight: 400,
              maxWidth: "1056px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontSize: "240px",
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              fontWeight: 200,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hero}
          </div>
          <div
            style={{
              fontSize: "32px",
              color: "rgba(255,255,255,0.65)",
              fontWeight: 300,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "20px",
            color: "rgba(255,255,255,0.30)",
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          <span>two-minute mental-arithmetic</span>
          <span>{card.kind === "ok" ? "drill it →" : "v1"}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
