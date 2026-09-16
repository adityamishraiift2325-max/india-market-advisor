// Future value of a series of monthly contributions compounding at an annual rate.
// Shared by the SIP-vs-FD comparison strip and the share card.
export function futureValue(monthlyAmounts, annualRatePct) {
  const r = annualRatePct / 100 / 12;
  const n = monthlyAmounts.length;
  return monthlyAmounts.reduce((sum, amt, i) => sum + amt * Math.pow(1 + r, n - i), 0);
}
