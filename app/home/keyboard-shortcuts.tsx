"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROUTES: Record<string, string> = {
  Enter: "/competitive/ranked",
  p: "/practice",
  d: "/competitive/daily",
  m: "/me",
  a: "/about",
};

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      const key = e.key === "Enter" ? "Enter" : e.key.toLowerCase();
      const dest = ROUTES[key];
      if (dest) {
        e.preventDefault();
        router.push(dest);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
