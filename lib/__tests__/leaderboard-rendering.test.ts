import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { RankedLeaderboardTable, type RankedLeaderboardRow } from "@/app/competitive/ranked/ranked-leaderboard-table";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "viewer", email: "viewer@example.com" } } }) },
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));
vi.mock("@/app/_components/site-head", () => ({ SiteHead: () => null }));
vi.mock("@/app/_components/status-bar", () => ({ StatusBar: () => null }));
vi.mock("@/app/_components/keyboard-shortcuts", () => ({ KeyboardShortcuts: () => null }));
vi.mock("@/app/home/your-day", () => ({ YourDay: () => null }));
vi.mock("@/app/home/heatmap", () => ({ Heatmap: () => null }));
vi.mock("@/app/home/focus", () => ({ Focus: () => null }));
vi.mock("@/app/_components/transition-link", () => ({
  TransitionLink: ({ children, href }: { children?: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));

const league = { slug: "friends", name: "Friends", member_count: 9 };
const row: RankedLeaderboardRow = {
  user_id: "viewer", display_name: "Viewer", avatar_url: null,
  rating: 1250, peak_rating: 1300, is_provisional: false,
  best_score: 64, best_started_at: "2026-05-01T12:00:00Z",
  runs_played: 145, average_score: 42.7,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  const query = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  for (const method of [query.select, query.eq, query.order, query.limit]) {
    method.mockReturnValue(query);
  }
  mocks.from.mockReturnValue(query);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "get_my_leagues" ? [league] : [row], error: null,
  }));
});

describe("leaderboard rendering", () => {
  it("loads home standings from the lifetime stats RPC", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(mocks.rpc).toHaveBeenCalledWith("get_ranked_leaderboard_stats", { league_slug: "friends" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_league_leaderboard", expect.anything());
    expect(html).toContain('title="all-time best score">64');
    expect(html).not.toContain("Couldn&#x27;t load league standings");
  });

  it("does not describe failed league discovery as having no leagues", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Couldn&#x27;t load league standings");
    expect(html).not.toContain("no leagues yet");
    expect(html).not.toContain("no qualifying runs");
  });

  it("does not describe failed stats queries as an empty leaderboard", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "get_my_leagues"
      ? { data: [league], error: null }
      : { data: null, error: { message: "database unavailable" } });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Couldn&#x27;t load league standings");
    expect(html).not.toContain("no qualifying runs");
    expect(html).not.toContain("database unavailable");
  });

  it("preserves the empty state when league discovery succeeds with no memberships", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("no leagues yet");
    expect(html).not.toContain("Couldn&#x27;t load league standings");
  });

  it("renders lifetime rounds, best score and average alongside Elo", () => {
    const html = renderToStaticMarkup(React.createElement(RankedLeaderboardTable, {
      rows: [row], viewerId: row.user_id,
    }));
    expect(html).toContain("All-time ranked results");
    expect(html).toContain(">145</td>");
    expect(html).toContain(">64</td>");
    expect(html).toContain(">42.7</td>");
    expect(html).toContain(">1250</td>");
  });
});
