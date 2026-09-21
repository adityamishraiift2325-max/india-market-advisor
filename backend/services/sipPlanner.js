import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const festivalCalendar = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'festivalCalendar.json'), 'utf-8')
);
const taxRules = JSON.parse(
  fs.readFileSync(path.join(dataDir, 'taxRules.json'), 'utf-8')
);

// Canonical SIP asset-class order + display labels (shared with frontend).
export const SIP_ASSETS = [
  { key: 'equity', label: 'Equity (direct)' },
  { key: 'largecapMF', label: 'Large-cap MF' },
  { key: 'midSmallMF', label: 'Mid/Small-cap MF' },
  { key: 'elss', label: 'ELSS' },
  { key: 'indexETF', label: 'Index ETF' },
  { key: 'sectorETF', label: 'Sectoral ETF' },
  { key: 'debtMF', label: 'Debt MF' },
  { key: 'govtBonds', label: 'Government Bonds' },
  { key: 'digitalGold', label: 'Digital Gold' },
  { key: 'digitalSilver', label: 'Digital Silver' },
  { key: 'reits', label: 'REITs' },
];
const KEYS = SIP_ASSETS.map((a) => a.key);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function emptyAlloc() {
  return Object.fromEntries(KEYS.map((k) => [k, 0]));
}

/**
 * Build the month skeleton: dates (from next sipDate occurrence), pause flags,
 * step-up weights, and which festival window (if any) each month falls in.
 */
function buildMonths({ months, sipDate, stepUpPct, pauseMonths }) {
  const day = Math.min(Math.max(sipDate, 1), 28);
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (now.getDate() > day) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }

  // Pre-parse festival windows once.
  const windows = festivalCalendar.festivals.map((f) => {
    const end = new Date(f.date + 'T00:00:00');
    const start = new Date(end);
    start.setDate(start.getDate() - f.windowWeeksBefore * 7);
    return { ...f, start, end };
  });

  const arr = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(y, m + i, day);
    const isPaused = pauseMonths.includes(i);
    const year = Math.floor(i / 12);
    const weight = isPaused ? 0 : Math.pow(1 + stepUpPct / 100, year);

    // Festival window match (take the strongest tilt if overlapping).
    let festival = null;
    for (const w of windows) {
      if (d >= w.start && d <= w.end) {
        if (!festival || w.goldTiltFactor > festival.goldTiltFactor) festival = w;
      }
    }

    arr.push({
      monthIndex: i,
      date: d,
      label: `${MON[d.getMonth()]} ${d.getFullYear()}`,
      isPaused,
      weight,
      festival: festival
        ? { name: festival.name, date: festival.date, goldTiltFactor: festival.goldTiltFactor }
        : null,
    });
  }
  return arr;
}

/** Distribute a target rupee amount across months by per-month weights, rounded
 *  to whole rupees with the remainder pinned to the heaviest month. */
function distribute(target, weights) {
  const totalW = weights.reduce((s, w) => s + w, 0);
  if (totalW <= 0 || target <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (target * w) / totalW);
  const rounded = raw.map((r) => Math.round(r));
  let diff = target - rounded.reduce((s, r) => s + r, 0);
  // Apply leftover (could be ±) to the month with the largest weight.
  if (diff !== 0) {
    let idx = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[idx]) idx = i;
    rounded[idx] += diff;
  }
  return rounded;
}

/**
 * Assemble the full SIP plan. Claude supplies allocationPct (the intelligent
 * split) + estimatedXIRR; everything else here is deterministic.
 */
