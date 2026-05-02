# Greenfield Playbook — the prompts that got Zetamac to a shippable v1 spec

Captured 2026-05-02 from a single session that produced DESIGN.md (v1, 547 lines), TODOS.md (210 lines), a test plan artifact, and a CEO plan. Distilled here so the next project can run the same workflow without re-discovering it.

> **Move me later:** copy this to `~/.claude/templates/greenfield-playbook.md` to reuse across projects.

---

## TL;DR — the workflow in 7 steps

```
  1. /office-hours              — diagnostic, premise challenge, design doc draft
  2. write DESIGN.md            — based on the /office-hours output, not from scratch
  3. /plan-ceo-review           — scope, audience, ambition; cherry-pick expansions
  4. /plan-eng-review           — architecture, schema, anti-cheat, tests, perf
  5. /plan-design-review        — IA, state coverage, journey, mockups
  6. reconcile DESIGN.md against the /office-hours doc  ← I missed this; you shouldn't
  7. run pre-build kill gates   — naming, demand validation, adjacent-product test
```

The order matters. Each step compounds on the last. **The reconcile step (6) is the one I missed in this session — always run it.**

---

## The literal prompts (chronological)

### Setup

> set default claude effort to max

Sets `effortLevel: "xhigh"` in `~/.claude/settings.json`. One-time. Not project-specific.

> /effort

Per-session toggle to max effort. Use at the start of any high-stakes session.

### Kicking off the design doc

> make a design doc
>
> Yes. I think the product should be: [paste full thesis here]

Pattern: paste your full product thesis as one block. The thesis should cover:
- One-line product
- Why it exists / the gap
- Audience (in priority order)
- Core constructions / primitives
- Game loops (round / daily / long-term)
- Modes
- Voice on gamification (what we use vs avoid)
- Voice / input considerations
- Technical shape (high-level)
- MVP cut

Claude turns this into `DESIGN.md` at the repo root. **Length target: ~250-450 lines.**

### CEO review

> /plan-ceo-review

Walks through:
- System audit
- Premise challenge (does this solve the right problem?)
- Existing code leverage
- Dream state mapping (today → 12 months)
- 2-3 implementation alternatives (mandatory)
- Mode selection (EXPANSION / SELECTIVE / HOLD / REDUCTION)
- Per-section review (architecture, errors, security, data flow, code quality, tests, perf, observability, deploy, trajectory, design)

**Decisions you'll make:**
- Mode (default: SELECTIVE EXPANSION for greenfield)
- Audience priority flips
- Per-expansion cherry-picks (one AskUserQuestion per expansion)

### Eng review

> Run /plan-eng-review now

Walks through:
- Step 0: scope challenge, complexity check
- Architecture review (DB schema, indexes, race conditions, RLS, anti-cheat)
- Code quality patterns
- Test coverage diagram (every codepath, every user flow, every error state)
- Performance review

**Decisions you'll make:**
- Implementation alternatives for any complex flow
- Whether to scope-reduce when complexity check triggers
- Test coverage tradeoffs

This is the **required gate**. Eng review must be CLEAR before code starts.

### Design review

> Run /plan-design-review now

Walks through:
- Initial design rating (0/10)
- Mockup scope (which screens get visual mockups)
- 7 passes: information architecture, state coverage, journey, AI slop, design system, responsive + a11y, unresolved decisions

**Decisions you'll make:**
- Mockup scope (per-screen)
- Per-pass design tradeoffs

Output: full design specs added to DESIGN.md (tokens, wireframes, state tables, journey storyboard, mobile + a11y specs, AI-slop guardrails).

### Reconcile (the step I missed — don't skip)

> look at the other design doc, i should have two. does that design doc add anything?

After all three reviews, **explicitly ask Claude to diff DESIGN.md against the `/office-hours` doc**. The /office-hours doc lives at:

```
~/.gstack/projects/{slug}/{user}-{branch}-design-{datetime}.md
```

Claude should produce a delta listing what's in /office-hours but missing from DESIGN.md, organized by severity (architectural / spec gaps / context). Then:

> Fold all [N] items into DESIGN.md

Or pick a subset. The reconcile step recovers anything that drifted during the multi-review chain.

**This step is automatable.** Future skill-chain improvement: `/plan-ceo-review` and `/plan-eng-review` should both auto-read existing design docs at the start. Until then, do it manually.

### Future-self handoff

> can you make a separate md including all the prompts I've given you to get to this point, for future projects

You're here. This file.

---

## Decision-point cheat sheet

When the review skills ask AskUserQuestion, here are the defaults that worked in this session. Override based on your project specifics.

| Skill | Question | Default |
|-------|----------|---------|
| /plan-ceo-review | Mode selection | SELECTIVE EXPANSION (greenfield); HOLD SCOPE (refactors); REDUCTION (>15 file plans) |
| /plan-ceo-review | Audience priority flip | Flip to broader audience first if specified niche is saturated; build narrower paid tier on top later |
| /plan-ceo-review | Cherry-pick expansions | Add to MVP only if marginal CC cost is hours, not days, and the addition is load-bearing for the wedge moment |
| /plan-eng-review | Scope reduction (complexity triggered) | Snap back to /office-hours scope if it exists; otherwise hold |
| /plan-eng-review | Implementation alternatives | Pick the boring [Layer 1] approach unless there's a specific reason to spend an innovation token |
| /plan-design-review | Mockup scope | The 1-2 screens that ARE the wedge moment; spec the rest inline |
| /plan-design-review | Outside design voices | Skip if you've already done 2+ adversarial passes elsewhere in the chain |

---

