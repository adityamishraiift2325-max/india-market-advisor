import { colorsFor, shortLabel } from './util.js';

// Weight of one instrument inside its asset class, as the classic page computes it.
function fundAmount(amount, list, ins) {
  const weighted = list.some((i) => i.allocationPct != null);
  const pct = weighted ? ins.allocationPct || 0 : 100 / list.length;
  return Math.round((amount * pct) / 100);
}

/** One shape for both paths, so the result screens don't care which they got. */
export function buildView(mode, sipPlan, result) {
  if (mode === 'sip' && sipPlan) {
    const s = sipPlan.summary;
    const eff = Math.max(1, sipPlan.schedule.filter((r) => !r.isPaused).length);
    const total = s.totalInvested;
    const classes = (sipPlan.assets || [])
      .filter((a) => (s.assetClassTotals[a.key] || 0) > 0)
      .map((a, i) => {
        const amount = s.assetClassTotals[a.key];
        return {
          key: a.key, label: a.label, short: shortLabel(a.key, a.label), amount,
          pct: Math.round((amount / total) * 1000) / 10, monthly: amount / eff,
          funds: (s.instruments?.[a.key] || []).map((f) => ({ ...f, monthly: f.monthly })),
          colors: colorsFor(a.key, i), reason: null, xirr: null, outlook: null,
        };
      });
    return {
      sip: true, classes, eff, total, invested: total, perMonth: total / eff,
      base: sipPlan.baseMonthlyAmount, adjTarget: sipPlan.inflationAdjustedTarget,
      xirr: s.estimatedXIRR, strategy: s.strategyNote, nudge: !!s.marketNudgeActive,
      rows: sipPlan.schedule, amounts: sipPlan.schedule.map((r) => r.totalThisMonth),
      months: sipPlan.inputs.months, section80C: s.section80CUtilised || 0, taxFlags: sipPlan.taxFlags || [],
      plan: sipPlan,
    };
  }
  if (mode !== 'sip' && result) {
    const list = (result.allocations || []).filter((a) => a.percentage > 0);
    const classes = list.map((a, i) => ({
      key: `c${i}`, label: a.assetClass, short: shortLabel(null, a.assetClass), amount: a.amount, pct: a.percentage,
      monthly: a.amount, colors: colorsFor(null, i), reason: a.reason, xirr: a.expectedXirr, outlook: a.outlook3m,
      funds: (a.instruments || []).map((f) => ({ ...f, amount: fundAmount(a.amount, a.instruments, f) })),
    }));
    return {
      sip: false, classes, eff: 1, total: result.totalAmount, invested: result.totalAmount, perMonth: result.totalAmount,
      xirr: result.portfolioXirr, strategy: result.overallStrategy, xirrComparison: result.xirrComparison,
      disclaimer: result.disclaimer, result,
    };
  }
  return null;
}
