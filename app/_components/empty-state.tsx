import Link from "next/link";
import { ZpButton } from "@/components/ui/zp-button";

/**
 * Cold-start primitive. Replaces the old "data insufficient" strings with a
 * quiet uppercase label, one warm directive, and an optional CTA — so an empty
 * panel teaches and invites instead of reading as a broken database query.
 */
export function EmptyState({
  label,
  directive,
  cta,
}: {
  label: string;
  directive: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="py-2">
      <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-white/42 mb-2.5">
        {label}
      </p>
      <p className="font-sans text-[12.5px] text-white/65 leading-[1.6] mb-3">
        {directive}
      </p>
      {cta && (
        <ZpButton asChild variant="chip" size="sm">
          <Link href={cta.href}>{cta.label}</Link>
        </ZpButton>
      )}
    </div>
  );
}
