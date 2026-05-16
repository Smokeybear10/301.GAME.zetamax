import { LeagueDetailScreen } from "./league-detail-screen";

export const metadata = {
  title: "ZETAMAX | League",
};

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LeagueDetailScreen slug={slug} />;
}
