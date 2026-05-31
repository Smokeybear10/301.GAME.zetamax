"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site-url";

/**
 * Share a finished run. Uses the Web Share sheet on mobile / supported
 * browsers, falls back to copying the link on desktop. The shared URL renders
 * the run's OG card (app/r/[run_id]/opengraph-image.tsx) so the preview is
 * already branded — nothing else surfaces these cards today.
 */
export function ShareButton({
  runId,
  text,
  className = "",
}: {
  runId: string;
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = `${SITE_URL}/r/${runId}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Zetamax", text, url });
        return;
      }
    } catch {
      // User dismissed the share sheet — fall through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (rare); nothing actionable to do.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 hover:text-white/65 transition-colors ${className}`}
    >
      {copied ? "link copied ✓" : "share result ↗"}
    </button>
  );
}
