import { ReplayScreen } from "./replay-screen";

export const metadata = {
  title: "Replay — Zetamax",
};

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ run_id: string }>;
}) {
  const { run_id } = await params;
  return <ReplayScreen runId={run_id} />;
}
