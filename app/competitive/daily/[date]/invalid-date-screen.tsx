import Link from "next/link";
import { ZpButton } from "@/components/ui/zp-button";

export function InvalidDateScreen({ badDate }: { badDate: string }) {
  return (
    <main className="min-h-screen bg-black text-white antialiased flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-white/42 mb-4">
          Daily · invalid date
        </p>
        <h1 className="font-extralight text-3xl sm:text-4xl tracking-[-0.02em] mb-4">
          That day&apos;s out of range.
        </h1>
        <p className="text-white/65 mb-8 leading-relaxed">
          You can play today&apos;s puzzle plus catch up on the past 30 days.
          {badDate ? <span className="block font-mono text-[11px] mt-2 text-white/42">requested: {badDate}</span> : null}
        </p>
        <ZpButton asChild variant="chip">
          <Link href="/competitive/daily">back to daily</Link>
        </ZpButton>
      </div>
    </main>
  );
}
