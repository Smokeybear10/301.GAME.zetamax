import { ImageResponse } from "next/og";

// Branded share card for the home page. Matches the run/league OG generators:
// pure black, monospace accents, the zeta·max wordmark, with a row of sample
// problems so the link preview reads as "math drill" at a glance.
export const runtime = "nodejs";
export const alt = "Zetamax — timed mental math drill";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          color: "#ffffff",
          padding: "88px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: "0.34em",
            color: "#6f6f6f",
          }}
        >
          TIMED MENTAL MATH DRILL
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          <div
            style={{
              display: "flex",
              fontSize: 210,
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            <span style={{ fontWeight: 200 }}>zeta</span>
            <span style={{ fontWeight: 900 }}>max</span>
          </div>
          <div style={{ display: "flex", fontSize: 40, color: "#a6a6a6" }}>
            Two minutes. Mental arithmetic. Sign in to race your friends.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "40px",
            fontSize: 48,
            color: "#555555",
            fontFamily: "monospace",
          }}
        >
          <span>47 × 8</span>
          <span>·</span>
          <span>140 − 46</span>
          <span>·</span>
          <span>675 ÷ 9</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
