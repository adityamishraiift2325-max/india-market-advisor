import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCommodities, getForex } from './marketData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/state/, not backend/data/ — see the comment in sipTracker.js.
const OVERRIDE_FILE = path.join(__dirname, '..', 'state', 'macroOverrides.json');

// Hardcoded fallbacks — update manually or override via settings page.
// RBI repo rate / CPI / IIP move slowly, so static defaults are acceptable.
const DEFAULTS = {
  repoRate: 6.5, // % — RBI repo rate
  cpiInflation: 5.1, // % YoY
  iip: 3.2, // % YoY (Index of Industrial Production)
  fiiTrend: 'mixed', // net FII flow sentiment: inflow | outflow | mixed
  diiTrend: 'inflow', // net DII flow sentiment
  gdpGrowth: 6.8, // % YoY
  lastUpdated: '2026-05-01',
};

function readOverrides() {
  try {
    if (fs.existsSync(OVERRIDE_FILE)) {
      return JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[macro] override read failed:', err.message);
  }
  return {};
}

export function saveOverrides(partial) {
  const merged = { ...readOverrides(), ...partial, lastUpdated: new Date().toISOString().slice(0, 10) };
  fs.mkdirSync(path.dirname(OVERRIDE_FILE), { recursive: true });
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

// Drop manual overrides for the six maintained indicators so they fall back to
// the app DEFAULTS. Any other override keys (e.g. niftyPE) are left untouched.
const RESETTABLE = ['repoRate', 'cpiInflation', 'iip', 'fiiTrend', 'diiTrend', 'gdpGrowth'];

export function resetOverrides() {
  const current = readOverrides();
  for (const k of RESETTABLE) delete current[k];
  current.lastUpdated = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.dirname(OVERRIDE_FILE), { recursive: true });
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(current, null, 2));
  return { ...DEFAULTS, ...current };
}

/**
 * Returns combined macro snapshot: static indicators + live market data.
 */
export async function getMacro() {
  const base = { ...DEFAULTS, ...readOverrides() };

  const [commoditiesRes, forexRes] = await Promise.allSettled([
    getCommodities(),
    getForex(),
  ]);

  const commodities =
    commoditiesRes.status === 'fulfilled' ? commoditiesRes.value.data : [];
  const forex = forexRes.status === 'fulfilled' ? forexRes.value.data : [];

  const gold = commodities.find((c) => c.key === 'gold') || null;
  const silver = commodities.find((c) => c.key === 'silver') || null;
  const usdinr = forex.find((f) => f.key === 'usdinr') || null;

  return {
    indicators: base,
    live: {
      gold,
      silver,
      usdinr,
    },
  };
}

/**
 * Formats a compact macro context string for injection into Claude prompts.
 */
export async function getMacroContextString() {
  const { indicators, live } = await getMacro();
  const usdinr = live.usdinr?.price ?? 'n/a';
  const gold = live.gold?.price ?? 'n/a';
  const silver = live.silver?.price ?? 'n/a';

  return [
    `RBI Repo Rate: ${indicators.repoRate}%`,
    `CPI Inflation: ${indicators.cpiInflation}% YoY`,
    `IIP: ${indicators.iip}% YoY`,
    `GDP Growth: ${indicators.gdpGrowth}% YoY`,
    `FII flow trend: ${indicators.fiiTrend}`,
    `DII flow trend: ${indicators.diiTrend}`,
    `USD/INR: ${usdinr}`,
    `Gold (USD/oz): ${gold}`,
    `Silver (USD/oz): ${silver}`,
    `(macro indicators last updated ${indicators.lastUpdated})`,
  ].join('\n');
}
