import { SiteHead } from "@/app/_components/site-head";
import { StatusBar } from "@/app/_components/status-bar";
import { KeyboardShortcuts } from "@/app/_components/keyboard-shortcuts";
import { MeScreen } from "./me-screen";

export const metadata = {
  title: "ZETAMAX | Profile",
};

export default function MePage() {
  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white antialiased">
      {/* Outer wrapper sized to the home/about pages so SiteHead's
          `sticky top-0` containing block spans the full doc. */}
      <div className="max-w-[1180px] mx-auto px-5 pt-5">
        <SiteHead current="me" />

        <div className="mx-auto px-1 sm:px-5 lg:px-11 py-10 lg:py-14 max-w-3xl">
          <header className="mb-10 sm:mb-12">
            <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-white/42 mb-3.5">
              Profile
            </p>
            <h1 className="font-extralight text-3xl sm:text-4xl md:text-5xl tracking-[-0.025em] leading-[1.05] mb-[18px]">
              Your account.
            </h1>
            <p className="text-white/75 text-base sm:text-[16.5px] leading-relaxed max-w-[60ch] font-light">
              Display name, sign-in, ratings, and the full stats picture for
              every drill you&apos;ve run on this device.
            </p>
          </header>

          <MeScreen />
        </div>

        <div className="px-1 sm:px-5 lg:px-11 pb-5">
          <StatusBar />
        </div>
      </div>
      <KeyboardShortcuts />
    </main>
  );
}