## Files produced (per project)

After the full workflow runs, these exist:

| Path | What it is | Source |
|------|-----------|--------|
| `~/.gstack/projects/{slug}/{user}-{branch}-design-{datetime}.md` | Office-hours diagnostic | /office-hours |
| `{repo}/DESIGN.md` | Implementable v1 spec | You write, Claude expands |
| `{repo}/TODOS.md` | Pre-build blockers + v2-v5 roadmap | /plan-ceo-review + /plan-eng-review + /plan-design-review |
| `~/.gstack/projects/{slug}/ceo-plans/{date}-{slug}.md` | CEO scope decisions | /plan-ceo-review |
| `~/.gstack/projects/{slug}/{user}-{branch}-eng-review-test-plan-{datetime}.md` | Test plan for /qa to consume | /plan-eng-review |
| `~/.gstack/projects/{slug}/designs/{screen}-{date}/` | Mockups (if `OPENAI_API_KEY` set) | /plan-design-review |

The first one is *outside* the repo (it's user data, not project data). The rest are either in-repo or in user-data scope as appropriate.

---

## Lessons learned this session

### Lesson 1: read existing design docs before running CEO review

I started `/plan-ceo-review` without reading the `/office-hours` doc that already existed at `~/.gstack/projects/Zetamac/`. The CEO review then drifted the product toward a Wordle-style daily gate that the office-hours diagnostic had explicitly rejected (premise #1: "Wordle's once-per-day gate was tested and rejected"). The drift was caught in `/plan-eng-review` Step 0 — but only because the eng review reads existing context.

**Mitigation:** at the start of any review skill, say:
> First, check `~/.gstack/projects/{slug}/` for any existing /office-hours design doc. If one exists, read it before doing anything else and use it as the source of truth.

Or just always run the reconcile step (6) at the end.

### Lesson 2: effort estimates from "5 hours" sources are usually 3x off

The eng review's parallelization plan said the v1 build was ~5 hours of CC work. The /office-hours doc, written more carefully a few hours earlier, said 15-25 hours. Office-hours was right. The 5-hour estimate had under-counted server-issued problem sequences, RLS complexity, OAuth wiring, invite-token flow, and mobile UX edge cases.

**Mitigation:** when an effort estimate seems suspiciously small, check whether an earlier honest estimate exists. /office-hours is often more sober.

### Lesson 3: anti-cheat needs to be designed in v1, not bolted on

DESIGN.md initially specified client-side seed reproduction for anti-cheat. /office-hours specified server-issued seed + server-only answer key. The latter is materially stronger; the former is trivially defeated by precomputing answers from the seed in <100ms.

**Mitigation:** for any product with a leaderboard, anti-cheat is a v1 concern, not a v2 hardening. Surface this in the eng review.

### Lesson 4: the multi-review chain is high-leverage but expensive in user-touchpoints

This session involved ~13 AskUserQuestion decisions. Each one is fast, but the total session was ~3 hours of engaged decision-making. Worth it for a 547-line doc that's actually shippable, but you should batch when you can:

- Combine "mode selection" + "audience flip" into one AskUserQuestion if both are load-bearing.
- Use the escape hatch for sections where there are no real forks.
- Skip outside-voice ceremonies if you've already done 2+ adversarial passes in the chain.

---

## Quickstart for the next project

```bash
# 1. New project setup
mkdir ~/Github/{project}
cd ~/Github/{project}
# (no git init yet — gstack uses path-based slugs)

# 2. Run office hours
# In Claude Code:
#   /office-hours
# Diagnostic produces ~/.gstack/projects/{project}/...-design-...md

# 3. Write DESIGN.md
# Paste your thesis to Claude with "make a design doc based on the /office-hours output"
# Claude writes ~/Github/{project}/DESIGN.md

# 4. CEO review
# In Claude Code:
#   /plan-ceo-review
# Make scope + audience + cherry-pick decisions

# 5. Eng review
# In Claude Code:
#   /plan-eng-review
# Validates architecture; produces test plan artifact

# 6. Design review
# In Claude Code:
#   /plan-design-review
# Generates wireframes (or mockups if OPENAI_API_KEY is set)

# 7. RECONCILE — DON'T SKIP THIS
# In Claude Code:
#   "Compare DESIGN.md against the /office-hours doc at
#    ~/.gstack/projects/{project}/...-design-...md.
#    Surface anything in /office-hours that's missing from DESIGN.md.
#    Fold the load-bearing items in."

# 8. Pre-build kill gates (from TODOS.md)
#   - Pick name + register domain
#   - Text 3 specific potential users
#   - Test adjacent products
#   Only build if gates pass.
```

---

## Anti-patterns this playbook avoids

- **Building before validating demand.** Pre-build kill gates are non-negotiable for greenfield products.
- **Skipping /office-hours.** The diagnostic catches premise problems that no review skill can recover from.
- **One-shot design docs.** A doc you write in one pass is always wrong. The 3-review chain catches drift, the reconcile step catches what the chain itself missed.
- **Taking the first effort estimate as truth.** Always cross-check against an earlier, more carefully written number.
- **"We'll add anti-cheat later."** For products with leaderboards or rankings, this is a v1 architecture decision.
- **Letting Claude make scope decisions.** Use AskUserQuestion options. The user always has context Claude doesn't.

---

## What to extract for the next iteration of this playbook

After running this workflow on the next project, update this file with:
- Any new decision-point defaults that worked.
- Any new lesson-learned worth surfacing.
- Any skill-chain improvement that auto-handled what was manual here.

This file is a living artifact. Treat it like CLAUDE.md — refine over time.
