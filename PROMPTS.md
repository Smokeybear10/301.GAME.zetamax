# Prompts — verbatim

Every prompt I typed in the Zetamac v1 design session, 2026-05-02. AskUserQuestion answers included since those captured real decisions even though they were clicks, not typed text.

---

## 1. One-time setup

```
set default claude effort to max
```

## 2. Per-session effort + design doc

```
/effort
```

```
make a disgn  doc 
Yes. I think the product should be: Monkeytype for mental math, not "Duolingo but arithmetic."

The professional version is fast, clean, measurable, and competitive. The gamified version is not cartoons and coins. It is ranks, seasons, personal bests, diagnostics, daily seeded challenges, and clear proof that you are getting faster.

Product Thesis
Build a Zetamac successor where the core promise is:

"Train mental math speed like an athlete: timed reps, clean feedback, fair competition, and diagnostics that tell you exactly what to fix."

The gap is real. Original Zetamac is wonderfully bare. Newer tools like ZetaRithm add accounts and leaderboards. App-store competitors add streaks, lessons, and mobile gamification. But there is still room for a serious, beautiful, keyboard-first web product with deep stats.

Proof Map

People already use Zetamac because it is fast, hard, and benchmarkable.
Serious users do not only want entertainment; they want measurable improvement.
Timed arithmetic is basically retrieval practice, and retrieval practice is strongly supported for learning and retention: Roediger & Karpicke, 2006.
Gamification can improve motivation in math, but it works best when balanced with mastery and personal progress, not just public ranking: 2025 math gamification meta-analysis.
Therefore, the winning product is not "more game stuff." It is better practice loops plus tasteful competition.
If the app can tell users, "you are losing time on 7x8, borrowing subtraction, and division by 9," it becomes more valuable than a score screen.
If users can compete on identical daily problem seeds, the leaderboard feels fair.
If sessions are short, repeatable, and satisfying, users come back.
Core Constructions
These are the primitives I'd design around:

Problem
A generated arithmetic item: operands, operation, answer, difficulty tags, pattern tags.

Round
A timed session with mode, duration, seed, problem list, answer events, score, accuracy, latency.

Mode
A ruleset: Classic Zetamac, Daily Challenge, Focus Drill, Survival, Ranked, Interview Prep.

Seed
The thing that makes competition fair. Same seed means same problem stream.

Answer Event
Every submitted answer with timestamp, correctness, latency, typed digits, and whether it was corrected.

Skill Tag
Labels like single-digit multiplication, carry addition, borrow subtraction, division facts, near-square, percentage.

Weak Pattern
A skill tag or exact fact where the user is slow or inaccurate.

Rating
Separate ranked scores by mode, not one giant global number.

Replay
A compact reconstruction of the round for anti-cheat, analysis, and sharing.

Best Game Loops
The main loop:

Play round → get score → see diagnosis → do targeted drill → replay ranked/daily → improve PB
The daily loop:

One seeded challenge per day → compare with friends/cohort → get one recommended repair drill
The long-term loop:

Weekly rank → skill graph improves → unlock harder divisions/modes → season reset keeps stakes fresh
Modes I'd Build
Classic
The Zetamac-compatible 120-second mode. This is the anchor.

Daily
Everyone gets the same problems. Best for sharing and leaderboards.

Focus
The app drills your weak areas.

Sprint
30 seconds, high dopamine, good for quick sessions.

Survival
One mistake or too-slow answer costs a life.

Ranked
Server-seeded, anti-cheat checked, leaderboard eligible.

Interview
Quant/consulting presets: arithmetic, percentages, estimation, fractions, 80-in-8 style challenges.

Gamification Style
Use:

personal bests
percentile bands
weekly seasons
private friend groups
daily seeded challenges
clean badges for real achievements
streaks as "4 of 7 days," not fragile daily shame
post-round share cards
Avoid:

childish coins
noisy animations during play
global leaderboard as the whole identity
rewards that distract from getting faster
Voice Decision
Voice should exist, but not be the ranked default.

Use keyboard as the serious competitive input. Add voice as:

accessibility mode
spoken-question mode
experimental hands-free mode
fun practice variant
Reason: speechSynthesis is broadly usable, but browser speech recognition is inconsistent and not baseline across major browsers, per MDN SpeechRecognition. Voice is cool; keyboard is fair and fast.

Technical Shape
Frontend: static web app/PWA.

Core engine: deterministic local problem generator, tiny state machine, keyboard-first input.

Backend later: accounts, leaderboard validation, seeded rounds, private groups, ranked seasons.

Anti-cheat basics:

server creates ranked seed
server records start/end window
client submits answer events
server recomputes score
reject impossible timings
keep unverified scores separate
MVP
Build only this first:

Classic timed Zetamac mode
keyboard input that feels instant
local history
round results with score, accuracy, average latency
problem tagging
"slowest patterns" diagnosis
daily seeded challenge
simple leaderboard later
That MVP is already more product than a clone, because the diagnosis is the wedge.

My honest read: the strongest version is professional performance software that happens to be addictive, not a game that happens to contain math.
```

