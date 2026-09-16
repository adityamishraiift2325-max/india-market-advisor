// XIRR (annualised internal rate of return for irregular cash flows), computed
// from scratch via Newton-Raphson with a bisection fallback. No dependencies.
//
// cashflows: [{ amount, date }] — negative = money invested (outflow),
// positive = money received (inflow, e.g. the final portfolio value).
// Returns the annual rate as a percentage (1 decimal), or null if it can't solve.

const MS_PER_YEAR = 365 * 24 * 3600 * 1000;

function npv(rate, flows, t0) {
  let sum = 0;
  for (const f of flows) {
    const years = (f.date - t0) / MS_PER_YEAR;
    sum += f.amount / Math.pow(1 + rate, years);
  }
  return sum;
}

export function xirr(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return null;
  const flows = cashflows
    .map((f) => ({ amount: Number(f.amount), date: f.date instanceof Date ? f.date : new Date(f.date) }))
    .sort((a, b) => a.date - b.date);

  // Need at least one outflow and one inflow.
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;

  const t0 = flows[0].date;

  // Newton-Raphson
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows, t0);
    const h = 1e-6;
    const deriv = (npv(rate + h, flows, t0) - f) / h;
    if (!isFinite(deriv) || Math.abs(deriv) < 1e-12) break;
    const next = rate - f / deriv;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) {
      rate = next;
      break;
    }
    rate = next;
  }

  // Bisection fallback if Newton-Raphson diverged or landed somewhere invalid.
  if (!isFinite(rate) || rate <= -0.9999 || Math.abs(npv(rate, flows, t0)) > 1) {
    let lo = -0.9999;
    let hi = 10; // up to 1000% p.a.
    let flo = npv(lo, flows, t0);
    let fhi = npv(hi, flows, t0);
    if (flo * fhi > 0) return null; // no sign change → no bracketed root
    let mid = rate;
    for (let i = 0; i < 200; i++) {
      mid = (lo + hi) / 2;
      const fm = npv(mid, flows, t0);
      if (Math.abs(fm) < 1) break;
      if (flo * fm < 0) {
        hi = mid;
        fhi = fm;
      } else {
        lo = mid;
        flo = fm;
      }
    }
    rate = mid;
  }

  if (!isFinite(rate)) return null;
  return Math.round(rate * 1000) / 10; // percent, 1 decimal
}
