"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROUTES: Record<string, string> = {
  Enter: "/competitive/ranked",
  p: "/practice/classic",
  l: "/practice/learn",
  d: "/competitive/daily",
  m: "/me",
  a: "/about",
};

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        if (target.closest("a, button, input, textarea, select, [role='button'], [role='menuitem'], [role='switch']")) return;
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
