import { generateSipAllocations } from './claudeService.js';
import { getNiftyPE } from './marketData.js';
import { getMacroContextString } from './macroContext.js';
import { buildSipPlan, SIP_ASSETS } from './sipPlanner.js';
import { getTrackedPlan, monthsElapsed } from './sipTracker.js';

const KEYS = SIP_ASSETS.map((a) => a.key);
const LABELS = Object.fromEntries(SIP_ASSETS.map((a) => [a.key, a.label]));

function sumAssetTotals(rows) {
  const out = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const r of rows) {
    for (const k of KEYS) out[k] += r.allocations?.[k] || 0;
  }
  return out;
}

/**
 * Regenerate the plan's remaining months under a new risk profile and diff the
 * result against what was already scheduled — rupees per asset class, not just
 * percentage points. Past months (already elapsed) are read-only here; nothing
 * is persisted until the diff is confirmed via sipTracker.applyRevision.
 */
export async function previewRevision({ riskProfile }, now = new Date()) {
  const plan = getTrackedPlan();
  if (!plan) {
    throw Object.assign(new Error('No tracked plan. Track a plan first.'), { status: 400 });
  }
  if (!['conservative', 'moderate', 'aggressive'].includes(riskProfile)) {
    throw Object.assign(new Error('invalid riskProfile.'), { status: 400 });
  }

  const schedule = plan.schedule || [];
  const elapsed = monthsElapsed(schedule, now);
  const remainingMonths = schedule.length - elapsed;
  if (remainingMonths <= 0) {
    throw Object.assign(new Error('This plan has no remaining months to revise.'), { status: 400 });
  }

  const oldRemainingRows = schedule.slice(elapsed);
  const oldTotals = sumAssetTotals(oldRemainingRows);
  const remainingAmount = oldRemainingRows.reduce((s, r) => s + (r.expected || 0), 0);

  // Pause-month indices are relative to the whole plan; shift them into the
  // remaining window so buildSipPlan pauses the right months.
  const pauseMonths = (plan.pauseMonths || [])
    .filter((i) => i >= elapsed)
    .map((i) => i - elapsed);

  const [macroContext, niftyPE] = await Promise.all([getMacroContextString(), getNiftyPE()]);
  const ai = await generateSipAllocations({ riskProfile, macroContext, niftyPE });

  const newPlan = buildSipPlan({
    totalAmount: remainingAmount,
    months: remainingMonths,
    sipDate: plan.sipDate || 1,
    stepUpPct: plan.stepUpPct || 0,
    pauseMonths,
    inflationPct: plan.inflationPct || 6,
    allocationPct: ai.allocationPct,
    instruments: ai.instruments,
    estimatedXIRR: ai.estimatedXIRR,
    strategyNote: ai.strategyNote,
    niftyPE,
  });

  const newTotals = newPlan.summary.assetClassTotals;

  const diff = KEYS.map((k) => {
    const oldTotal = Math.round(oldTotals[k]);
    const newTotal = Math.round(newTotals[k]);
    const delta = newTotal - oldTotal;
    let status = 'unchanged';
    if (oldTotal === 0 && newTotal > 0) status = 'new';
    else if (newTotal === 0 && oldTotal > 0) status = 'dropped';
    else if (delta > 0) status = 'increased';
    else if (delta < 0) status = 'decreased';
    return {
      key: k,
      label: LABELS[k],
      oldTotal,
      newTotal,
      delta,
      oldMonthly: Math.round(oldTotal / remainingMonths),
      newMonthly: Math.round(newTotal / remainingMonths),
      status,
    };
  })
    .filter((d) => d.status !== 'unchanged')
    .sort((a, b) => b.delta - a.delta);

  // Reindex the freshly generated schedule to continue right after `elapsed`
  // so it splices onto the untouched past months with continuous monthIndex.
  const newSchedule = newPlan.schedule.map((r, i) => ({
    monthIndex: elapsed + i,
    label: r.label,
    date: r.date,
    expected: r.isPaused ? 0 : r.totalThisMonth,
    allocations: r.allocations,
  }));

  // Fund-level picture for each asset class that's actually changing. This is
  // the part that answers "which fund do I move money out of / into" — the
  // asset-class rupee diff alone doesn't say that.
  //
  // Funds are only re-picked by the AI for classes newly entering the plan
  // (0% before) — everything the investor already holds keeps the SAME named
  // fund and just gets re-weighted to the new monthly amount. Re-suggesting a
  // fresh fund every revision would be noise: the AI names funds fresh each
  // call, so a class that stays at (say) 20% would otherwise appear to
  // "switch funds" for no real reason.
  const oldInstruments = plan.instruments || {};
  const instruments = { ...oldInstruments }; // becomes the plan's new instrument map on confirm

  const strip = (list) =>
    (list || []).map((f) => ({
      name: f.name, ticker: f.ticker ?? null, type: f.type ?? null, allocationPct: f.allocationPct,
    }));

  const fundActions = diff.map((d) => {
    let sourceList;
    let action;

    if (d.status === 'new') {
      sourceList = strip(ai.instruments?.[d.key]);
      action = 'start';
      instruments[d.key] = sourceList;
    } else if (d.status === 'dropped') {
      sourceList = oldInstruments[d.key] || [];
      action = 'stop';
      delete instruments[d.key];
    } else if (oldInstruments[d.key]?.length) {
      // increased / decreased, and we know which fund(s) are already held.
      sourceList = oldInstruments[d.key];
      action = 'adjust';
    } else {
      // Plan predates fund tracking, or the AI gave nothing originally —
      // no prior fund on file, so this is a fresh pick, not a same-fund reweight.
      sourceList = strip(ai.instruments?.[d.key]);
      action = 'switch';
      instruments[d.key] = sourceList;
    }

    const funds = sourceList.map((f) => ({
      name: f.name,
      ticker: f.ticker ?? null,
      type: f.type ?? null,
      before: Math.round((d.oldMonthly * (f.allocationPct || 0)) / 100),
      after: Math.round((d.newMonthly * (f.allocationPct || 0)) / 100),
    }));

    return { key: d.key, label: d.label, action, monthlyBefore: d.oldMonthly, monthlyAfter: d.newMonthly, funds };
  });

  return {
    fromRiskProfile: plan.riskProfile || null,
    toRiskProfile: riskProfile,
    elapsed,
    remainingMonths,
    remainingAmount: Math.round(remainingAmount),
    estimatedXIRR: newPlan.summary.estimatedXIRR,
    strategyNote: newPlan.summary.strategyNote,
    diff,
    fundActions,
    instruments,
    newSchedule,
  };
}
