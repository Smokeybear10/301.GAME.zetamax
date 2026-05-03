import { describe, expect, it } from "vitest";
import {
  DAILY_WINDOW_DAYS,
  addDaysISO,
  dailySeedFor,
  isIsoDate,
  isValidDailyDate,
  last30DailyDates,
  todayET,
} from "@/lib/drill/daily-seed";

describe("dailySeedFor", () => {
  it("produces a stable string from an ISO date", () => {
    expect(dailySeedFor("2026-05-03")).toBe("daily-2026-05-03");
  });
});

describe("isIsoDate", () => {
  it("accepts well-formed YYYY-MM-DD", () => {
    expect(isIsoDate("2026-05-03")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects malformed strings", () => {
    expect(isIsoDate("2026-5-3")).toBe(false);
    expect(isIsoDate("2026/05/03")).toBe(false);
    expect(isIsoDate("garbage")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("rejects nonsense calendar dates that match the regex", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-15")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false); // not a leap year
  });
});

describe("addDaysISO", () => {
  it("adds and subtracts days within a month", () => {
    expect(addDaysISO("2026-05-03", 1)).toBe("2026-05-04");
    expect(addDaysISO("2026-05-03", -1)).toBe("2026-05-02");
    expect(addDaysISO("2026-05-03", 0)).toBe("2026-05-03");
  });

  it("crosses month boundaries", () => {
    expect(addDaysISO("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDaysISO("2026-05-01", -1)).toBe("2026-04-30");
  });

  it("crosses year boundaries", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles leap years correctly", () => {
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysISO("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDaysISO("2025-02-28", 1)).toBe("2025-03-01");
  });
});

describe("isValidDailyDate", () => {
  const today = "2026-05-03";

  it("accepts today", () => {
    expect(isValidDailyDate(today, today)).toBe(true);
  });

  it("accepts the oldest day in the window", () => {
    // 30-day window inclusive of today: today minus 29 = 2026-04-04
    expect(isValidDailyDate("2026-04-04", today)).toBe(true);
  });

  it("rejects the day before the window", () => {
    expect(isValidDailyDate("2026-04-03", today)).toBe(false);
  });

  it("rejects future dates", () => {
    expect(isValidDailyDate("2026-05-04", today)).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidDailyDate("garbage", today)).toBe(false);
    expect(isValidDailyDate("2026-13-01", today)).toBe(false);
  });
});

describe("last30DailyDates", () => {
  const today = "2026-05-03";

  it("returns 30 dates", () => {
    expect(last30DailyDates(today).length).toBe(DAILY_WINDOW_DAYS);
  });

  it("is ordered oldest first", () => {
    const dates = last30DailyDates(today);
    expect(dates[0]).toBe("2026-04-04");
    expect(dates[dates.length - 1]).toBe(today);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("matches isValidDailyDate for every entry", () => {
    for (const d of last30DailyDates(today)) {
      expect(isValidDailyDate(d, today)).toBe(true);
    }
  });
});

describe("todayET", () => {
  it("returns a YYYY-MM-DD string", () => {
    const t = todayET();
    expect(isIsoDate(t)).toBe(true);
  });
});