## 3. CEO review

```
/plan-ceo-review
```

### Picks made via AskUserQuestion during /plan-ceo-review

| Question | Answer |
|----------|--------|
| Review mode | Selective Expansion + Approach B |
| Audience priority | Flip: mass-market first, traders as paid tier |
| Replay viewer in MVP | Add to MVP |
| Friend cohorts in MVP | Add to MVP |
| Mobile PWA in MVP | Add to MVP |
| Discord embed in MVP | Add to MVP |
| Next review | Run /plan-eng-review now |

## 4. Eng review (Claude auto-invoked /plan-eng-review based on the next-review answer)

### Picks made via AskUserQuestion during /plan-eng-review

| Question | Answer |
|----------|--------|
| Reconcile drift (CEO vs office-hours) | Snap back to /office-hours v1 |
| Next review | Run /plan-design-review now |

## 5. Design review (Claude auto-invoked /plan-design-review based on the next-review answer)

### Picks made via AskUserQuestion during /plan-design-review

| Question | Answer |
|----------|--------|
| Mockup scope | Mockups for /play AND /leaderboard |

## 6. Reconcile against the office-hours doc

```
look at the other design doc i should ahbe two. does that desing doc adcd anyhting
```

### Pick made via AskUserQuestion

| Question | Answer |
|----------|--------|
| Reconcile | Fold all 11 items into DESIGN.md |

## 7. Capture the framework

```
can you actually make a seperate md including all the prompts ive given you to get you up to this point lie for future projects i wnat to have this framework out
```

```
can you give me the actual prompts
```

## 8. Post-planning, pre-code

```
ook what gstack stuff shohuld i use now
```

(Claude says: nothing right now. Go pick a name + run kill gates. Optionally `/cso` and `/design-shotgun` while you wait.)

```
Name tentatively is zetaprime i already hav my firends come in
```

(Friends already in = demand validation effectively passed. Claude checks domain availability via whois/dig.)

```
no need to make nthe app rn i just want to do loclhost
```

(Skip domain registration. Localhost-only dev for now.)

```
explain /freeze and /guard
```

(Tooling question — informational, not actionable.)

```
tell me what i should do then
```

```
what is scaffolding
```

```
i wnat this to be localhost 2301 default
```

```
get started with scaffolding
```

(Claude inspects the directory and discovers an existing Next.js + Supabase scaffold already created the night before. Halts before scaffolding over it.)

```
do C
```

### Pick made via AskUserQuestion (cleanup options)

| Question | Answer |
|----------|--------|
| Cleanup | Option C: rename folder Zetamac → Zetaprime, move scaffold contents up, single git repo at root |

(Claude executes the 7-step cleanup. Sets dev script to `next dev -p 2301`. Single initial commit with both planning docs and code.)

```
before you do that update the playbook prompt md files
```

(this prompt — the user wants the framework files updated to reflect post-planning cleanup before any code is written)

---

## Reusable template (strip the project-specific stuff)

For the next project, the typed prompts reduce to roughly this sequence:

```
1. /office-hours          (Claude Code slash command)
                          Run this FIRST before writing any design doc.
                          Output lands in ~/.gstack/projects/{slug}/.

2. /effort                (per-session)

3. make a design doc based on the /office-hours output at
   ~/.gstack/projects/{slug}/{user}-{branch}-design-{datetime}.md
   
   [paste your thesis here, or just point at the office-hours doc]

4. /plan-ceo-review

5. (answer AskUserQuestions; recommended defaults in PLAYBOOK.md)

6. (Claude offers /plan-eng-review next; pick "Run /plan-eng-review now")

7. (answer AskUserQuestions)

8. (Claude offers /plan-design-review next; pick "Run /plan-design-review now")

9. (answer AskUserQuestions)

10. compare DESIGN.md against the /office-hours doc at
    ~/.gstack/projects/{slug}/. surface anything in /office-hours that's
    missing from DESIGN.md. fold the load-bearing items in.

11. (answer the reconcile AskUserQuestion — usually "fold all")

12. ship the pre-build kill gates from TODOS.md before writing any code.
```

The two prompts that really matter and get forgotten:

- **Step 1**: run `/office-hours` first. The diagnostic catches premise problems no review skill can recover.
- **Step 10**: explicitly diff DESIGN.md against the office-hours doc after the review chain. Catches drift that the chain itself missed.
