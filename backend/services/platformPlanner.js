import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SIP_ASSETS } from './sipPlanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brokers = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'brokers.json'), 'utf-8')
);
const LABELS = Object.fromEntries(SIP_ASSETS.map((a) => [a.key, a.label]));

/**
 * Work out the FEWEST platforms that cover every asset class in a plan, so the
 * user isn't sent across four apps when one will do.
 *
 * Coverage data in brokers.json is a point-in-time, educational mapping — a
 * platform's real offering can change, hence "substitutes" (e.g. an index fund
 * standing in for an ETF) are surfaced rather than silently treated as equal.
 */
export function planPlatforms(assetClasses = []) {
  const needed = assetClasses.filter((k) => LABELS[k]);
  if (!needed.length) return { needed: [], minPlatforms: 0, singleOptions: [], combo: [] };

  const shape = (b) => {
    const handles = needed.filter((k) => b.covers.includes(k));
    const subs = handles.filter((k) => (b.substitutes || []).includes(k));
    return {
      id: b.id,
      name: b.name,
      tagline: b.tagline,
      handles,
      handlesLabels: handles.map((k) => LABELS[k]),
      substituteFor: subs,
      substituteLabels: subs.map((k) => LABELS[k]),
      missing: needed.filter((k) => !b.covers.includes(k)).map((k) => LABELS[k]),
    };
  };

  const all = brokers.brokers.map(shape);

  // Platforms that single-handedly cover the whole plan — the ideal outcome.
  const singleOptions = all
    .filter((b) => b.missing.length === 0)
    .sort((a, b) => a.substituteFor.length - b.substituteFor.length);

  if (singleOptions.length) {
    return { needed, minPlatforms: 1, singleOptions, combo: [] };
  }

  // Otherwise: greedy set cover — repeatedly take the platform covering the
  // most still-uncovered classes.
  const remaining = new Set(needed);
  const combo = [];
  const pool = [...all];
  while (remaining.size && pool.length) {
    pool.sort((a, b) => {
      const ca = a.handles.filter((k) => remaining.has(k)).length;
      const cb = b.handles.filter((k) => remaining.has(k)).length;
      if (cb !== ca) return cb - ca;
      return a.substituteFor.length - b.substituteFor.length;
    });
    const pick = pool.shift();
    const newly = pick.handles.filter((k) => remaining.has(k));
    if (!newly.length) break; // nothing left this platform can add
    newly.forEach((k) => remaining.delete(k));
    combo.push({ ...pick, newlyCovered: newly, newlyCoveredLabels: newly.map((k) => LABELS[k]) });
  }

  return {
    needed,
    minPlatforms: combo.length,
    singleOptions: [],
    combo,
    uncovered: [...remaining].map((k) => LABELS[k]),
  };
}

/** Which platform each asset class should be bought on, given a chosen primary. */
export function assignToPlatform(assetClasses, primaryId) {
  const primary = brokers.brokers.find((b) => b.id === primaryId);
  if (!primary) return {};
  const out = {};
  for (const k of assetClasses) {
    out[k] = primary.covers.includes(k) ? primary.name : null;
  }
  return out;
}
