// Realistic fallback snapshot used when the live data provider is unreachable
// or rate-limited. Values are illustrative (approx. mid-2026 levels) so the
// app is fully demonstrable offline. Each entry carries a `seed: true` flag.

const BASE = {
  nifty50: { price: 24850, d1: 0.42, w1: 1.1, m1: 2.3, ytd: 6.8, type: 'broad', name: 'NIFTY 50' },
  sensex: { price: 81600, d1: 0.38, w1: 1.0, m1: 2.1, ytd: 6.5, type: 'broad', name: 'BSE SENSEX' },
  niftybank: { price: 52400, d1: 0.55, w1: 1.4, m1: 1.8, ytd: 5.2, type: 'sector', name: 'NIFTY Bank' },
  niftyit: { price: 38900, d1: -0.62, w1: -1.2, m1: 3.4, ytd: 9.1, type: 'sector', name: 'NIFTY IT' },
  niftypharma: { price: 22100, d1: 0.81, w1: 2.1, m1: 4.2, ytd: 11.4, type: 'sector', name: 'NIFTY Pharma' },
  niftyauto: { price: 24300, d1: 0.27, w1: 0.6, m1: -1.1, ytd: 3.9, type: 'sector', name: 'NIFTY Auto' },
  niftyfmcg: { price: 58700, d1: -0.15, w1: -0.4, m1: 0.9, ytd: 2.1, type: 'sector', name: 'NIFTY FMCG' },
  niftymetal: { price: 9850, d1: 1.32, w1: 3.2, m1: 5.6, ytd: 14.2, type: 'sector', name: 'NIFTY Metal' },
  niftyrealty: { price: 1080, d1: -0.92, w1: -2.1, m1: -3.4, ytd: -1.8, type: 'sector', name: 'NIFTY Realty' },
  niftyenergy: { price: 41200, d1: 0.44, w1: 0.9, m1: 1.7, ytd: 7.3, type: 'sector', name: 'NIFTY Energy' },
  gold: { price: 2680, d1: 0.35, w1: 1.2, m1: 3.1, ytd: 12.5, name: 'Gold (USD/oz)', currency: 'USD' },
  silver: { price: 31.2, d1: 0.62, w1: 2.0, m1: 4.5, ytd: 18.2, name: 'Silver (USD/oz)', currency: 'USD' },
  usdinr: { price: 83.4, d1: 0.08, w1: 0.2, m1: 0.5, ytd: 1.1, name: 'USD/INR', currency: 'INR' },
};

// Deterministic pseudo-sparkline: 7 points trending toward current price
// consistent with the 1-week return, plus mild noise.
function sparkline(price, w1) {
  const start = price / (1 + w1 / 100);
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const noise = Math.sin(i * 1.7) * (price * 0.0015);
    pts.push(Number((start + (price - start) * t + noise).toFixed(2)));
  }
  return pts;
}

export function seedFor(key, symbol) {
  const b = BASE[key];
  if (!b) {
    return { key, symbol, error: 'no seed data', seed: true };
  }
  return {
    key,
    name: b.name,
    symbol,
    type: b.type || null,
    price: b.price,
    currency: b.currency || 'INR',
    returns: { d1: b.d1, w1: b.w1, m1: b.m1, ytd: b.ytd },
    sparkline: sparkline(b.price, b.w1),
    asOf: new Date().toISOString(),
    seed: true,
  };
}
