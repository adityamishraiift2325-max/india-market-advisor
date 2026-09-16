# India Market Advisor — project context

A local web app for Indian market intelligence: live NSE/BSE indices, sector
data, commodities, FX, an AI-generated daily briefing and sector deep-dives,
and a reasoned investment allocation tool across 10 asset classes. Also
tracks a personal SIP (systematic investment plan) plan/schedule. Educational
tool, not investment advice.

## Stack
- **Frontend:** React + Vite + Chart.js — `frontend/`
- **Backend:** Node.js (ESM) + Express — `backend/`
- **AI:** Claude Agent SDK, authenticated via the user's Claude Pro/Max
  subscription (`CLAUDE_CODE_OAUTH_TOKEN` in `backend/.env`) — see
  `backend/services/claudeService.js`. Falls back to `ANTHROPIC_API_KEY` if set.
- **Data:** `yahoo-finance2` live, JSON flat-file cache/storage under
  `backend/data/` (no database). Falls back to an illustrative seed snapshot
  when Yahoo rate-limits.
- See [README.md](README.md) for the full API endpoint table and local dev setup.

## Current state (as of 2026-09-05)
The app is fully built and working locally. **This session just made it
deployment-ready**:
- `backend/server.js` now serves the built `frontend/dist` as static files
  and falls through non-`/api` routes to `index.html` (SPA routing), so the
  whole app runs as **one service** — verified working (`/api/health`,
  `/`, and a deep client-side route all return 200).
- Added root `.gitignore` (`.env`, `node_modules`, `dist`, logs, cache excluded).
- Added `Dockerfile` + `.dockerignore` (multi-stage: builds frontend, then
  copies `dist` into the backend runtime image).
- Initialized a git repo and made the first commit — **not yet pushed to a
  remote**. `backend/.env` (real OAuth token) is confirmed NOT tracked.
- Wrote [DEPLOYMENT.md](DEPLOYMENT.md) — step-by-step for Docker (any host),
  Render/Railway without Docker, or split frontend/backend hosting, plus a
  pre-launch checklist (auth choice, data persistence caveat, Yahoo
  rate-limiting caveat).

## Next steps to actually deploy
1. Push this repo to GitHub (`git remote add origin <url> && git push -u origin main` —
   pick `main` or `master` per your preference, no remote is set yet).
2. Pick a host from `DEPLOYMENT.md` (Docker on Railway/Render/Fly.io is
   recommended — simplest, no code changes needed).
3. Set `CLAUDE_CODE_OAUTH_TOKEN` (or switch to `ANTHROPIC_API_KEY` for a
   public-traffic deploy — OAuth token is tied to the personal subscription)
   as an env var on the host.
4. Decide whether `backend/data/*.json` flat-file storage needs to persist
   across redeploys (mount a volume) or a reset-on-redeploy is fine for now.

## Known non-blocking notes
- Frontend production bundle has one chunk >500kB (Vite warning) — fine to
  ship, optional future cleanup via code-splitting.
- No automated tests exist.
