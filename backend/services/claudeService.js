import { query } from '@anthropic-ai/claude-agent-sdk';

// Uses the Claude Agent SDK, which authenticates via your Claude Code login /
// subscription (no pay-as-you-go API key). Provide auth one of two ways:
//   1. CLAUDE_CODE_OAUTH_TOKEN in backend/.env  (run `claude setup-token`)
//   2. A logged-in `claude` CLI on this machine  (run `claude` then /login)
// Falls back to ANTHROPIC_API_KEY if that is the only thing set.

// Pinned to the explicit standard-context model id — the generic 'sonnet'
// alias can resolve to a 1M-context variant that requires a separate
// "usage credits" toggle beyond what's included in a Pro/Max subscription.
const MODEL = 'claude-sonnet-5';

export function aiConfigured() {
  return Boolean(
    process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY
  );
}

/**
 * Extracts the first JSON object/array from a model text response.
 */
function parseJSON(text) {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const firstBrace = cleaned.search(/[[{]/);
  if (firstBrace === -1) throw new Error('No JSON found in model response');
  return JSON.parse(cleaned.slice(firstBrace));
}

/**
 * Single-turn call through the Agent SDK. Returns the final text result.
 */
async function callClaude({ system, user }) {
  let result = '';
  let errored = null;
  let stderrLog = '';

  try {
    for await (const msg of query({
      prompt: user,
      options: {
        systemPrompt: system,
        model: MODEL,
        maxTurns: 1,
        allowedTools: [], // pure text generation, no agentic tool use — no
        // permissionMode set: 'bypassPermissions' needs allowDangerouslySkip-
        // Permissions and is refused outright when running as root (the
        // default in a Docker container) — but with zero allowed tools there
        // is nothing to ever prompt for, so the SDK's default mode behaves
        // identically here without hitting that check at all.
        // Captures the underlying CLI subprocess's stderr instead of letting
        // an SDK-level crash ("Claude Code process exited with code N") stay
        // opaque — the actual cause (missing binary, auth failure, platform
        // mismatch, ...) is what the process itself wrote there.
        stderr: (chunk) => {
          stderrLog += chunk;
        },
      },
    })) {
      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          result = msg.result || '';
        } else {
          errored = msg.subtype || 'unknown error';
        }
      }
    }
  } catch (e) {
    console.error('[claudeService] Agent SDK process failed:', e.message);
    if (stderrLog) console.error('[claudeService] subprocess stderr:', stderrLog.trim());
    throw new Error(
      `Claude call failed: ${e.message}${stderrLog ? ` — stderr: ${stderrLog.trim().slice(0, 500)}` : ''}`
    );
  }

  if (!result) {
    const hint =
      errored && /login|auth/i.test(errored)
        ? ' — not authenticated. Run `claude setup-token` and put CLAUDE_CODE_OAUTH_TOKEN in backend/.env, then restart.'
        : '';
    if (stderrLog) console.error('[claudeService] subprocess stderr:', stderrLog.trim());
    throw new Error(`Claude call failed${errored ? `: ${errored}` : ''}${hint}`);
  }
  return result;
}

/**
 * SIP base allocation split. Claude returns ONLY the percentage split across
 * the 11 SIP asset classes (+ XIRR + a one-line strategy). The server applies
 * festival tilts, the PE nudge, and all rupee arithmetic deterministically.
 */
