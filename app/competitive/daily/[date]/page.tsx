import { isValidDailyDate } from "@/lib/drill/daily-seed";
import { DailyDrillScreen } from "./daily-drill-screen";
import { InvalidDateScreen } from "./invalid-date-screen";

export const metadata = {
  title: "Daily — Zetamax",
};

export default async function DailyDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidDailyDate(date)) {
    return <InvalidDateScreen badDate={date} />;
  }
  return <DailyDrillScreen date={date} />;
}