export function buildSipPlan({
  totalAmount,
  months,
  sipDate,
  stepUpPct = 0,
  pauseMonths = [],
  inflationPct = 6,
  allocationPct,
  instruments = {},
  estimatedXIRR,
  strategyNote,
  niftyPE = null,
}) {
  // 1. Apply market-condition nudge to the base split (deterministic rule).
  const pct = { ...allocationPct };
  let nudgeActive = false;
  let nudgeNote = null;
  if (niftyPE != null && niftyPE > (taxRules.niftyPEHigh || 24)) {
    const take = Math.min(5, (pct.equity || 0) + (pct.sectorETF || 0));
    if (take > 0) {
      // Pull proportionally from equity + sectorETF.
      const pool = (pct.equity || 0) + (pct.sectorETF || 0);
      pct.equity -= take * ((pct.equity || 0) / pool);
      pct.sectorETF -= take * ((pct.sectorETF || 0) / pool);
      pct.debtMF = (pct.debtMF || 0) + take / 2;
      pct.govtBonds = (pct.govtBonds || 0) + take / 2;
      nudgeActive = true;
      nudgeNote = `Nifty PE ${niftyPE} is elevated (>24) — shifted ${take.toFixed(0)}% from equity/sector into debt & bonds.`;
    }
  }

  // 2. Per-asset target rupees from the (possibly nudged) percentages.
  const assetTarget = {};
  for (const k of KEYS) assetTarget[k] = (totalAmount * (pct[k] || 0)) / 100;

  // 3. Month skeleton.
  const monthsArr = buildMonths({ months, sipDate, stepUpPct, pauseMonths });

  // 4. Per-asset, per-month weights. Gold/silver tilt up in festival windows.
  const perAsset = {};
  for (const k of KEYS) {
    const isMetal = k === 'digitalGold' || k === 'digitalSilver';
    const weights = monthsArr.map((mo) => {
      if (mo.weight === 0) return 0;
      const tilt = isMetal && mo.festival ? mo.festival.goldTiltFactor : 1;
      return mo.weight * tilt;
    });
    perAsset[k] = distribute(Math.round(assetTarget[k]), weights);
  }

  // 5. Stitch into the month-by-month schedule.
  let running = 0;
  const schedule = monthsArr.map((mo, i) => {
    const allocations = emptyAlloc();
    let totalThisMonth = 0;
    if (!mo.isPaused) {
      for (const k of KEYS) {
        allocations[k] = perAsset[k][i];
        totalThisMonth += perAsset[k][i];
      }
    }
    running += totalThisMonth;

    const festivalNote = mo.festival
      ? `${mo.festival.name} (${mo.festival.date}) — gold/silver tilt ×${mo.festival.goldTiltFactor}`
      : null;

    return {
      monthIndex: mo.monthIndex,
      label: mo.label,
      // Local calendar date. toISOString() converts to UTC first, which shifts
      // the day back by one on a server running in IST (the 5th became the 4th).
      date: `${mo.date.getFullYear()}-${String(mo.date.getMonth() + 1).padStart(2, '0')}-${String(mo.date.getDate()).padStart(2, '0')}`,
      isPaused: mo.isPaused,
      festivalNote,
      marketNudgeNote: !mo.isPaused && nudgeActive ? nudgeNote : null,
      allocations,
      totalThisMonth,
      runningTotal: running,
    };
  });

  // 6. Summary totals from the actual rounded amounts.
  const assetClassTotals = emptyAlloc();
  for (const row of schedule) {
    for (const k of KEYS) assetClassTotals[k] += row.allocations[k];
  }
  const totalInvested = schedule.reduce((s, r) => s + r.totalThisMonth, 0);
  const section80CUtilised = Math.min(150000, assetClassTotals.elss);

  // 6b. Specific instruments per asset class (reuses the lumpsum approach):
  // Claude names the funds/stocks + their within-class %, we do the rupee math.
  const activeMonths = Math.max(1, months - pauseMonths.length);
  const instrumentBreakdown = buildInstrumentBreakdown(assetClassTotals, instruments, activeMonths);

  // 7. Deterministic tax flags from taxRules + horizon.
  const taxFlags = buildTaxFlags({ assetClassTotals, months });

  const baseMonthlyAmount = Math.round(totalAmount / months);
  const inflationAdjustedTarget = Math.round(
    totalAmount * Math.pow(1 + inflationPct / 100, months / 12)
  );

  return {
    inputs: { totalAmount, months, sipDate, stepUpPct, pauseMonths, inflationPct, niftyPE },
    baseMonthlyAmount,
    inflationAdjustedTarget,
    assets: SIP_ASSETS,
    schedule,
    summary: {
      totalInvested,
      assetClassTotals,
      section80CUtilised,
      estimatedXIRR,
      strategyNote: strategyNote || null,
      marketNudgeActive: nudgeActive,
      instruments: instrumentBreakdown,
    },
    taxFlags,
  };
}

/**
 * For each asset class with a non-zero total, split its rupees across the
 * specific instruments Claude named. Per-instrument total over the horizon plus
 * an approximate monthly figure. Rounding remainder pinned to the largest holding.
 */
function buildInstrumentBreakdown(assetClassTotals, instruments, activeMonths) {
  const out = {};
  for (const k of KEYS) {
    const total = assetClassTotals[k];
    if (total <= 0) continue;
    const list = Array.isArray(instruments?.[k]) ? instruments[k] : [];
    if (!list.length) continue;

    const hasWeights = list.some((i) => i.allocationPct != null);
    const rows = list.map((ins) => {
      const p = hasWeights ? Number(ins.allocationPct) || 0 : 100 / list.length;
      return {
        name: ins.name || 'Instrument',
        ticker: ins.ticker || null,
        type: ins.type || null,
        allocationPct: Number(p.toFixed(1)),
        amount: Math.round((total * p) / 100),
      };
    });
    // Pin any rounding leftover to the largest holding so the rows sum to total.
    let diff = total - rows.reduce((s, r) => s + r.amount, 0);
    if (diff !== 0 && rows.length) {
      let bi = 0;
      for (let i = 1; i < rows.length; i++) if (rows[i].amount > rows[bi].amount) bi = i;
      rows[bi].amount += diff;
    }
    for (const r of rows) r.monthly = Math.round(r.amount / activeMonths);
    out[k] = rows;
  }
  return out;
}

function buildTaxFlags({ assetClassTotals, months }) {
  const flags = [];
  for (const k of KEYS) {
    if (assetClassTotals[k] <= 0) continue;
    const rule = taxRules.assetClasses[k];
    if (!rule) continue;
    const label = SIP_ASSETS.find((a) => a.key === k)?.label || k;

    if (k === 'elss') {
      flags.push({
        assetClass: label,
        flag: 'ELSS has a 3-year lock-in per instalment and counts toward the ₹1.5L 80C limit.',
        severity: 'info',
      });
      continue;
    }
    if (months < rule.stcgMonths) {
      flags.push({
        assetClass: label,
        flag: `Horizon (${months}m) is shorter than the ${rule.stcgMonths}-month STCG period — units sold near plan-end are taxed as short-term gains.`,
        severity: 'warning',
      });
    } else {
      flags.push({
        assetClass: label,
        flag: `Held beyond ${rule.stcgMonths} months, gains qualify as LTCG.`,
        severity: 'info',
      });
    }
  }
  return flags;
}

export { taxRules };
