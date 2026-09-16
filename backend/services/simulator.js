import { xirr } from '../utils/xirr.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

// Representative static allocations per risk profile (sum to 100). Kept static
// (no AI) so backtests are instant and reproducible.
const PROFILE_ALLOC = {
  conservative: { equity: 5, largecapMF: 15, midSmallMF: 5, elss: 5, indexETF: 10, sectorETF: 0, debtMF: 30, govtBonds: 15, digitalGold: 7, digitalSilver: 3, reits: 5 },
  moderate: { equity: 10, largecapMF: 20, midSmallMF: 15, elss: 10, indexETF: 15, sectorETF: 0, debtMF: 13, govtBonds: 5, digitalGold: 5, digitalSilver: 2, reits: 5 },
  aggressive: { equity: 20, largecapMF: 15, midSmallMF: 25, elss: 5, indexETF: 12, sectorETF: 10, debtMF: 3, govtBonds: 0, digitalGold: 3, digitalSilver: 2, reits: 5 },
};

// How each asset class is backtested: a real Yahoo proxy (with fallback) or a
// labelled assumed annual return where free history is unreliable.
const PROXY = {
  equity: { symbol: '^NSEI', label: 'Nifty 50' },
  largecapMF: { symbol: '^NSEI', label: 'Nifty 50' },
  elss: { symbol: '^NSEI', label: 'Nifty 50' },
  indexETF: { symbol: '^NSEI', label: 'Nifty 50' },
  midSmallMF: { symbol: '^NSEMDCP50', fallback: '^NSEI', label: 'Nifty Midcap 50' },
  sectorETF: { symbol: '^CNXIT', fallback: '^NSEI', label: 'Nifty IT' },
  digitalGold: { symbol: 'GOLDBEES.NS', fallback: 'GC=F', label: 'Gold ETF' },
  digitalSilver: { symbol: 'SILVERBEES.NS', fallback: 'SI=F', label: 'Silver ETF' },
  debtMF: { assumed: 7.0, label: 'Debt MF (assumed 7%)' },
  govtBonds: { assumed: 7.2, label: 'G-Sec (assumed 7.2%)' },
  reits: { assumed: 8.0, label: 'REITs (assumed 8%)' },
};

const SIP_LABELS = {
  equity: 'Equity', largecapMF: 'Large-cap MF', midSmallMF: 'Mid/Small-cap MF', elss: 'ELSS',
  indexETF: 'Index ETF', sectorETF: 'Sectoral ETF', debtMF: 'Debt MF', govtBonds: 'Govt Bonds',
  digitalGold: 'Digital Gold', digitalSilver: 'Digital Silver', reits: 'REITs',
};

const FD_RATE = 6.8;

async function fetchMonthly(symbol, years) {
  const qs = `?range=${years + 1}y&interval=1mo`;
  for (const host of HOSTS) {
    try {
      const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}${qs}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res) continue;
      const ts = res.timestamp || [];
      const cl = res.indicators?.quote?.[0]?.close || [];
      const out = [];
      for (let i = 0; i < ts.length; i++) {
        if (cl[i] != null) out.push({ date: new Date(ts[i] * 1000), close: cl[i] });
      }
      if (out.length) return out;
    } catch {
      /* try next host */
    }
  }
  return null;
}

