"use client";

import { useEffect, useState } from "react";

type Item = { id: string; label: string };

export function TocRail({ items }: { items: Item[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const nodes = items
      .map((i) => document.getElementById(i.id))
      .filter((n): n is HTMLElement => Boolean(n));

    const onScroll = () => {
      const y = window.scrollY + 140;
      let current = nodes[0]?.id ?? items[0]?.id;
      for (const n of nodes) if (n.offsetTop <= y) current = n.id;
      setActive(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  return (
    <aside className="sticky top-20 self-start">
      <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-white/42 pb-3 mb-3 border-b border-white/10">
        <span className="text-white">DOC</span> · zmx-about-v1
      </div>
      <ol className="space-y-1">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={
                "block text-[13.5px] py-1.5 font-light transition-colors " +
                (active === i.id ? "text-white" : "text-white/55 hover:text-white")
              }
            >
              {i.label}
            </a>
          </li>
        ))}
      </ol>
      <dl className="mt-7 pt-4 border-t border-white/[0.07] font-mono text-[10.5px] leading-7 tracking-[0.06em] text-white/42">
        <div className="grid grid-cols-[64px_1fr] gap-3">
          <dt>VERSION</dt><dd className="text-white">1.0</dd>
          <dt>UPDATED</dt><dd className="text-white">2026-05-14</dd>
          <dt>LOCALE</dt><dd className="text-white">en-US · ET</dd>
        </div>
      </dl>
    </aside>
  );
}
