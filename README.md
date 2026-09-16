# India Market Advisor

A local web app that pulls live Indian market data (NSE/BSE indices, sectors, commodities, FX),
uses Claude to generate sector insights and a daily market briefing, and builds a reasoned
investment allocation across 10 asset classes from a target amount + risk profile.

## Stack

- **Frontend:** React + Vite + Chart.js (`frontend/`)
- **Backend:** Node.js + Express (`backend/`)
- **AI:** Claude Agent SDK — authenticates via your **Claude Pro/Max subscription**
  (no pay-as-you-go API key needed)
- **Market data:** `yahoo-finance2` (live), with an illustrative seed fallback when rate-limited
- **Storage:** JSON flat files (TTL cache + macro overrides) — no database

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm start                   # http://localhost:3001
```

**Auth (Pro/Max subscription — no API billing):**

```bash
# 1. Install the Claude Code CLI if you don't have it
npm install -g @anthropic-ai/claude-code

# 2. Generate a long-lived subscription token (opens a browser to log in)
claude setup-token

# 3. Paste the printed token into backend/.env
#    CLAUDE_CODE_OAUTH_TOKEN=<token>

# 4. Restart the backend
```

`.env`:

```
CLAUDE_CODE_OAUTH_TOKEN=<from `claude setup-token`>
PORT=3001
CACHE_TTL_MINUTES=15
```

> Prefer pay-as-you-go instead? Set `ANTHROPIC_API_KEY` (from console.anthropic.com) rather than the OAuth token — the code accepts either.

### 2. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend on port 3001.
Open **http://localhost:5173**.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Server + AI-key status |
| GET | `/api/market/indices` | All indices (broad + sectoral) with returns + sparkline |
| GET | `/api/market/sectors` | Sectoral indices only |
| GET | `/api/market/commodities` | Gold / silver |
| GET | `/api/market/forex` | USD/INR |
| GET | `/api/macro` | Macro indicators + live gold/FX |
| POST | `/api/macro/override` | Update slow-moving macro indicators |
| GET | `/api/analyze/narrative` | AI daily market briefing |
| GET | `/api/analyze/sector/:key` | AI deep-dive for one sector |
| POST | `/api/analyze/allocate` | AI allocation `{ amount, riskProfile }` |

## Notes

- **Rate limiting:** Yahoo's free endpoint rate-limits aggressively. Results are cached 15 min.
  If a live fetch fails, the app serves an illustrative seed snapshot (cards show a `demo` tag).
  On your own machine live data should populate normally.
- **AI key:** Sector analysis, the daily briefing, and allocation require `ANTHROPIC_API_KEY`.
  Market data and the dashboard work without it.
- **Not investment advice.** Educational tool only.
