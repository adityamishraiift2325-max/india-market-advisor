import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { withCache } from './cache.js';
import { seedFor } from './seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'sectors.json'), 'utf-8')
);

// A browser User-Agent lets us hit Yahoo's public chart endpoint directly,
// avoiding the crumb/cookie flow that gets rate-limited (429) server-side.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

function pctChange(from, to) {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch Yahoo's chart JSON for a symbol (1y daily). Tries both query hosts,
 * and — since a single blip on a shared cloud IP shouldn't mean the user sees
 * illustrative demo data instead of the real index level — repeats that pass
 * once more after a short backoff before giving up to the seed fallback.
 */
async function fetchChart(symbol, attempt = 0) {
  const qs = '?range=1y&interval=1d';
  let lastErr;
  for (const host of HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}${qs}`;
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status}`);
        continue;
      }
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (res) return res;
      lastErr = new Error('empty chart result');
    } catch (e) {
      lastErr = e;
    }
  }
  if (attempt < 1) {
    await sleep(600 + Math.random() * 400); // jittered, avoids retry pile-ups
    return fetchChart(symbol, attempt + 1);
  }
  throw lastErr || new Error('chart fetch failed');
}

/**
 * Fetch historical closes for one symbol and derive returns + sparkline.
 */
async function fetchSymbol(item) {
  const { symbol } = item;
  const res = await fetchChart(symbol);

  const meta = res.meta || {};
  const ts = res.timestamp || [];
  const rawCloses = res.indicators?.quote?.[0]?.close || [];

  // Pair timestamps with closes, dropping null gaps (holidays/half-days).
  const closes = [];
  for (let i = 0; i < ts.length; i++) {
    if (rawCloses[i] != null) {
      closes.push({ date: new Date(ts[i] * 1000), close: rawCloses[i] });
    }
  }

  // Fold the live quote into the series as the latest point. When today's candle
  // is still null (intraday or just-closed), regularMarketPrice belongs to a
  // session NEWER than the last completed close — so append it rather than
  // overwrite, otherwise `prev` would step one extra trading day back and the
  // day-change would compare today vs the-day-before-yesterday.
  const series = closes.slice();
  const mktPrice = meta.regularMarketPrice ?? null;
  const mktTime = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null;
  const dayOf = (d) => (d ? d.toISOString().slice(0, 10) : null);
  if (mktPrice != null && mktTime) {
    const lastDate = series[series.length - 1]?.date;
    if (!lastDate || dayOf(mktTime) > dayOf(lastDate)) {
      series.push({ date: mktTime, close: mktPrice }); // newer session
    } else if (dayOf(mktTime) === dayOf(lastDate)) {
      series[series.length - 1] = { date: lastDate, close: mktPrice }; // refresh today's point
    }
    // a quote older than the last completed candle is stale — ignore it
  }

  const last = series[series.length - 1]?.close ?? null;
  // n completed sessions back from the latest point.
  const closeNDaysAgo = (n) => series[series.length - 1 - n]?.close ?? null;
  const prev = closeNDaysAgo(1);

  // YTD: first available close of the current calendar year.
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdRef = series.find((c) => c.date >= yearStart)?.close ?? null;

  const spark = series.slice(-7).map((c) => Number(c.close.toFixed(2)));

  return {
    key: item.key,
    name: item.name,
    symbol,
    type: item.type || null,
    price: last != null ? Number(last.toFixed(2)) : null,
    currency: meta.currency || 'INR',
    returns: {
      d1: round(pctChange(prev, last)),
      w1: round(pctChange(closeNDaysAgo(5), last)),
      m1: round(pctChange(closeNDaysAgo(21), last)),
      ytd: round(pctChange(ytdRef, last)),
    },
    sparkline: spark,
    // Prefer the live quote's own timestamp (actual last-trade time) over the
    // daily candle's date, which Yahoo stamps at session open (misleadingly
    // early) rather than when the price was last updated.
    asOf: (mktTime ?? series[series.length - 1]?.date ?? new Date()).toISOString(),
  };
}

function round(n) {
  return n == null ? null : Number(n.toFixed(2));
}

async function fetchGroup(list) {
  const results = await Promise.allSettled(list.map(fetchSymbol));
  return results.map((r, i) => {
    if (r.status === 'fulfilled' && r.value.price != null) return r.value;
    // Live fetch failed or returned no price (e.g. Yahoo rate-limit) —
    // degrade gracefully to the illustrative seed snapshot.
    return seedFor(list[i].key, list[i].symbol);
  });
}

export async function getIndices() {
  return withCache('indices', () => fetchGroup(sectors.indices));
}

export async function getSectors() {
  const onlySectors = sectors.indices.filter((i) => i.type === 'sector');
  return withCache('sectors', () => fetchGroup(onlySectors));
}

export async function getCommodities() {
  return withCache('commodities', () => fetchGroup(sectors.commodities));
}

export async function getForex() {
  return withCache('forex', () => fetchGroup(sectors.forex));
}

export async function getSectorByKey(key) {
  const all = (await getIndices()).data;
  return all.find((s) => s.key === key) || null;
}

/**
 * Best-effort Nifty trailing PE. A manual override in macroOverrides.json wins;
 * otherwise we try Yahoo's quoteSummary (often rate-limited / unavailable for
 * indices), and return null on failure so the PE nudge simply stays dormant.
 */
export async function getNiftyPE() {
  try {
    const ovPath = path.join(__dirname, '..', 'state', 'macroOverrides.json');
    if (fs.existsSync(ovPath)) {
      const ov = JSON.parse(fs.readFileSync(ovPath, 'utf-8'));
      if (ov.niftyPE != null && !Number.isNaN(Number(ov.niftyPE))) return Number(ov.niftyPE);
    }
  } catch { /* ignore */ }

  const url =
    'https://query1.finance.yahoo.com/v10/finance/quoteSummary/%5ENSEI?modules=summaryDetail';
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const pe = j?.quoteSummary?.result?.[0]?.summaryDetail?.trailingPE?.raw;
      return typeof pe === 'number' ? Number(pe.toFixed(2)) : null;
    } catch {
      if (attempt === 0) await sleep(600 + Math.random() * 400);
    }
  }
  return null;
}

export { sectors };