export async function generateSipAllocations({ riskProfile, macroContext, niftyPE }) {
  const system =
    'You are an Indian SIP planning engine. You output ONLY valid JSON, no prose, ' +
    'no markdown. You are educational, not a SEBI-registered advisor, and never ' +
    'guarantee returns.';

  const user = `Produce a base monthly SIP allocation split for a ${riskProfile} investor.

CURRENT MACRO CONTEXT:
${macroContext}
Nifty trailing PE: ${niftyPE == null ? 'unavailable' : niftyPE}

Allocate across exactly these 11 asset classes (percentages MUST sum to 100;
assign 0 where it doesn't fit the risk profile):
equity, largecapMF, midSmallMF, elss, indexETF, sectorETF, debtMF, govtBonds,
digitalGold, digitalSilver, reits

Guidance: conservative tilts to debtMF/govtBonds/largecapMF + some gold;
aggressive tilts to equity/midSmallMF/sectorETF; moderate is balanced. Include a
modest digitalGold/digitalSilver sleeve for all profiles (festival timing is
handled elsewhere). ELSS only if it suits an 80C tax-saving goal.

For EVERY asset class you give a non-zero percentage, also name 2-3 SPECIFIC real
Indian instruments to SIP into (mutual funds with their plan type, ETFs with NSE
ticker, specific large-cap stocks with NSE ticker, SGB/gold-ETF for digitalGold,
silver-ETF for digitalSilver, listed REITs by name). For each instrument give an
"allocationPct" = its share of THAT asset class's monthly amount; the allocationPct
values WITHIN one asset class MUST sum to 100. Pick instruments suited to monthly
SIP (prefer open-ended funds/ETFs; for direct equity pick liquid large-caps).

Return JSON exactly:
{
  "allocationPct": {
    "equity": number, "largecapMF": number, "midSmallMF": number, "elss": number,
    "indexETF": number, "sectorETF": number, "debtMF": number, "govtBonds": number,
    "digitalGold": number, "digitalSilver": number, "reits": number
  },
  "instruments": {
    "<assetKey>": [
      { "name": string, "ticker": string | null, "type": string, "allocationPct": number }
    ]
  },
  "estimatedXIRR": number,
  "strategyNote": "max 40 words on the thesis for this split"
}

Only include keys in "instruments" for asset classes whose percentage is > 0.
estimatedXIRR should be realistic (conservative ~8, moderate ~11, aggressive ~13.5).
Percentages must sum to exactly 100.`;

  // One retry if the model returns malformed JSON.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const u =
        attempt === 0
          ? user
          : user + '\n\nYour previous response had invalid JSON. Return ONLY the JSON object.';
      const parsed = parseJSON(await callClaude({ system, user: u }));
      // Normalise the split to sum to exactly 100.
      const pct = parsed.allocationPct || {};
      const sum = Object.values(pct).reduce((s, v) => s + (Number(v) || 0), 0);
      if (sum > 0 && Math.abs(sum - 100) > 0.01) {
        for (const k of Object.keys(pct)) pct[k] = (Number(pct[k]) || 0) * (100 / sum);
      }
      const xirr = Number(parsed.estimatedXIRR);
      return {
        allocationPct: pct,
        instruments: parsed.instruments && typeof parsed.instruments === 'object' ? parsed.instruments : {},
        estimatedXIRR: xirr >= 5 && xirr <= 18 ? xirr : { conservative: 8, moderate: 11, aggressive: 13.5 }[riskProfile] || 11,
        strategyNote: parsed.strategyNote || null,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function analyzeSector(sectorName, priceData, macroContext) {
  const system =
    'You are a seasoned Indian equity market analyst. You give concise, ' +
    'data-grounded sector views for retail investors. You are not a registered ' +
    'advisor and never guarantee returns. Respond ONLY with valid JSON, no prose.';

  const user = `Analyze the "${sectorName}" sector of the Indian market.

CURRENT MACRO CONTEXT:
${macroContext}

SECTOR PRICE DATA (JSON):
${JSON.stringify(priceData, null, 2)}

Return a JSON object with exactly these fields:
{
  "outlook": "bullish" | "neutral" | "bearish",
  "confidence": "low" | "medium" | "high",
  "keyDrivers": [string, string, string],
  "risks": [string, string],
  "threeMonthView": "one concise paragraph (max 60 words)",
  "summary": "one-line takeaway (max 20 words)"
}`;

  return parseJSON(await callClaude({ system, user }));
}

export async function generateAllocation({
  amount,
  riskProfile,
  sectorInsights,
  macroContext,
  assetClasses,
}) {
  const system =
    'You are an Indian personal-finance investment strategist. You build ' +
    'diversified allocations for retail investors based on macro conditions, ' +
    'sector momentum, and risk tolerance. You are educational, not a SEBI-' +
    'registered advisor, and never guarantee returns. Respond ONLY with valid JSON, no prose.';

  const user = `Build an investment allocation.

INVESTMENT AMOUNT: ₹${amount}
RISK PROFILE: ${riskProfile}

CURRENT MACRO CONTEXT:
${macroContext}

SECTOR INSIGHTS (JSON):
${JSON.stringify(sectorInsights, null, 2)}

Allocate the full amount across these asset classes (you may assign 0% to some
if justified, but the percentages MUST sum to exactly 100):
${assetClasses.map((a) => `- ${a}`).join('\n')}

For every asset class with a non-zero percentage, name 2-3 SPECIFIC real Indian
instruments to invest in (mutual funds with their type, ETFs with their NSE
ticker, specific large-cap stocks with NSE ticker, SGBs for digital gold, etc).
For each instrument give an "allocationPct" = the share of THAT asset class's
amount to put in it; the allocationPct values within one asset class MUST sum to 100.

Also estimate a forward-looking annualised XIRR (%) for each asset class over a
3-year horizon given current conditions, and compute the amount-weighted
portfolio XIRR for THIS allocation. Additionally estimate what the weighted
portfolio XIRR would be for the conservative, moderate, and aggressive versions
of an allocation for the same amount and macro backdrop (for comparison).

Return a JSON object with exactly this shape:
{
  "riskProfile": "${riskProfile}",
  "totalAmount": ${amount},
  "allocations": [
    {
      "assetClass": string,
      "percentage": number,
      "amount": number,
      "outlook3m": "bullish" | "neutral" | "bearish",
      "expectedXirr": number,
      "instruments": [
        { "name": string, "ticker": string | null, "type": string, "allocationPct": number }
      ],
      "reason": "max 30 words"
    }
  ],
  "portfolioXirr": number,
  "xirrComparison": {
    "conservative": number,
    "moderate": number,
    "aggressive": number
  },
  "overallStrategy": "max 80 words explaining the thesis behind this split",
  "disclaimer": "short educational disclaimer noting XIRR figures are estimates, not guarantees"
}

Ensure percentages sum to 100 and amounts sum to ₹${amount}. Use realistic XIRR
estimates (Indian equity ~10-14%, debt ~6-8%, gold ~7-10%). "${riskProfile}" in
xirrComparison should equal portfolioXirr.`;

  return parseJSON(await callClaude({ system, user }));
}

export async function getMarketNarrative(indices, macroContext) {
  const system =
    'You are an Indian market commentator. Write a tight, neutral daily ' +
    'market briefing for retail investors. Plain text only, no markdown, no headings.';

  const user = `Write a ~180 word "what's happening in Indian markets today" briefing.

MACRO CONTEXT:
${macroContext}

INDEX DATA (JSON):
${JSON.stringify(indices, null, 2)}

Cover: broad market tone, standout sectors (up and down), macro backdrop,
and one line on what investors should watch. Plain prose only.`;

  return await callClaude({ system, user });
}
