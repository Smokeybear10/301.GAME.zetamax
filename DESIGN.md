# Zetamax — Design Doc (v1)

> **Name (tentative): Zetamax.** Demand validation passed — friends are already in. Domain registration pending: `zetamax.com` is squatter-parked (skip). `zetamax.app` and `zetamax.io` returned no DNS records and are likely available; verify on a registrar (Cloudflare Registrar / Namecheap / Porkbun) before celebrating. Recommend `.app` for HTTPS-default + lower cost (~$15/yr vs ~$40/yr for `.io`).

## What it is

Two modes, surfaced explicitly on a landing menu:

- **Practice** — open page, drill, score saved locally. No sign-in. No backend calls. Exactly Zetamac. The default first-touch experience.
- **Competitive** — sign in, friend leaderboards, server-validated runs, daily ranking. The social/retention layer.

The drill itself is identical in both modes — same engine, same feel, same Zetamac-compatible defaults. What differs is what happens **after** the round: Practice writes to localStorage and stops; Competitive submits to the server and updates the leaderboard.

## Why

The user's math/engineering/quant friend group already drills mental math solo. They each play Zetamac (or equivalent) alone. There is no shared math activity today. The product invents a new behavior — async-shared drilling — using the lowest-friction mechanic possible: a leaderboard you see when you finish a run. Premise #2 of the office-hours diagnostic: "the differentiated wedge is friend leaderboards, not the drill itself."

**The Practice/Competitive split protects the Zetamac feel.** A friend who clicks the link and gets shoved through a sign-up wall before they can even drill is a lost user. Practice mode means anyone — friend, stranger, Reddit drive-by — gets the full drill experience with zero friction. Competitive is the opt-in upgrade for users who want their scores to count against their friends'.

The retention engine is the leaderboard. The engagement loop is the drill. The acquisition surface is Practice (no friction).

## Premises (from /office-hours, 2026-05-02)

1. **The Zetamac-native feel (continuous, on-demand, multi-round) is non-negotiable.** Wordle's once-per-day gate was tested and rejected.
2. **The differentiated wedge is friend leaderboards, not the drill itself.** The drill engine is commodity (~150 LOC). The leaderboard + auth + friend graph is where ~70% of v1 work lives.
3. **Build from scratch.** No existing fork (zetamac-multiplayer, v2v-Zetamac, reactle) is the right base.
4. **OpenQuant test is a pre-build kill gate, not parallel work.** See "Pre-build gates" below.
5. **v1 leaderboard is daily-only** (a daily-resetting *time window*, not a Wordle gate). Weekly and all-time tabs deferred to v2.
6. **v1 ships ONE problem-range mode** — Zetamac's defaults only. Custom modes deferred to v2.
7. **Voice input is deferred to v2 or later.**
8. **The product can grow beyond the initial friend group**, but v1 is built for one friend group. Generalization is post-launch.
9. **Practice and Competitive are separate first-class surfaces.** Practice is local-only and frictionless (no auth, no backend). Competitive requires sign-in and is where the friend leaderboard lives. The drill engine is shared; only the post-round wrapping differs. Surfaced on a `/` menu with two clear CTAs.

## Pre-build gates (do these BEFORE writing code)

Two zero-cost demand tests. Both must complete before any v1 code is committed.

**Gate 1 — direct ask.** Text 3 specific math friends (write the names down first):
> "I'm thinking about building a multiplayer Zetamac with persistent leaderboards for our friend group. Would you actually use it? Be honest."

Listen for *behavior signals* ("send me the link when it's done") not politeness ("cool idea"). If 2+ say "send me the link," v1 has demand. If ≤1, the premise needs reworking.

