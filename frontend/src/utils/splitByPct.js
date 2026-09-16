// Split a rupee amount across weighted items, rounded to whole rupees with the
// leftover pinned to the largest holding — mirrors the backend's distribution
// logic (services/sipPlanner.js) so a month's per-fund amounts always add back
// up to that month's asset-class amount exactly, with no drift.
export function splitByPct(total, items) {
  if (!items?.length || total <= 0) return [];
  const hasWeights = items.some((i) => i.allocationPct != null);
  const rows = items.map((i) => {
    const pct = hasWeights ? Number(i.allocationPct) || 0 : 100 / items.length;
    return { ...i, pct, amount: Math.round((total * pct) / 100) };
  });
  const diff = total - rows.reduce((s, r) => s + r.amount, 0);
  if (diff !== 0) {
    let bi = 0;
    for (let i = 1; i < rows.length; i++) if (rows[i].amount > rows[bi].amount) bi = i;
    rows[bi].amount += diff;
  }
  return rows;
}
