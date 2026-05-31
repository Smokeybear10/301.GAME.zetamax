# Zetamax

A timed mental-arithmetic drill. Zetamac feel — open the page, drill for two minutes, score saves locally. Sign in if you want your score to count against your friends'.

Practice and Competitive share one drill engine; only what happens after the round differs.

## Modes

| Mode | Auth | Where score lives | What's special |
|------|------|-------------------|----------------|
| **Practice → Classic** | none | `localStorage` | Zetamac-compatible. Custom operand ranges, duration, keybinds. |
| **Practice → Learn** | none | `localStorage` | Generator weighted toward your weak tags. Pulls "today's focus" from your local stats. |
| **Competitive → Ranked** | Google | Postgres | Server-issued seed, server-validated score. Margin-aware ELO per round. |
| **Competitive → Daily** | Google | Postgres | Shared puzzle per day, one shot. Leaderboard ranks the 30-day mean. ET midnight rollover. |
| **Competitive → Leagues** | Google | Postgres | URL-shareable groups. Open join. Rank against just league members. |

## Stack

- Next.js 16 App Router + React 19, TypeScript
- Tailwind 3 + shadcn/ui (with a custom `ZpButton` primitive — see `DESIGN.md` for variants)
- Supabase (Postgres + Auth + RLS), service role for write paths
- Vitest for unit tests
- Deployed on Vercel; localhost dev runs on port **2301**

## Quick start

Requires **Node ≥ 20.9** (Next 16 + Vitest 4). The repo pins it via `.nvmrc` / `.tool-versions`, so `nvm use` or `mise install` picks the right version.

```bash
# install
npm install

# env — create .env.local with:
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...   (server-side only)

# run migrations against your Supabase project
supabase db push   # or apply files in supabase/migrations/ manually

# dev
npm run dev        # http://localhost:2301
```

Practice mode works without any Supabase setup — the drill engine and `localStorage` paths have zero backend dependency.

## Scripts

```bash
npm run dev          # next dev -p 2301
npm run build        # next build
npm run start        # next start
npm run lint         # eslint
npm run test         # vitest run
npm run test:watch   # vitest watch
```

## Project layout

```
app/
  page.tsx                       landing menu (Practice / Competitive / Profile)
  about/                         /about — design + Learn explainer
  practice/
    classic/                     drill screen, settings modal, post-round, mobile keypad
    learn/                       targeted drill + post-round
  competitive/
    ranked/                      ranked drill + leaderboard + ELO post-round
    daily/                       daily list + per-date drill + leaderboard
    leagues/                     league index + per-slug detail (OG image included)
  me/                            profile, stats, mul-fact heatmap, today's focus, sparkline
  r/[run_id]/                    public run permalink
  auth/                          Supabase Auth callback / login / error
  api/
    runs/{start,finish,forfeit}  ranked + daily run lifecycle
    leagues/{create,[slug]}      league CRUD

lib/
  drill/
    engine.ts                    round loop (status, advance, submit, scoring)
    generator.ts                 problem generator (Zetamac-compatible + tag targeting)
    derive-tags.ts               skill + pattern tag attribution (versioned)
    round-analytics.ts           per-op / per-tag analytics from a finished round
    validate.ts                  server-side answer-key check + sanity gates
    daily-seed.ts                deterministic seed for the day's puzzle
    rng.ts                       mulberry32 + string hash
    config.ts                    ZETAMAC_DEFAULTS, presets, keybinds, normalization
    precompute.ts                server-side answer-key precomputation
  practice-stats.ts              localStorage rollup (PB, totals, per-tag latencies)
  use-drill.ts                   React hook around the engine
  use-local-history.ts           local PB / daily / lifetime tracking
  use-practice-config.ts         settings persistence
  runs-api.ts                    typed client for /api/runs
  leagues/                       league client helpers
  supabase/                      ssr + service-role clients, middleware

supabase/migrations/             ordered SQL — schema, leagues, ELO, daily, cleanup jobs

components/ui/                   shadcn primitives + zp-button (the canonical button)
```

## How the drill works

The engine is ~150–200 LOC of pure TS. A `Drill` instance owns the timer, current problem index, typed answer, and emits keystroke/answer events. The input is an imperative `useRef`'d native `<input>` — keystroke-to-render must stay under 16 ms, so we read/write the value outside React's reconciler and only re-render on problem boundaries.

**Problem generation** is deterministic from `(seedHash, index, config)`. The Zetamac defaults: `2..100 + 2..100`, `2..100 - 2..100` (result ≥ 0), `2..12 × 2..100`, `(2..100) ÷ (2..12)`. Learn mode adds rejection-sampled tag targeting on top.

**Tag attribution** (`deriveTags`) produces a `skillTag` plus zero or more `patternTag`s per problem. Pattern tags trump skill tags. Versioned so old rounds can be re-tagged when rules improve.

## How competitive runs stay honest

Two-endpoint flow with a **server-only answer key**:

1. `POST /api/runs/start` — verifies the session, rejects if the user has an unfinished run younger than 125 s, generates a seed, precomputes the answer key, inserts a `runs` row with `validation_status='pending'`, returns `{ run_id, seed }`. The client uses the seed only to *render* problem text.
2. `POST /api/runs/finish` — verifies the session, reloads the row, checks wall-clock duration is within 120 s ± 2 s, compares each submitted answer to the server answer key, applies sanity gates (median inter-answer gap, no impossible streaks), writes the validated score with the service role.

The split + the single-active-run constraint defeats the "precompute every answer from the seed in milliseconds" attack.

Daily and ranked share this flow. Forfeit (refresh / close tab mid-run) is handled by `POST /api/runs/forfeit` plus a nightly cron that flips abandoned `pending` rows.

## Leaderboard

Friend / league reads go through a `SECURITY DEFINER` RPC (`get_friend_leaderboard`, plus league variants) that bypasses RLS but enforces membership internally. Direct `SELECT * FROM runs` is RLS-restricted to your own rows. Tie-breaker: same best score → earlier `started_at` ranks higher (first to reach the score wins). Daily window is fixed to America/New_York midnight.

Runs with `score < 5` are stored but excluded from the leaderboard — accidental-open rounds don't pollute rankings.

## ELO

Hybrid race + baseline. Margin-aware: a 47–30 win moves more than a 47–46 win. Rebaselined to 1200 in `20260503200000_elo_rebaseline_1200.sql`. See migrations `20260503020000_elo.sql` and `20260503190000_elo_baseline.sql` for the full update rule.

## Stats & Learn (local)

Practice rounds feed `practice-stats.ts`, which keeps a rolling per-tag latency distribution in `localStorage`. The Learn diagnostic uses log-transformed latencies with empirical-Bayes shrinkage and sample-size floors (≥30 total, ≥10 per tag, ≥70% confidence) before flagging a "today's focus" tag. Late-round events (last 10 s) are excluded so end-of-round panic doesn't taint the diagnosis.

Export / wipe at `/me → Stats`.

## Testing

```bash
npm run test
```

Coverage focuses on the engine, generator, tag attribution, validator, round analytics, local history, and the daily seed. UI is verified manually — see `DESIGN.md` for the state matrix.

## Reference docs

- `DESIGN.md` — v1 spec, design tokens, route IA, anti-cheat flow, button system
- `TODOS.md` — deferred roadmap (v2–v5)
- `PLAYBOOK.md` — the planning workflow that produced this repo
- `PROMPTS.md` — verbatim prompts from the design session

## Credit

Inspired by [Zetamac](https://arithmetic.zetamac.com/). Built to keep the keyboard feel intact while making the score stick.
