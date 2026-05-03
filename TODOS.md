# TODOS

Source of truth for deferred work. Updated 2026-05-02 after eng review snapped MVP back to office-hours v1 scope, then again after reconciling DESIGN.md against the office-hours doc.

**v1 effort estimate: 2-3 weeks human time / 15-25 hours CC focused build.** The earlier "5 hours" number from the eng-review parallelization plan was too optimistic. Office-hours line 77 corrects: server-issued problem sequences + RLS for cross-user reads + OAuth + invite-token flow + mobile drill UX with auto-submit edge cases is closer to 15-25 CC hours.

---

## Pre-build blockers (do before writing code)

These are not roadmap items. They are gates. The eng review will not let v1 implementation proceed until these resolve.

### B1. Pick a name and register a domain — DEFERRED (2026-05-02)
- **Status:** Name decided (tentative): **Zetamax**. Domain registration deferred — building on localhost first.
- **When to revisit:** before sharing with friends remotely. Until then, Google OAuth works with `http://localhost:2301` callbacks; Supabase local stack handles the DB. Domain matters when you want a friend to click a link from their own machine.
- **Available candidates** (from the 2026-05-02 DNS check): `zetamax.app` (~$15/yr, HTTPS-default), `zetamax.io` (~$40/yr). Skip `zetamax.com` (squatter-parked).

### B2. Gate 1 — direct ask of 3 friends — DONE (effective)
- **Status:** Friends are already in (per user 2026-05-02). Demand signal is positive.
- **Note:** If you want a stronger sanity check, still send them the OpenQuant link (B3) — but if friends are pre-committed to your build, B3 becomes optional rather than gating.

