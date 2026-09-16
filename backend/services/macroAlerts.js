import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMacro } from './macroContext.js';
import { getNiftyPE } from './marketData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// data/macroBaseline.json ships a static default, baked into the image.
// state/macroBaseline.json is where a runtime snapshot actually gets written —
// see the comment in sipTracker.js for why these two directories are kept apart.
const DEFAULT_BASELINE_FILE = path.join(__dirname, '..', 'data', 'macroBaseline.json');
const BASELINE_FILE = path.join(__dirname, '..', 'state', 'macroBaseline.json');

// Current values of the indicators we watch.
async function currentSnapshot() {
  const { indicators, live } = await getMacro();
  const niftyPE = await getNiftyPE();
  return {
    repoRate: numOrNull(indicators.repoRate),
    cpiInflation: numOrNull(indicators.cpiInflation),
    niftyPE: numOrNull(niftyPE),
    usdInr: numOrNull(live.usdinr?.price),
    gold: numOrNull(live.gold?.price),
  };
}

function numOrNull(v) {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? null : n;
}

function readBaseline() {
  try {
    if (fs.existsSync(BASELINE_FILE)) return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
    if (fs.existsSync(DEFAULT_BASELINE_FILE)) return JSON.parse(fs.readFileSync(DEFAULT_BASELINE_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return { capturedAt: null, indicators: null };
}

/**
 * Snapshot the current macro as the new "reviewed" baseline. Future alerts are
 * measured against this, so everything goes quiet until conditions drift again.
 */
export async function snapshotBaseline() {
  const indicators = await currentSnapshot();
  const out = { capturedAt: new Date().toISOString(), indicators };
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2));
  return { ok: true, ...out };
}

/**
 * Evaluate watch rules against current macro + the reviewed baseline. Threshold
 * alerts (PE/CPI) only fire when there's no baseline yet or the metric has moved
 * adversely past where it was when last reviewed; delta alerts (repo/FX/gold)
 * fire only once a baseline exists and the value has moved materially.
 */
export async function getMacroAlerts() {
  const current = await currentSnapshot();
  const base = readBaseline();
  const b = base.indicators || {};
  const hasBaseline = base.indicators != null;
  const alerts = [];

  // --- Nifty PE (absolute thresholds, suppressed once acknowledged) ---
  if (current.niftyPE != null) {
    if (current.niftyPE > 24 && (b.niftyPE == null || current.niftyPE > b.niftyPE + 0.3)) {
      alerts.push(alert('pe-high', 'warning', `Nifty PE elevated (${current.niftyPE})`,
        'New SIP instalments are buying expensive equity. Consider leaning fresh money toward debt / large-cap until valuations cool.'));
    } else if (current.niftyPE < 18 && (b.niftyPE == null || current.niftyPE < b.niftyPE - 0.3)) {
      alerts.push(alert('pe-low', 'info', `Nifty PE attractive (${current.niftyPE})`,
        'Equity looks reasonably valued — a supportive backdrop to keep, or step up, equity SIPs.'));
    }
  }

  // --- Repo rate (delta vs baseline) ---
  if (current.repoRate != null && b.repoRate != null && current.repoRate !== b.repoRate) {
    const cut = current.repoRate < b.repoRate;
    alerts.push(alert('repo', 'info', `RBI repo rate ${cut ? 'cut' : 'hiked'} to ${current.repoRate}% (was ${b.repoRate}%)`,
      cut
        ? 'Falling rates tend to lift existing long-duration debt & gilt funds; new FDs will offer less, so lock-ins look better now.'
        : 'Rising rates favour short-duration / floating-rate debt; long bonds may dip near term.'));
  }

  // --- CPI inflation (absolute band, suppressed once acknowledged) ---
  if (current.cpiInflation != null) {
    if (current.cpiInflation > 6 && (b.cpiInflation == null || current.cpiInflation > b.cpiInflation + 0.1)) {
      alerts.push(alert('cpi-high', 'warning', `CPI inflation hot (${current.cpiInflation}%)`,
        'Above the RBI 6% upper band — real returns get squeezed. Your gold / silver sleeve is a useful hedge here.'));
    } else if (current.cpiInflation < 4 && (b.cpiInflation == null || current.cpiInflation < b.cpiInflation - 0.1)) {
      alerts.push(alert('cpi-low', 'info', `CPI inflation soft (${current.cpiInflation}%)`,
        'Below the RBI 4% midpoint — leaves room for rate cuts, a tailwind for debt funds.'));
    }
  }

  // --- USD/INR (delta vs baseline) ---
  if (current.usdInr != null && b.usdInr != null) {
    const pct = ((current.usdInr - b.usdInr) / b.usdInr) * 100;
    if (Math.abs(pct) >= 2) {
      const weak = pct > 0; // a higher USD/INR means a weaker rupee
      alerts.push(alert('usdinr', 'info', `Rupee ${weak ? 'weakened' : 'strengthened'} ${Math.abs(pct).toFixed(1)}% to ₹${current.usdInr}/$`,
        weak
          ? 'A weaker rupee tends to help gold (in INR terms) and export-heavy IT / pharma.'
          : 'A stronger rupee eases import costs but trims the INR tailwind for gold.'));
    }
  }

  // --- Gold (delta vs baseline) ---
  if (current.gold != null && b.gold != null) {
    const pct = ((current.gold - b.gold) / b.gold) * 100;
    if (Math.abs(pct) >= 5) {
      const up = pct > 0;
      alerts.push(alert('gold', 'info', `Gold ${up ? 'rallied' : 'fell'} ${Math.abs(pct).toFixed(1)}% since you last reviewed`,
        up
          ? 'Metals have run up — if a festival tilt is near, you may be buying higher; consider spacing those buys.'
          : 'Gold has pulled back — a relatively cheaper entry for your metal sleeve.'));
    }
  }

  return {
    alerts,
    current,
    baseline: base.indicators || null,
    capturedAt: base.capturedAt || null,
    hasBaseline,
  };
}

function alert(id, severity, title, detail) {
  return { id, severity, title, detail };
}