function ym(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Build a YYYY-MM -> close map, carrying the last known price forward for gaps.
function priceMap(series) {
  const map = new Map();
  for (const p of series) map.set(ym(p.date), p.close);
  return map;
}

export async function simulateHistoricalSip({ monthlyAmount, years, riskProfile }) {
  const amount = Number(monthlyAmount);
  const yrs = Number(years);
  const alloc = PROFILE_ALLOC[riskProfile] || PROFILE_ALLOC.moderate;

  // Canonical monthly timeline comes from the Nifty series (always present).
  const nifty = await fetchMonthly('^NSEI', yrs);
  if (!nifty || nifty.length < 6) {
    throw Object.assign(new Error('Could not fetch historical market data (Yahoo unavailable).'), { status: 502 });
  }
  const timeline = nifty.slice(-(yrs * 12)); // most recent N*12 months
  const months = timeline.length;
  const monthDates = timeline.map((p) => p.date);
  const lastDate = monthDates[months - 1];

  // Fetch the real proxies we need (dedupe symbols).
  const realKeys = Object.keys(PROXY).filter((k) => PROXY[k].symbol && (alloc[k] || 0) > 0);
  const seriesCache = new Map();
  async function getSeries(sym, fb) {
    if (seriesCache.has(sym)) return seriesCache.get(sym);
    let s = await fetchMonthly(sym, yrs);
    if ((!s || s.length < months / 2) && fb) s = (await fetchMonthly(fb, yrs)) || s;
    seriesCache.set(sym, s);
    return s;
  }

  const perClass = [];
  // Cumulative portfolio value at each month (for the chart).
  const valueByMonth = new Array(months).fill(0);

  for (const key of Object.keys(alloc)) {
    const pct = alloc[key] || 0;
    if (pct <= 0) continue;
    const cfg = PROXY[key];
    const classMonthly = Math.round((amount * pct) / 100);
    const classInvested = classMonthly * months;

    if (cfg.assumed != null) {
      // Each monthly contribution compounds at the assumed monthly rate to `now`.
      const rm = Math.pow(1 + cfg.assumed / 100, 1 / 12) - 1;
      let finalValue = 0;
      for (let m = 0; m < months; m++) {
        const grown = classMonthly * Math.pow(1 + rm, months - 1 - m);
        finalValue += grown;
        // accumulate this contribution's value into every later month for the chart
        for (let t = m; t < months; t++) valueByMonth[t] += classMonthly * Math.pow(1 + rm, t - m);
      }
      perClass.push({
        key, label: SIP_LABELS[key], source: 'assumed', proxy: cfg.label,
        invested: classInvested, finalValue: Math.round(finalValue),
      });
    } else {
      const series = await getSeries(cfg.symbol, cfg.fallback);
      if (!series || series.length < 3) {
        // Data failed → treat as assumed 8% so the sim still completes.
        const rm = Math.pow(1.08, 1 / 12) - 1;
        let finalValue = 0;
        for (let m = 0; m < months; m++) {
          finalValue += classMonthly * Math.pow(1 + rm, months - 1 - m);
          for (let t = m; t < months; t++) valueByMonth[t] += classMonthly * Math.pow(1 + rm, t - m);
        }
        perClass.push({ key, label: SIP_LABELS[key], source: 'assumed', proxy: `${cfg.label} (data n/a → 8%)`, invested: classInvested, finalValue: Math.round(finalValue) });
        continue;
      }
      const pm = priceMap(series);
      let lastKnown = series[0].close;
      const priceAt = (d) => {
        const v = pm.get(ym(d));
        if (v != null) { lastKnown = v; return v; }
        return lastKnown; // carry forward
      };
      const finalPrice = priceAt(lastDate);
      let units = 0;
      const unitsByMonth = [];
      for (let m = 0; m < months; m++) {
        const price = priceAt(monthDates[m]);
        units += price > 0 ? classMonthly / price : 0;
        unitsByMonth.push(units);
      }
      for (let m = 0; m < months; m++) {
        valueByMonth[m] += unitsByMonth[m] * priceAt(monthDates[m]);
      }
      perClass.push({
        key, label: SIP_LABELS[key], source: 'market', proxy: cfg.label,
        invested: classInvested, finalValue: Math.round(units * finalPrice),
      });
    }
  }

  const totalInvested = amount * months;
  const finalValue = Math.round(perClass.reduce((s, c) => s + c.finalValue, 0));
  const absoluteGain = finalValue - totalInvested;

  // XIRR: a monthly outflow on each month date + the final value today.
  const cashflows = monthDates.map((d) => ({ amount: -amount, date: d }));
  cashflows.push({ amount: finalValue, date: lastDate });
  const portfolioXirr = xirr(cashflows);

  // FD baseline on the same monthly contributions.
  const rmFd = Math.pow(1 + FD_RATE / 100, 1 / 12) - 1;
  let fdValue = 0;
  for (let m = 0; m < months; m++) fdValue += amount * Math.pow(1 + rmFd, months - 1 - m);
  fdValue = Math.round(fdValue);

  const series = monthDates.map((d, m) => ({
    date: d.toISOString().slice(0, 10),
    invested: amount * (m + 1),
    value: Math.round(valueByMonth[m]),
  }));

  return {
    inputs: { monthlyAmount: amount, years: yrs, riskProfile, months },
    period: { from: monthDates[0].toISOString().slice(0, 10), to: lastDate.toISOString().slice(0, 10) },
    totalInvested,
    finalValue,
    absoluteGain,
    multiple: Math.round((finalValue / totalInvested) * 100) / 100,
    xirr: portfolioXirr,
    fd: { rate: FD_RATE, value: fdValue, gain: fdValue - totalInvested },
    perClass: perClass.sort((a, b) => b.finalValue - a.finalValue),
    series,
  };
}
