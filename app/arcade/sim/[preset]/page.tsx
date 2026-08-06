import { notFound } from "next/navigation";
import { findFirmSim, FIRM_SIMS } from "@/lib/drill";
import { SimScreen } from "./sim-screen";

export function generateStaticParams() {
  return FIRM_SIMS.map((s) => ({ preset: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ preset: string }>;
}) {
  const { preset } = await params;
  const sim = findFirmSim(preset);
  return {
    title: sim ? `ZETAMAX | ${sim.name}` : "ZETAMAX | Arcade",
    description: sim?.blurb,
  };
}

export default async function SimPage({
  params,
}: {
  params: Promise<{ preset: string }>;
}) {
  const { preset } = await params;
  const sim = findFirmSim(preset);
  if (!sim) notFound();
  return <SimScreen sim={sim} />;
}