### B3. Gate 2 — adjacent product test (OpenQuant) — OPTIONAL (downgraded)
- **Status:** Was a hard gate when demand was unvalidated. With friends already bought into the Zetamax build, the OpenQuant test is no longer a kill gate; it's a sanity check on differentiation. Run if you want, skip if not.
- **What (if running):** Send 3 friends [openquant.co/math-game](https://openquant.co/math-game): "Want to play this together this week? It's already built." Watch for 3+ days.
- **What it tells you (if running):** If they like OpenQuant, your Zetamax differentiation thesis is whatever OpenQuant lacks. That informs the v1 polish bar. If they don't engage with OpenQuant, your friend-group thesis is even stronger than baseline.

---

## v2 — Modes, custom ranges, weekly/all-time leaderboard

These were in the CEO-review MVP but moved out after the eng review snap-back to office-hours v1.

### Custom problem ranges + multiple modes
- **What:** Per-mode leaderboards. Default mode (Zetamac defaults) + extreme mode + competition prep modes (MATHCOUNTS / AMC / quant interview).
- **Why:** v1 ships ONE mode to keep the leaderboard from splintering before there's volume. v2 unlocks the obvious next move once core retention is proven.
- **Effort:** M (~half day CC). Per-mode ranking tables.
- **Depends on:** v1 launch and observed retention.

### Sprint mode (30s timed variant)
- **What:** Same engine, 30-second clock, denser problem cadence.
- **Effort:** S.

### Survival mode (3 lives, untimed)
- **What:** No clock. Wrong answer or `>2.5s` answer (config-tunable) costs a life.
- **Effort:** S.

### Daily Challenge mode
- **What:** Deterministic seed shared by all friends today (24-hour window). Same exact problem set for the whole friend group; leaderboard sorts on this set.
- **Why:** Strongest social hook on the modes list. "Did you do today's daily?" becomes the group chat ritual. Wordle-style social pull without Wordle's once-per-day gate — you can still drill freely outside the daily.
- **Effort:** S (~hours). Hash today's date → seed; convention-based or `runs.daily_seed_id` column.
- **Depends on:** v1 launch with `/competitive` leaderboard live.

### Compound / chained-ops mode
- **What:** Multi-op expressions with order-of-operations. `7 × 8 + 12 − 9 = ?`. Same exact-match validator; new generator that composes 2-3 op chains.
- **Why:** Tests parsing + sequencing — different cognitive skill than single-op drills. Lands with the math/quant audience.
- **Effort:** S. New generator family in `lib/drill/generator.ts`.

### Quant Interview mode (foundation; curated firm banks stay in v5)
- **What:** New problem family targeting the friend group's actual professional context: percentage estimation, log/exp, powers of 2, hex↔dec, modular arithmetic. Tolerance-based answers (`|answer − correct| ≤ tolerance`), not exact match.
- **Why:** Differentiates Zetamax from generic Zetamac. Speaks directly to the math/quant friend group. Was deferred to v5 as "curated interview question banks (Optiver/SIG/Akuna/Flow)" — the paid-tier curation stays in v5; the foundational quant problem family lives here.
- **Effort:** M. New generator + tolerance validator. Per-problem-type tolerance config.
- **Depends on:** v1 launch.

### Async Ghost Race
- **What:** Pick a friend's run from the leaderboard; drill the same seed; their answer-by-answer timeline plays back live next to yours. "You: 32, Mike's ghost: 38" ticks in real time.
- **Why:** Most novel mechanic on the v2 list. Synchronous-feeling competition without coordination — Mario Kart time-trial energy. Nobody else does it.
- **Effort:** M (~half day). Replay UI on top of the v1 `client_payload` timestamps.
- **Depends on:** v1 `runs.client_payload` includes per-problem timestamps. **Verify during v1 build that timestamp granularity is per-problem, not per-run** — retroactive backfill would cost a migration. (See also TODOS.md replay viewer note about adding the keystroke log to v1 now.)

### Weekly tournament bracket
- **What:** Friday-night elimination bracket among friends. Each round = a 120s drill. Lowest score eliminated. Final pairing crowns weekly champion.
- **Why:** Scarcity-based hype loop. Recurring weekly event to anchor retention beyond daily drilling.
- **Effort:** M-L. Bracket scheduling, per-round deadlines, automated advancement.
- **Depends on:** v1 launch, daily leaderboard adoption, ≥4 active friends.

### Streak counter + daily prompt
- **What:** Days-in-a-row drill counter visible on `/competitive` (e.g. "🔥 12"). Optional browser push at 9pm if you haven't drilled today. Pairs with the existing "Streak shield UI" entry below.
- **Why:** Cheapest retention mechanic in the book. Most likely answer to "how do friends come back day 2."
- **Effort:** S. Track `last_drilled_date` on user; increment on consecutive days. Browser push adds ~half day.
- **Depends on:** v1 launch.

### Weekly + all-time leaderboard tabs
- **What:** v1 ships daily-only. v2 adds weekly + all-time tabs to `/leaderboard`.
- **Why:** Office-hours premise #8 deferred these. Same underlying score data; low marginal cost once the daily tab is proven.
- **Effort:** S (~hours).

### `/me` page (history + sparkline)
- **What:** Dedicated `/me` route with run history table, last-30-days sparkline, today's-best-vs-friends panel.
- **Why:** v1 surfaces today's-best + lifetime-best inline on the post-round summary. Friends usually only care about today; longitudinal history is a power-user feature, not a wedge moment. Defer until v1 has retention.
- **Effort:** S-M (~half day). Runs query is already indexed; UI is a list + sparkline.
- **Depends on:** v1 launch and observed user demand for historical view.

### Friend management (unfriend, block, invite revocation)
- **What:** v1 has a read-only friend list with no remove/block/revoke affordances. v2 adds the UI: hover-to-remove on /friends, block button, manual invite-token revoke.
- **Why:** v1 is for a known friend group of 4-10 people. Abuse is handled by direct DB row deletion; the friction of building admin UI isn't worth it before public/larger groups exist.
- **Effort:** S (~hours). Reuses existing routes.
- **Depends on:** v1 launch, real abuse signal, OR opening to public/larger groups.

### Per-user timezones
- **What:** v1 hard-codes daily rollover at America/New_York midnight. v2 lets each user choose their local timezone for the "today" boundary, while leaderboards stay on a single canonical timezone (still ET) to avoid join complexity.
- **Why:** ET is right for a US-based math/quant friend group. International users see "today" flip mid-day. Defer until international users complain.
- **Effort:** S.

### Display name editing
- **What:** UI in /friends or settings to override the Google-imported display name. Currently inherited from Google profile and not user-editable.
- **Effort:** S.

---

## v2 — Diagnostics + 12×12 heatmap

These were in the CEO-review MVP but moved out. The diagnostic engine was the wedge in the Monkeytype-framing; in the friend-leaderboard framing, it's a v2 retention feature.

### `deriveTags(a, b, op)` — pure tagging function
- **What:** Per-problem tags: `skillTag` (10 buckets) + `patternTags[]` (carries, borrow, decade-cross, near-square, by-9, identity, etc.) + `difficulty 0..1`. Pure function; versioned; replayable over historical runs if schema improves.
- **Why:** Substrate for diagnostics, weak-pattern scoring, and Focus mode.
- **Effort:** S (~hours). Table-driven test suite.
- **Context:** Full rule list was in the previous DESIGN.md draft. Reproduce when implementing v2.

### Weak-pattern engine
- **What:** Rolling N=30 window per tag. Z-score against user's own distribution. Tag is "weak" if latency or error rate is in bottom quartile and sample size ≥20. Show top 3 in post-round summary with replay links.
- **Why:** Differentiation no other Zetamac clone has. Retention surface.
- **Effort:** M (~half day).
- **Depends on:** `deriveTags`.

### 12×12 multiplication fact heatmap
- **What:** Grid of all 144 single-digit multiplication facts, each cell colored by the user's median latency. Cold-start cells (sample <5) gray with sample count overlay.
- **Why:** "Holy shit, it knows what I'm bad at" moment. Screenshot-shareable.
- **Effort:** S.
- **Depends on:** Weak-pattern engine.

### Focus mode (adaptive resampling)
- **What:** Round generator weights problem selection 80/20 toward the user's current weak patterns.
- **Effort:** M.
- **Depends on:** Weak-pattern engine.

---

## v2 — Run replay + share artifacts

These were in the CEO-review MVP but moved out.

### Replay viewer (in-app scrubber)
- **What:** Per-run keystroke log → scrubbable timeline. Highlights wrong answers and slow problems. Substrate for v5 ranked validation.
- **Why:** Differentiating, screenshot-able, anti-cheat foundation.
- **Effort:** M (~half day). Requires `keystrokes: {key, t}[]` in the run payload from v1 — **add to v1 data model now to avoid retroactive backfill**.
- **Depends on:** v1 stores keystroke log per problem (cheap to add now).

### OG image embed for shared run URLs
- **What:** `/r/[runId]` and `/leaderboard?date=X` URLs unfurl in Discord/Slack/iMessage with a rich preview (score, percentile within friends, sparkline).
- **Why:** Distribution surface for friend-group → outside-friends spread.
- **Effort:** S (~hours). `@vercel/og` route.
- **Depends on:** v1 launch.

### Replay clip MP4 export
- **What:** 6-second MP4 export from the replay viewer.
- **Why:** Stronger social-share artifact than a static image.
- **Effort:** S-M. Codec choice (MP4 / animated PNG / WebM) decided at implementation.
- **Depends on:** Replay viewer.

### Streak shield UI
- **What:** "One weekday-skip per month, no shame." Show the shield in the streak counter; consume it transparently.
- **Effort:** S.

### Public profile pages
- **What:** `/u/[username]` route. PB sparklines, total runs, badges, embeddable widget.
- **Effort:** M.
- **Depends on:** v3+ once seasons exist to display.

---

## v3 — Real-time race rooms

### 1v1 / lobby live race
- **What:** Two or more players enter a race room. Same problem stream (server-issued seed). First to N correct wins. Optional voice input mode for race rounds.
- **Effort:** L (~1 week CC). WebSockets, presence, race-room state.
- **Depends on:** v1+v2 retention validation.

### Voice input (race-only)
- **What:** `SpeechSynthesis` reads each problem aloud; `SpeechRecognition` accepts spoken answers. Race-only because browser support is uneven; ranked stays keyboard.
- **Effort:** M.

---

## v4 — Discord/Slack integration

### Bot posts leaderboard updates
- **What:** Slash command + scheduled post that drops daily leaderboard scores into a configured friend-group channel.
- **Why:** Distribution amplification within the math/quant Discord ecosystem.
- **Effort:** M. New bot service + OAuth.
- **Depends on:** v1+v2 traction.

### Embeddable score widgets
- **What:** Iframe embed showing `@user`'s daily score / weekly PB. Drop into blogs, GitHub READMEs.
- **Effort:** S.
- **Depends on:** Public profile pages.

---

## v5 — Public global leaderboards + seasonal Glicko-2

### Server-issued ranked seeds + full validation
- **What:** Anti-cheat-hardened ranked mode for a public global leaderboard. Server issues seed at round start, client streams events, server reproduces and validates.
- **Effort:** M.

### Glicko-2 ratings per mode
- **What:** Per-mode rating updates after each ranked round.
- **Effort:** M (libraries on npm).

### 4-week seasons + decay
- **What:** Snapshot rating at season end, apply `rating' = rating - 0.3 * (rating - cohortMedian)`, reset season badges.
- **Effort:** M.

### Curated interview question banks (Optiver, SIG, Akuna, Flow, etc.)
- **What:** Per-firm distributions with their canonical scoring rules. Paid tier on top of the v2 Quant Interview foundation.
- **Effort:** L. Each firm needs research + tuning.
- **Depends on:** v2 Quant Interview mode + Stripe billing.

### Replay-against-pro
- **What:** Race a recorded pro's replay alongside your own.
- **Effort:** M.
- **Depends on:** Replay viewer + curated pro replay library.

### Subscription billing (Stripe)
- **What:** Monthly/annual subscription gating Interview tier features.
- **Effort:** M.

---

## Polish (any phase)

### Round route sound design
- **What:** Subtle audio feedback (correct, wrong, time low). Off by default.
- **Effort:** S.

### Operation-range modernization
- **What:** Revisit Zetamac defaults with user data. Possibly add curated presets.
- **Effort:** S, after telemetry.

### Apple Sign In
- **What:** Add to v1 auth options if iOS friends complain.
- **Effort:** S.
