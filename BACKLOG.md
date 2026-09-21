# Backlog

Deferred work, roughly ordered by priority within each section. Not scheduled —
pick items up when relevant.

## Strategy feedback loop (checkpoint-based performance review)

Goal: at fixed checkpoints after a SIP plan starts, compare how it's actually
performing against what was estimated, show the person plain-language
progress, and suggest whether their strategy still fits. Checkpoints:
**1 month** (a light pulse-check, not a verdict) and **3 months** (the first
point a real trend is visible; then every 3 months after).

This does **not** mean the AI model "learns" — Claude's weights don't change
from this app's usage (see chat, 2026-09-17). What actually happens: real
performance data gets fed into future prompts as context, and/or a human
(you or me) periodically tightens the prompt's guidance based on observed
drift. Both are staged below, cheapest first.

- [ ] **Step 1 — Data model.** Add a `checkpoints` array to the tracked-plan
      store (`sipActuals.json`): `{ id, date, monthsElapsed, method:
      'manual'|'auto', enteredValue, impliedXIRR, note }`. `impliedXIRR` is
      computed from the logged cash flows (`actuals[]`, dated) plus the
      entered current value — standard XIRR on a cash-flow series, no new
      dependency needed (small local implementation).
- [ ] **Step 2 — Manual checkpoint UI.** On SIP Health, when a checkpoint is
      due (1 month or a multiple of 3 months since `startDate`), show a
      prompt: "How's this plan doing? Enter your current portfolio value."
      One number in, one comparison out: entered value vs. what was expected
      at this point, plus the implied XIRR vs. the plan's `estimatedXIRR`.
      Ships a working feature on its own — no AI call required yet.
- [ ] **Step 3 — AI-assisted review.** A new backend call (reuses the
      `generateSipAllocations` pattern) that takes the checkpoint data —
      adherence, implied vs. estimated XIRR, months elapsed, current
      allocation — and returns a short plain-English assessment + a
      recommendation (keep going / rebalance within the same profile /
      consider revising risk profile). If it recommends revising, link
      straight into the existing revise-strategy flow.
- [ ] **Step 4 — Reminders.** Surface "your 3-month checkpoint is due" on
      SIP Health (or via the `schedule` skill / a scheduled task) instead of
      relying on the person remembering to open the page and check.
- [ ] **Step 5 (bigger, separate effort) — Automatic actual-value tracking.**
      Replace manual entry by computing current value from the specific
      instruments already stored per asset class (`plan.instruments`) against
      real price/NAV data — mutual funds need AMFI's NAV feed (not on Yahoo
      Finance), stocks/ETFs/gold can reuse the existing market-data path.
      Meaningful new integration work; do this only once Steps 1-3 have
      proven the checkpoint concept is actually used.

## Allocate walkthrough (built 2026-09-21, not yet deployed)

The Allocate page is now a step-by-step walkthrough (jar, duration timeline,
real calendar, skip-months picker, temperament cards, reading screen, verdict
ring, outline orbs, growth chart, reality, tax, take-away) in
`frontend/src/allocate/` + `pages/Allocate.jsx`. The old form is kept at
`/allocate/classic` as a fallback. Uses `motion` (MIT) for animation; **no
Tailwind/shadcn** — KokonutUI and Bklit patterns were re-implemented by hand.

- [ ] **Decide whether to delete the classic page** once the walkthrough has been
      used for a while (`pages/AllocateClassic.jsx` + its CSS in `styles.css`).
- [ ] **Lump-sum growth screen.** SIP has a growth chart; lump sum doesn't
      (no horizon input). Add a horizon or a fixed 1/3/5-year view.
- [ ] **Tax screen for lump sum.** The lump-sum API returns no tax flags.
- [ ] **Broker guide for lump sum.** The guide is keyed by SIP asset keys; lump
      classes only have labels.
- [ ] **Persist the generated plan across a page refresh** (sessionStorage) so a
      refresh doesn't cost another 30-60s AI call.
- [ ] **Real-phone performance check.** Blurred glass + the drifting background
      can be heavy on low-end Android. Run MotionScore (motion.dev) on the live
      URL after deploy; dial back `backdrop-filter` / the blobs if needed.
- [ ] **Code-split the Allocate walkthrough** (bundle is already >500 kB).
- [ ] Festival calendar ends Oct 2027; longer horizons get no tilt (also noted below).

## Performance

- [ ] **Switch AI calls to the direct Anthropic API** (`@anthropic-ai/sdk` +
      `ANTHROPIC_API_KEY`) instead of the Agent SDK's subscription-auth path.
      Removes the ~10-13s subprocess-spawn/CLI-auth floor measured on every
      call (see chat, 2026-09-17). Needs pay-as-you-go billing — estimated
      under $2-5/month at this app's usage. Also unlocks `effort` levels
      (low/medium/high) to directly tune how much the model reasons before
      answering, which the Agent SDK path doesn't expose at all.
- [ ] Consider trimming the AI-requested instrument count (currently 2-3 per
      asset class) *only if* the direct-API switch above isn't enough on its
      own — deliberately not done for free, since it trades away the
      fund-level detail the revise-strategy feature depends on.

## Accuracy / data sourcing

- [ ] Re-evaluate market-data source if the Yahoo retry/backoff (shipped
      2026-09-17) still produces frequent demo-data fallbacks once deployed
      on a shared cloud IP. Candidates researched: TrueData / Kite Connect
      (paid, reliable) — not free open-source alternatives found that
      actually avoid Yahoo or the same rate-limit class of risk.

## Deployment

- [ ] Railway persistent volume mounted at `backend/data`, so
      `sipActuals.json` / `macroOverrides.json` survive redeploys (a fresh
      container image otherwise starts empty — flagged during the 2026-09-17
      deploy-prep session).
- [ ] Decide OAuth-token vs. `ANTHROPIC_API_KEY` for the hosted deploy (ties
      into the direct-API item above).

## Known non-blocking notes (carried over)

- Frontend production bundle has one chunk >500kB (Vite warning) — fine to
  ship, optional future code-splitting.
- No automated tests exist.