**Gate 2 — adjacent product test.** Send the same 3 friends [openquant.co/math-game](https://openquant.co/math-game):
> "Want to play this together this week? It's already built."

Watch for 3+ days. If they happily adopt OpenQuant, **kill v1** — friends already have what they need; you saved 2 weeks. If they don't engage, ask why; the answer is your differentiation thesis.

These two tests cost zero hours and give the strongest possible pre-build signal. Skipping them is the most expensive mistake possible at this stage.

## Core loops

Two loops, one per mode. The drill 120s step is identical; only the wrap differs.

**Practice loop** (no auth, no backend):
```
   /practice  ──▶  drill 120s  ──▶  score saved  ──▶  see your local PB
                                    to localStorage      ("today's best 39")
       │                                                        │
       ▲────────  drill again (same session, no gate)  ◀────────┘
```

**Competitive loop** (auth, backend):
```
   /competitive  ──▶  drill 120s  ──▶  score validated  ──▶  see your friend rank
   ("Play ranked")                       and persisted          ("1 Mike 47, 2 You 39")
        │                                                            │
        ▲────────  drill again (same session, no gate)   ◀───────────┘
```

The friend invite is a one-time side flow inside `/competitive` (`/competitive#friends`).

## v1 scope

### Routes (Next.js 15 App Router)

- `/` — **landing menu.** Two CTAs: "Practice" (left, default action) and "Competitive" (right, requires sign-in). Spare layout. No marketing copy beyond a tagline.
- `/practice` — **local-only drill.** Zetamac defaults. 120s timer. Auto-submit on exact-match. No auth, no Supabase. Round results saved to `localStorage`. Post-round summary shows local "Today's best" and "Lifetime best" computed from `localStorage`. Works offline.
- `/competitive` — **the social surface.** Requires sign-in (proxy redirects to `/auth/login` if unauthed). Shows the friend leaderboard at the top, "Play ranked round" CTA below. Friends list and invite-link generator inline. Daily leaderboard resets at America/New_York midnight.
- `/competitive#friends` (or inline section on `/competitive`) — invite link generator + accepted-friends list. **No remove-friend UI in v1** (abuse handled via direct DB row deletion). Unfriend, block, invite revocation deferred to v2.
- `/auth/*` — Supabase Auth template routes (sign-up, login, password reset). Used by Competitive mode. Practice mode never touches these.
- **No `/me` page in v1.** Practice surfaces lifetime best inline. Competitive surfaces friend rank inline.

### Mode comparison

| Aspect | Practice | Competitive |
|--------|----------|-------------|
| Auth required | No | Yes |
| Saves to | `localStorage` (browser-only) | Supabase Postgres (cross-device) |
| Network calls during play | None | None (drill stays local) |
| Network calls at round end | None | `POST /api/runs/finish` |
| Anti-cheat | N/A (you can't cheat against yourself) | Server-issued seed, server-only answer key, sanity gates |
| Leaderboard | Local PB only | Friend leaderboard (top 50 of friends + viewer's rank) |
| Friends | N/A | Invite-link flow, accepted-friends list |
| Post-round shows | Today's best, lifetime best (local) | Today's best, lifetime best, friend rank, sync status |
| Works offline | Yes | No (needs network for run validation) |
| What the user types in URL | `/practice` | `/competitive` |

**The drill engine is the same module** (`lib/drill/*`) in both modes. Practice and Competitive are two thin wrappers around it that handle different post-round paths.

### Drill engine (~150-200 LOC TS)
- **Problem generator**: Zetamac defaults — addition `2..100 + 2..100`, subtraction `0..100 - 0..100` (with `result ≥ 0`), multiplication `2..12 × 2..100`, division derived from multiplication (`a × b = c` → `c ÷ b = a`). Operations cycle weighted equally.
- **Server-issued seed, server-only answer key**: the client uses the seed *only to render problem text* (e.g. "47 + 38 = ?"). The answer key lives only on the server, keyed by `run_id`. **Reason:** if the client could derive answers from the seed, a bot could precompute the entire 120s of answers in milliseconds. The seed renders problems; the server holds the truth. This is the v1 anti-cheat substrate. See "Run integrity" below for the two-endpoint flow.
- **Auto-submit**: Zetamac's signature behavior. Trigger when `typedString === String(correctAnswer)` for the current problem — exact match, no prefix-checking, no future-problem awareness. The user can also press **Enter to manually submit**, which advances to the next problem **even if the answer is wrong** (counted as incorrect). Tab also skips (counted as incorrect).
- **120s countdown timer**: high-resolution `performance.now()` driven by `requestAnimationFrame`. Stops on time elapsed.
- **Score** = number of correct answers in the 120s window.
- **Imperative input**: the input field is a `useRef`'d native `<input>` whose value is read/written outside React's reconciler. Submission events bubble back into React on problem boundaries, never per-keystroke. **<16ms keystroke-to-render is non-negotiable**; React reconciliation per keystroke will blow the budget on cheap laptops.

### Backend (Supabase) — Competitive mode only

Practice mode never touches the backend. Everything below applies only to Competitive.

- **Postgres + Auth + RLS** in one platform. Free tier handles ~50K users.
- **Auth: Google OAuth single-click only.** No email/password, no magic link in v1. Login friction matters; Wordle famously had zero login. Apple Sign In is fast-follow if iOS friends complain.
- **Schema** (4 tables: `users` from Supabase Auth, `runs`, `friendships`, `invite_tokens`; see "Data model" below).
- **Cross-user leaderboard reads via security-definer RPC.** "Read all runs of my friends" cannot be expressed as a simple per-row RLS policy because the friendship check requires a join. Two correct approaches: (1) a `SECURITY DEFINER` Postgres function `get_friend_leaderboard(viewer_id, day)` that bypasses RLS but enforces the friendship check internally, called via Supabase RPC from the client. (2) A complex RLS policy on `runs` joining `friendships`. **v1 ships approach 1** — simpler, faster, easier to reason about. Per-row RLS still applies for direct `SELECT * FROM runs`; the RPC is the only path that returns friends' rows.
- **Single active-run constraint.** `POST /api/runs/start` rejects with 409 if the same `user_id` has an unfinished `runs` row younger than 125s. Prevents the "spawn many runs, precompute, submit fast" attack.
- **Score validation**: see "Run integrity" below for the two-endpoint flow (`runs/start` → `runs/finish`) with server-only answer key.

### Friend invite flow
- `/competitive#friends` → "Generate invite link" → `app.example.com/invite/{8-char-base32-token}`.
- **Single-use tokens, 7-day expiry** (per office-hours). Each friend the user wants to invite gets their own link. Reduces lateral spread risk; the inviter generates a fresh link per intended invitee.
- Invitee clicks link → land on `/invite/{token}` → "Sign in with Google to accept" → after auth, server consumes the token (`used_by`, `used_at` set) and inserts a `friendships` row with `status=accepted` (auto-accept; this is a friend group, not a public network — no approval flow needed in v1).
- Invitee redirects to `/competitive` with a one-time toast: "You and {inviter_name} are now friends. Drill to see your rank."

### Mobile + PWA
- Responsive layout. Math-friend phones during downtime is a v1 use case.
- Custom numeric keypad on touch devices.
- PWA `manifest.json` + service worker for "install to home screen." No offline mode in v1 — the product requires the network for leaderboards anyway.

### Deploy
- Vercel for the Next.js app. Auto-deploys on `git push origin main`.
- Supabase free tier. Migrations checked into `supabase/migrations/` via the Supabase CLI.
- Custom domain (~$12/yr).

### Out of v1 scope (deferred to v2+ in TODOS.md)
- 12×12 fact heatmap, weak-pattern diagnostics, replay scrubber, OG image embed, magic-link auth.
- Focus, Ranked, Interview modes.
- Glicko-2 ratings, 4-week seasons, badges.
- Voice mode.
- Public profile pages, embeddable widgets, Discord bot.
- Real-time race rooms.

## Data model

```ts
// Supabase Auth provides this; we do not own the table.
type User = {
  id: uuid;            // Supabase Auth user id
  email: string;       // from Google OAuth
  display_name: string;// defaults to Google given name; editable in v2 (no UI in v1)
  avatar_url: string;  // from Google
  created_at: timestamptz;
};

type Run = {
  id: uuid;                  // generated server-side at /api/runs/start
  user_id: uuid;             // FK -> auth.users
  seed: text;                // server-generated random seed; client uses for problem rendering only
  answer_key: jsonb;         // server-only column. List of correct answers for this run. NEVER returned to client. Could also live in a separate `run_keys` table for stricter isolation.
  score: int;                // server-recomputed at /api/runs/finish
  problems_attempted: int;
  problems_correct: int;
  started_at: timestamptz;   // server time at /api/runs/start
  completed_at: timestamptz; // server time at /api/runs/finish; null if abandoned
  duration_ms: int;          // typically 120000
  validation_status: text;   // "pending" | "ok" | "rejected_latency" | "rejected_wallclock" | "abandoned" | ...
  client_payload: jsonb;     // answers[], per-problem timestamps — kept for audit
};

type Friendship = {
  user_low: uuid;     // FK -> auth.users — the lexicographically lower uuid (canonicalized)
  user_high: uuid;    // FK -> auth.users — the higher uuid
  status: text;       // CHECK ('accepted'). v1 auto-accepts; enum reserved for v2 'pending'/'blocked'.
  created_at: timestamptz;
  invited_via_token: text; // null for direct (test fixtures), set otherwise
  // PRIMARY KEY (user_low, user_high)
  // CHECK (user_low < user_high)
};

type InviteToken = {
  token: text;        // 8 chars base32, primary key
  inviter_id: uuid;
  created_at: timestamptz;
  expires_at: timestamptz;  // 7 days post-creation
  used_by: uuid | null;     // null until redeemed
  used_at: timestamptz | null;
};
```

### Indexes (day-1)
- `runs(user_id, started_at DESC)` — for the user's lifetime-best lookup on /practice summary.
- `runs(started_at, score DESC) WHERE validation_status = 'ok'` — partial index supporting the daily leaderboard RPC. Without this, the friend-leaderboard query degrades quickly past ~10K runs/day.
- `friendships(user_low, user_high)` — covered by primary key.
- `invite_tokens(token)` — primary key.
- (No `runs(completed_at)` index in v1; not needed without an activity feed.)

### RLS policies + leaderboard RPC
```sql
-- runs: users read ONLY their own directly. Friend reads go through the RPC below.
CREATE POLICY runs_select_own ON runs FOR SELECT USING (user_id = auth.uid());

-- runs: insertion via authenticated route handler with service-role key. The RLS check
-- below is defense-in-depth in case a future codepath ever uses the user-scoped client.
CREATE POLICY runs_insert ON runs FOR INSERT WITH CHECK (user_id = auth.uid());

-- friendships: users read rows where they are a participant
CREATE POLICY friendships_select ON friendships FOR SELECT USING (
  user_low = auth.uid() OR user_high = auth.uid()
);
CREATE POLICY friendships_insert ON friendships FOR INSERT WITH CHECK (
  user_low = auth.uid() OR user_high = auth.uid()
);

-- invite_tokens: inviter reads their own; redemption is service-role only
CREATE POLICY invite_tokens_select ON invite_tokens FOR SELECT USING (inviter_id = auth.uid());
```

```sql
-- The leaderboard query. SECURITY DEFINER bypasses RLS but enforces the friendship
-- check internally. Called from the client via supabase.rpc('get_friend_leaderboard', ...).
CREATE FUNCTION get_friend_leaderboard(viewer uuid, day date)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, best_score int, best_started_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH friend_ids AS (
    SELECT CASE WHEN user_low = viewer THEN user_high ELSE user_low END AS friend_id
    FROM friendships
    WHERE (user_low = viewer OR user_high = viewer) AND status = 'accepted'
    UNION
    SELECT viewer  -- include the viewer themselves
  )
  SELECT
    r.user_id,
    u.raw_user_meta_data->>'name' AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    MAX(r.score) AS best_score,
    MIN(r.started_at) FILTER (WHERE r.score = MAX(r.score) OVER (PARTITION BY r.user_id))
      AS best_started_at  -- earliest start_at among rows tied at the user's max — used as tie-breaker
  FROM runs r
  JOIN auth.users u ON u.id = r.user_id
  WHERE r.user_id IN (SELECT friend_id FROM friend_ids)
    AND r.validation_status = 'ok'
    AND r.score >= 5  -- hide accidental-open runs from leaderboard pollution
    AND (r.started_at AT TIME ZONE 'America/New_York')::date = day
  GROUP BY r.user_id, u.raw_user_meta_data
  ORDER BY best_score DESC, best_started_at ASC  -- tie-breaker: first to reach the score wins
  LIMIT 50;  -- top 50 of friends + viewer; full friend list paginates in v2
$$;
```

The route handler for run validation (`POST /api/runs/finish`) uses Supabase **service role** for the score-write — score is server-truth, not user-claimed.

## Run integrity

The v1 anti-cheat baseline. Two-endpoint flow with server-only answer key. Sufficient for friend-group trust; hardening (full server-streamed problems, encrypted client, behavioral analysis) is a v3+ problem and only matters if public leaderboards open up.

```
client                              Next.js route handler                          Postgres
──────                              ───────────────────────                       ────────

(1) START
click "Drill"
  │
  ▼
POST /api/runs/start ───────▶ verify session (Supabase Auth)
                              reject 409 if user has unfinished
                                runs row younger than 125s
                              generate random seed (~16 bytes)
                              precompute answer_key[] from seed
                                using server-side rng + range rules
                              INSERT runs (status='pending',         ──▶ row
                                started_at=now(), seed, answer_key,
                                completed_at=NULL)
                              return { run_id, seed }
  ◀───────────────────────── 200

(2) PLAY (client side)
seed → render problem text only:
  rng = seedrandom(seed + index)
  problem_i = generateProblem(rng)
  // answers are NEVER derived client-side
buffer answers[] with t_ms timestamps

(3) FINISH
clock hits 0:00 (or user closes tab)
  │
  ▼
POST /api/runs/finish ──────▶ verify session
{ run_id,                     load runs row, verify user_id matches session
  answers: [                  verify status='pending'
    { index, value, t_ms },   verify (now() - started_at) within 120s ± 2s
    ...                       compare each answers[i].value to answer_key[index]
  ] }                         compute score = count of correct
                              apply sanity gates:
                                - median inter-answer gap > 50ms
                                - no streak of >5 answers <100ms apart
                              UPDATE runs SET                       ──▶ row
                                status = 'ok' or 'rejected_*',
                                completed_at = now(),
                                score, problems_correct, problems_attempted,
                                client_payload = { answers, timestamps }
                              return { score, rank, leaderboard_position }
  ◀───────────────────────── 200
```

**Why split into start + finish:** if the seed-to-answer derivation lived only on the client, a bot could request 1000 starts, precompute every answer in <100ms, submit a 100-correct score, and lap the leaderboard. The start/finish split + the **single-active-run constraint** (rate limit start to 1 per user per 125s) makes that attack expensive and detectable.

**Abandoned runs.** A run with `status='pending'` and `started_at < now() - 125s` is abandoned. A nightly cron flips them to `status='abandoned'`. Abandoned runs are excluded from the leaderboard.

**Score floor.** Runs with `score < 5` are stored but excluded from the leaderboard. Office-hours rationale: a user who opens `/practice` accidentally and lets the timer run out shouldn't pollute the friend leaderboard.

**Tie-breaker.** When two friends reach the same `best_score` for the day, the earlier `started_at` wins the higher rank — first to reach the score wins. Implemented in the leaderboard RPC's `ORDER BY best_score DESC, best_started_at ASC`.

**Daily rollover.** The "today" leaderboard window is `[America/New_York midnight today, America/New_York midnight tomorrow)`. UTC midnight rolls the leaderboard at 5pm PT / 8pm ET — bad UX for the US-based math/quant friend group who actually drill in the evening. ET midnight keeps "today" intact through US dinner hours. Single fixed timezone constant in v1; per-user timezones are a v2 problem.

## Edge cases and operational details

| Case | Behavior |
|------|----------|
| User refreshes mid-run | Run is abandoned. Browser-side state lost. v1 does not support resume. |
| User closes tab mid-run | Same as above. The submit happens at run end; no submit, no row. |
| Network drop during submit | Client retries with exponential backoff (5s, 30s, 5min) using a client-generated `idempotencyKey`. Server stores `(user_id, idempotency_key) → run_id` for 24h. |
| User runs the drill 50 times in one day | All 50 runs stored. The leaderboard shows their *best* score for the current day. No cap. |
| User changes display name mid-day | Leaderboard reflects the change immediately (display_name is read live, not snapshotted into runs). |
| Friend deletes account | Their runs become orphaned. Cascade-delete via Supabase Auth `ON DELETE CASCADE`. Their row vanishes from leaderboards. |
| Invite link expired | Generic "no longer valid" page; offer to ask the inviter for a fresh one. |
| Two browser tabs same user | Both can play independent rounds. Both submit. Both rows stored. Last-write-wins is fine for "best score today" queries. |
| Score validation fails | Client sees generic "submission failed, retry" toast. Internal log captures the specific gate that failed. The user is not told *why* the run was rejected (defense against gaming the gates). |
| User with no friends views leaderboard | Empty state: "Invite a friend to see scores ranked here. Your best today is X." |
| User with friends but no runs today | Leaderboard shows friends sorted by today's best; current user shown grayed at bottom: "Drill to enter today's leaderboard." |
| iOS Safari PWA install | Standard `apple-mobile-web-app-capable` meta + screenshot-based install prompt in menu. |

## Visual design direction

Monkeytype, Linear, Vercel. Monospace for problems and scores, sans for body, generous whitespace, dark default with light option, single accent color, no chrome during play. Directional anchor: serious, sharp, fast, quietly cool. Anti-slop.

A full `/design-consultation` pass is recommended pre-launch to formalize the design system. Specs below are the v1 minimum.

### Tokens (v1 minimum)

```
TYPOGRAPHY
  problem-display       monospace 96px / 96px line-height (mobile: 64px)
  score, timer          monospace 24px tabular-nums
  body                  sans 16px / 24px (system-ui or Inter)
  ui-label              sans 13px / 18px uppercase tracking-wide
  rank-number           monospace 32px tabular-nums

COLOR (dark default)
  --bg                  #0e0e0f   page background
  --surface             #16161a   cards, inputs, leaderboard rows
  --surface-2           #1d1d22   hover, raised
  --border              #26262e   row dividers
  --text                #f5f5f7   primary
  --text-muted          #8f8f97   timestamps, hints
  --accent              #00d09c   single accent (PB highlight, current user, focus ring)
  --error               #ff5d5d   validation rejection
  --success             #00d09c   correct answer flash (same as accent)

SPACING (4px base)
  4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
  generous whitespace > tight; prefer 24-48px between sections

RADIUS
  sm 4px (inputs)
  md 6px (cards, leaderboard rows — NOT 12px+ which reads bubbly/AI)
  full 9999px (avatar circles only)

MOTION
  fast    100ms ease-out — answer feedback, hover
  medium  200ms ease-out — page transitions
  no decorative motion. no page-load animations. no parallax.
```

### Information architecture per route

**`/` — landing menu**
```
┌──────────────────────────────────────────────────────┐
│              zetamax                                │
│        timed mental-math drill                        │
│                                                       │
│                                                       │
│      ┌────────────────┐    ┌────────────────────┐   │
│      │   Practice     │    │    Competitive     │   │
│      │                │    │                    │   │
│      │   no sign-in   │    │   sign in to play  │   │
│      │   needed       │    │   with friends     │   │
│      └────────────────┘    └────────────────────┘   │
│                                                       │
│         (faint footer text — credits / "v1")          │
└──────────────────────────────────────────────────────┘
```
Two CTAs, equal visual weight. Practice is the casual default — anyone can use it without an account. Competitive is the social/ranked surface — requires sign-in and is where the friend leaderboard lives. Both buttons trigger keyboard-first actions: pressing `1` or `p` selects Practice, `2` or `c` selects Competitive (faint hint at the bottom for power users).

**`/practice` — local drill (the moat)**
```
┌──────────────────────────────────────────────────┐
│ score 14                              0:47       │  ← top strip, monospace, muted
│                                                  │
│                                                  │
│                                                  │
│              7 × 8                                │  ← problem, large monospace, center
│                                                  │
│              5│                                   │  ← input, accent cursor, same font
│                                                  │
│                                                  │
│                                                  │
│  tab to skip · r replays last round    (faint)   │  ← bottom hint strip
└──────────────────────────────────────────────────┘
```
Hierarchy: problem first (big), input second, timer + score peripheral. Hint strip is so faint a power user reads it once and never looks again. **NO** sidebar, **NO** profile chip, **NO** settings cog visible during play. Pause = `Esc`. The "almost empty" rule. **No network calls during play.**

**`/practice` post-round summary** (modal overlay)
```
┌──────────────────────────────────────────────────┐
│              Round complete                       │
│                                                  │
│              39   correct of 42                   │
│                                                  │
│  Today's best       39   ↑ from 34               │
│  Lifetime best      52                            │
│  Accuracy           93%                           │
│  Mean latency      1.3s                           │
│                                                  │
│              [ Drill again ]                      │
│                                                  │
│  faint: sign in to track against friends →       │
└──────────────────────────────────────────────────┘
```
Today's best and lifetime best read from `localStorage`. The faint footer link nudges anonymous users toward Competitive without nagging. "Drill again" is the primary CTA (also Enter from the keyboard).

**`/competitive` — the wedge**

Single page that shows the leaderboard at the top and hosts the ranked drill flow inline. Auth-gated.

```
┌────────────────────────────────────────────────────────┐
│  Competitive                                            │
│                                                         │
│  Today  ·  Weekly (soon)  ·  All-time (soon)            │
│  resets in 4h 12m  (ET midnight)                        │
│                                                         │
│  1   ●  Mike Chen          47   played 2h ago           │
│  2   ●  Sarah Park         42   played 30m ago          │
│ ▶3   ●  You                39   played 1m ago           │  ← highlighted row
│  4   ●  Alex Kim           35   played 5h ago           │
│  5   ●  Priya R.           31   played 11h ago          │
│                                                         │
│              [ Play ranked round ]                      │  ← primary CTA
│                                                         │
│  ─────────  Friends ──────────                          │
│  [ Copy invite link ]   single-use · 7-day expiry       │
│  ●  Mike Chen           friends since Mar 12            │
│  ●  Sarah Park          friends since Apr 1             │
└────────────────────────────────────────────────────────┘
```
Hierarchy: rank > score > name > timestamp. Rank monospace, score monospace tabular, names regular weight. Current user's row subtly highlighted (`--surface-2` + 2px left border in accent). Top 50 of friends + viewer's rank in v1 (full pagination = v2). Daily window resets at America/New_York midnight.

**Empty state for users with no friends:** swap the leaderboard rows for a centered "Invite a friend to see the rankings" card with the invite-link button prominently displayed. The "Play ranked round" CTA stays visible — you can still play ranked rounds against yourself; they show only your own rank when you have no friends.

**Ranked round flow:** clicking "Play ranked round" calls `POST /api/runs/start`, gets a server-issued seed, transitions to the same drill screen as `/practice` but with a small "ranked" badge in the top strip. On round end, calls `POST /api/runs/finish`. Post-round summary shows the same fields as Practice plus "friend rank: 3 of 5 ↑ from 4 of 5" and a green "saved" badge.

### Interaction state coverage

| Surface | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| `/` (landing menu) | static — no loading | N/A | N/A | menu renders, both CTAs focusable | N/A |
| `/practice` round-start | brief skeleton (<200ms) of the round shell | N/A | "Couldn't load drill engine. Retry." | round renders, focus on input | N/A |
| `/practice` mid-round | N/A | N/A | client error → freeze + "Round broken, refresh to recover" toast | answer correct → input clears, problem advances; `--success` flash 100ms | N/A |
| `/practice` post-round | N/A | first-ever round → "First round complete. Drill again to set your lifetime best." | N/A | shows local today's best + lifetime best | N/A |
| `/competitive` (loading) | skeleton rows (5 placeholders) | "Invite a friend to see the rankings" + prominent invite-link button | "Couldn't load leaderboard. Retry." | sorted list, current user highlighted | friends who haven't played today shown grayed at bottom: "Hasn't played today" |
| `/competitive` ranked-round-start | brief skeleton during `POST /api/runs/start` | N/A | rate-limited (existing pending run) → resume; other → "Couldn't start ranked round" | drill begins with server seed | N/A |
| `/competitive` ranked-round-end | "syncing..." badge | N/A | network drop → exp backoff retry; final fail → "Couldn't save — try again" | green "saved" badge + friend rank delta | offline → events buffered, retry on reconnect |
| `/competitive#friends` | brief skeleton | "Generate an invite link to start playing with friends." with prominent button | inline error per action | invite-link copied → toast "Copied. Send it." | invite link expired → "Generate a new link" CTA |
| Sign-in | "Redirecting to Google..." | N/A | OAuth callback failure → `/?error=oauth_callback` with friendly explanation | redirect to last attempted destination | N/A |
| Invite landing `/invite/[token]` | brief skeleton | N/A | invalid/expired/maxed → "This link is no longer valid. Ask {inviter_name} for a new one." | already-friends → redirect to /competitive with toast; new friend → auto-friend + welcome toast | N/A |

**Empty states are designed.** "No items found." is banned. Every empty has warmth, a primary action, and context.

### User journey storyboard (the wedge moment)

```
  STEP                          | USER FEELS                | UI SUPPORTS IT
  ──────────────────────────────|──────────────────────────|─────────────────────────────────
  1. land on /                  | curious                   | two big buttons: Practice
                                |                           |   (no friction) + Competitive
  2. click "Practice"           | "let me try this"         | instant — no auth, no wait
  3. drill, score 24            | satisfaction              | green flash on correct,
                                |                           |   instant advance, no chrome
  4. drill again, score 28      | momentum                  | localStorage tracks PB
  5. notice "track against      | curiosity                 | faint footer link on post-round
     friends →" footer          |                           |
  6. click → sign up flow       | small friction OK now     | already invested, low resistance
                                |                           |   (drill IS good)
  7. land on /competitive       | "where are my friends"    | empty state: invite-link card
                                |                           |   + "Play ranked round" CTA
  8. text invite link to Mike   | hopeful                   | "Send this to Mike" copy
  9. Mike clicks, signs up,     | …                         | …
     drills 28
  10. you click "Play ranked"   | competitive intent         | drill, validates, saves
  11. you refresh /competitive  | THE moment                | row "1 Mike Chen 28 ··· 2 You 24"
                                 | with friend's name above   | your row subtly highlighted
                                 | yours                      |
  12. you play another, score   | reversal                   | "1 You 31 ··· 2 Mike 28"
      31
  13. you screenshot it         | bragging right             | clean layout, no PII besides
                                 |                            |   display names
```

Steps 11 and 12 are the entire product. Everything else is in service of producing them. **The Practice path (steps 2-5) is the on-ramp** — without it, users bounce at the auth wall before they ever experience the drill.

### Mobile responsive specs

| Breakpoint | Behavior |
|------------|----------|
| <640px (phone) | Problem display 64px (vs 96px desktop). Custom numeric keypad replaces system keyboard on `/practice` (a `<div>` keypad below the input that types into the input via JS, since the iOS keyboard takes 50% of the screen). Top strip stays at 24px monospace. Leaderboard rows compact: avatar smaller (24px), timestamp drops to "2h" instead of "2h ago", "Drill" CTA becomes sticky-footer. /competitive#friends: invite-link button full-width. |
| 640-1024px (tablet) | Desktop layout; adjust max-width for readability. |
| >1024px (desktop) | Centered max-width 720px on `/practice`, 880px on `/competitive`, `/competitive#friends`. Generous whitespace. |

Touch targets: ≥44×44px on mobile (WCAG 2.5.5). The custom keypad uses 56×56px keys.

### Accessibility specs

- **Keyboard nav:** every action reachable via Tab/Enter. Focus ring uses `--accent` 2px outline.
- **Screen reader:** `/practice` exposes the current problem via `aria-live="polite"` on a hidden `<div>`. Each correct/incorrect answer announces "Correct" / "Incorrect, the answer was X". Timer announces every 30 seconds.
- **Contrast:** all text/background pairs ≥WCAG AA (verify `--text-muted` on `--bg` is at least 4.5:1; the muted gray above passes).
- **Reduced motion:** respect `prefers-reduced-motion` — disable the green correct-answer flash, replace with an instant color swap.
- **Color-blind safety:** correct/incorrect feedback never relies on green/red alone; pair with the "Correct" / "Incorrect" text in screen-reader announcements and a glyph (✓ / ✗) on the visual feedback.

### AI-slop guardrails (locked)

The design must never ship with any of these:
1. 3-column feature grids ("Fast", "Social", "Diagnostic" with icon-circles).
2. Purple-to-blue gradient backgrounds.
3. Icons in colored circles as decoration.
4. Centered everything (centered hero, centered CTAs, centered sections).
5. Bubbly border-radius (>12px on cards/inputs).
6. Decorative blobs, floating circles, wavy SVG dividers.
7. Emoji in headings or as bullet points.
8. Colored left-border on cards (except the *current user* row on `/competitive`, which is the only intentional use).
9. Generic hero copy ("Welcome to X", "Unlock the power of...").
10. Cookie-cutter section rhythm (hero → 3 features → testimonials → pricing → CTA).
11. **Numbered prefixes on body section titles** (`§01 Practice`, `02 — Competitive`, `01. How Learn works`). Sequence numerals on prose section headings read AI-generated — they signal "machine designed" instead of "edited by a person." Use plain labels and rely on weight, brightness, hairline rules, marginalia, or a TOC for hierarchy. **Exception:** the `01 / 02 / 03` numerals on the home-page menu cards (Practice / Competitive / Profile) and the about-page footer (Drill → / Compete →) are *sequence indicators on navigation targets*, not section titles — those stay.

If a design proposal triggers any of these, the answer is "no, redo it."

## Buttons

Three canonical variants. Source of truth: `components/ui/zp-button.tsx`. **Do not improvise inline class strings** — every button across the app must use `<ZpButton>`. The component supports `asChild` so a `<Link>` child renders as a styled anchor without nested elements.

### `variant="primary"` — solid CTA

The dominant action on a screen. **One per view** if at all possible. Sentence-case label.

- Default: `px-7 py-3 text-sm` solid white on black, inverts on hover.
- `size="sm"`: `px-4 py-2 text-xs` for inline form actions (settings modal Save, profile name editor Save).

Examples: `Drill again`, `Continue with Google`, `Save`, `Create league`, `Join league`, `Drill ranked`, `Drill Classic`, `Start drilling`.

### `variant="secondary"` — outlined sibling

Sentence-case action that lives next to a primary CTA, or as a row of equal-weight nav buttons (e.g. /me's `Drill ranked / Daily / Your leagues`).

- Default: `px-7 py-3 text-sm` outlined `border-white/15`, fades up on hover.
- `size="sm"`: `px-4 py-2 text-xs` (settings modal Cancel, profile name editor Cancel).

Examples: `Modes`, `Daily`, `Your leagues`, `Cancel`, `Back to daily`, `Restart` (replay).

### `variant="chip"` — mono utility

Small uppercase mono. Use for: `← parent` back navigation on static pages, "drill this" / "Export JSON" / "Reset all stats" / "join a league →" in-card links, "copy" share buttons, anything that's not a primary action but needs to look tappable.

- Default: `px-4 py-2 text-[11px]` border + `bg-white/[0.04]` fill, lights up on hover.
- `size="sm"`: `px-3 py-1.5 text-[10px]` (TodaysFocus card "drill this →").

### `variant="floating"` — drill-screen back chip

Special-case fixed-position rounded chip used ONLY on the immersive drill screens (Classic, Learn, Ranked, Daily, Replay). Renders at `top-3 left-3` on mobile, `bottom-6 left-6` on desktop. Settings chip on the same screens uses the same variant with a `right-3` / `right-6` className override.

### Placement rules

- **Static pages** (`/`, `/about`, `/competitive`, `/practice`, `/me`, leagues, replay error states): back navigation is a `chip` variant at `absolute top-6 left-6` with copy `← {parent name}`. Don't let it fade into the background — the chip's bg fill makes it visible without dominating.
- **Drill screens**: back navigation is a `floating` variant. Position pattern is identical across all drill modes.
- **Post-round panels**: primary CTA + secondary back button as siblings in `flex gap-3`. Same pattern across Classic, Learn, Ranked, Daily.
- **Inline action rows** (e.g. /me bottom bar with Export JSON / Reset all stats): all `chip` variant.

### Anti-patterns (do not improvise)

- Inline class strings like `px-7 py-3 bg-white text-black ...` — use `<ZpButton variant="primary">` instead. Drift kills the system.
- Mixing `border-white/10` and `border-white/15` arbitrarily. The component handles this.
- Using `<button>` or `<Link>` directly for anything that's a button. Always wrap in ZpButton (use `asChild` for Links).
- Cooking up new sizes (`px-5 py-2`, `px-6 py-2`, `px-8 py-3`). The two `size` options exist for a reason.

## Performance budget (non-negotiable)

- **Keystroke-to-render: <16ms.** Imperative DOM, not React reconciliation. Tested against synthetic 1000-keystroke input on a throttled CPU.
- **Time-to-interactive (`/practice` route): <1.5s on a cold load over 4G.** The play route is fully static; auth state hydrates lazily from a cookie after first paint.
- **Problem-advance after correct submit: <8ms.**
- **Bundle size for the play route: <150KB gzipped.** Auth UI in a separate chunk.
- **No layout shift during play.** The problem panel is fixed-height.

If we miss any of these, we are not better than Zetamac and we have no reason to exist.

## v2+ roadmap (deferred)

See `TODOS.md` for the structured backlog. Highlights:
- v2: Custom problem ranges + multiple modes. Per-mode leaderboards. Weekly + all-time leaderboard tabs. Diagnostics (`deriveTags`, weak patterns, 12×12 fact heatmap). Replay viewer. OG embed for shared run links. Streak shield.
- v3: Real-time race rooms (1v1 / lobby). Voice input as an optional input mode for race rounds.
- v4: Discord/Slack integration (bot posts leaderboard updates to friend group's Discord).
- v5: Public global leaderboards + seasonal Glicko-2 ratings (only if friend-group product is working and external pull exists).

## Open questions

1. **Naming.** Pre-build blocker. Decide before code.
2. **Domain.** `.com` or `.app`? Buy after naming.
3. **Time-window granularity for the leaderboard in v1.** Office-hours recommended daily-only in v1 to keep the surface small; weekly/all-time as v2. Confirm at code start.
4. **Anti-cheat thoroughness.** v1 baseline (server-side seed reproduction + sanity gates) is sufficient for friend-group trust. Public leaderboards in v5 will need server-issued seeds and stronger gates.
5. **Apple Sign In.** Fast-follow if iOS friends complain. v1 ships Google OAuth only.

## Honest read

The strongest version of v1 is *the smallest possible product that produces the friend-leaderboard moment*. Drill, score, see your friend's name. That is the entire wedge. Everything in the v2+ roadmap is decoration until friends actually adopt v1. The kill gates exist precisely because shipping v1 in 3-5 hours of CC time is still expensive if friends would have happily adopted OpenQuant for free.

The keyboard feel is the moat the user already knows how to build. The leaderboard is the social hook he chose. Everything else is patience.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | SUPERSEDED | Drifted to Wordle/Monkeytype framing; reverted by eng review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | Step 0 caught drift; 8 architecture findings locked in; 40-path test coverage diagram produced; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 4/10 → 9/10. ASCII wireframes per route, full state coverage, journey storyboard, design tokens, mobile + a11y specs, AI-slop guardrails locked |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |

**SPEC REVIEW HISTORY:** 2 iterations on the previous (CEO-era) DESIGN.md, 5.5 → 8.5/10. Current v1 doc rebuilt around office-hours intent, then reconciled against the office-hours doc (2026-05-02 follow-up, 11 items folded). **Then revised again mid-build (2026-05-02 evening) to split the product into two distinct surfaces — Practice (local-only, no auth) and Competitive (auth + leaderboard).** The earlier "single /play route with auth-gated submission" model violated office-hours premise #1 (Zetamac feel = no friction); the new model puts the casual drill behind zero friction and reserves auth for the social layer.

**UNRESOLVED:** 0 decisions outstanding. Naming, domain, and the two kill gates (text 3 friends + OpenQuant test) are pre-build blockers, tracked in `TODOS.md`. Visual mockups deferred (design binary needs `OPENAI_API_KEY` — run `/design-shotgun` post-name-decision).

**EFFORT:** v1 is ~15-25 CC hours of focused build (2-3 weeks human time). The earlier 5h estimate was too optimistic.

**VERDICT:** **CEO + ENG + DESIGN CLEARED — ready to implement v1** *after* pre-build blockers (naming, demand kill gates) resolve.
