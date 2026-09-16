# Deploying India Market Advisor

This app is now a single deployable service: the Express backend serves the
built React frontend as static files (`frontend/dist`) and answers `/api/*`
itself — one process, one URL, no separate frontend host needed.

## Local production check

```bash
cd frontend && npm run build      # produces frontend/dist
cd ../backend && npm start        # serves API + built frontend on :3001
```

Visit `http://localhost:3001` — you should see the full app, not just the API.

## Auth for the AI endpoints

`backend/.env` currently holds a `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`,
tied to your personal Pro/Max subscription). That works for a deploy only you use.
If the app will get real traffic from other people, switch to a pay-as-you-go
`ANTHROPIC_API_KEY` from console.anthropic.com instead — the code accepts either
(see `backend/services/claudeService.js`). Whichever you use, set it as an
**environment variable on the host**, never commit `.env` (it's gitignored).

## Option A — Docker (any host: Fly.io, Railway, Render, a VPS, etc.)

A `Dockerfile` at the repo root does the full build in one image:

```bash
docker build -t india-market-advisor .
docker run -p 3001:3001 \
  -e CLAUDE_CODE_OAUTH_TOKEN=<your token> \
  india-market-advisor
```

Push the image or connect the repo to any platform that builds from a
Dockerfile (Railway, Render, Fly.io all support this directly — just point
them at this repo and set the env var in their dashboard).

## Option B — Render / Railway without Docker

Both support a plain Node service:
- **Build command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
- **Start command:** `node backend/server.js`
- **Env vars:** `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`), `PORT` (usually auto-set by the platform)

## Option C — Split hosting (Vercel/Netlify for frontend + Render/Railway for backend)

Only needed if you want the frontend on a CDN separately:
- Deploy `frontend/` to Vercel/Netlify with build command `npm run build`, output `dist`.
- Deploy `backend/` to Render/Railway as above.
- Set the frontend's API base URL to the backend's public URL (currently the
  frontend calls relative `/api/...` paths assuming same-origin — check
  `frontend/src/api.js` and add a `VITE_API_BASE` env var if you split hosts).

**Recommended: Option A or B** (single service) — simplest, no CORS/base-URL
changes needed, matches how the app is already wired.

## Before going live — checklist

- [ ] Decide OAuth-token vs API-key auth (see above) based on expected traffic.
- [ ] Push this repo to GitHub (it's already a local git repo, one commit in).
- [ ] Pick a host from Option A/B and connect the repo.
- [ ] Set the auth env var + any others from `backend/.env.example` in the host's dashboard.
- [ ] `backend/data/*.json` are flat-file storage (macro overrides, SIP actuals) —
      note these reset if the host's filesystem isn't persistent (e.g. most
      serverless/container platforms wipe on redeploy). Fine for a personal/demo
      deploy; if you need it to persist, mount a volume or move this to a real DB.
- [ ] Yahoo Finance rate-limits aggressively from shared-IP hosts — the app
      falls back to a demo seed snapshot automatically, but confirm that's
      acceptable, or add a caching layer / paid data source if not.
