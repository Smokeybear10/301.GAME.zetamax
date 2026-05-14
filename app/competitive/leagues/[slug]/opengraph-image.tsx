import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSlug } from "@/lib/leagues/slug";

export const alt = "Zetamax league";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Open Graph card for a league. Renders at request time and is cached by
 * Discord/iMessage/Slack scrapers.
 *
 * Privacy: shows only league name + member count + a sign-in CTA. Member
 * names and scores are never leaked because OG bots fetch without auth.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let name = "Zetamax";
  let memberCount = 0;
  let exists = false;

  if (isValidSlug(slug)) {
    try {
      const admin = createAdminClient();
      const { data: league } = await admin
        .from("leagues")
        .select("id, name")
        .eq("slug", slug)
        .maybeSingle();
      if (league) {
        name = league.name;
        exists = true;
        const { count } = await admin
          .from("league_members")
          .select("*", { count: "exact", head: true })
          .eq("league_id", league.id);
        memberCount = count ?? 0;
      }
    } catch {
      // fall through to default card
    }
  }

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
        {/* Top-left wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0",
            fontSize: "32px",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          <span style={{ fontWeight: 200 }}>zeta</span>
          <span style={{ fontWeight: 900 }}>max</span>
        </div>

        {/* Center stack */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "32px",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.42)",
              fontWeight: 400,
            }}
          >
            {exists ? "League · invite" : "Zetamax"}
          </div>
          <div
            style={{
              fontSize: "144px",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontWeight: 200,
              maxWidth: "1056px",
              wordBreak: "break-word",
            }}
          >
            {exists ? name : "League not found"}
          </div>
          <div
            style={{
              fontSize: "32px",
              color: "rgba(255,255,255,0.65)",
              fontWeight: 300,
            }}
          >
            {exists
              ? `${memberCount} ${memberCount === 1 ? "member" : "members"} · sign in to play`
              : "The link is wrong, expired, or out of reach."}
          </div>
        </div>

        {/* Bottom-right divider tag */}
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
          <span>v1</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
