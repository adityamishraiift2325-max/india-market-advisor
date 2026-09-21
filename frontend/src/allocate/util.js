import { useEffect, useState } from 'react';
import { api } from '../api.js';

export const rupees = (n) => (n == null ? '—' : '₹' + Math.round(Number(n)).toLocaleString('en-IN'));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const trim = (x) => String(+x.toFixed(2));
export const words = (n) => {
  if (n >= 1e7) return trim(n / 1e7) + ' crore';
  if (n >= 1e5) return trim(n / 1e5) + ' lakh';
  if (n >= 1e3) return trim(n / 1e3) + ' thousand';
  return String(n);
};
export const shortR = (n) =>
  n >= 1e7 ? '₹' + trim(n / 1e7) + ' Cr' : n >= 1e5 ? '₹' + trim(n / 1e5) + ' L' : '₹' + Math.round(n / 1e3) + 'K';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOWF = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Muted, tone-on-tone colour per asset class (light -> deep, used as a gradient).
export const CLASS_COLORS = {
  largecapMF: ['#8FB0E8', '#4A6FB8'], indexETF: ['#7CCBD6', '#2F8FA3'], midSmallMF: ['#B5A3E0', '#6F5BB0'],
  equity: ['#E3A3BC', '#B25A7E'], elss: ['#E8B48A', '#B8703F'], sectorETF: ['#9AA6E8', '#5560B8'],
  debtMF: ['#86D4B4', '#2F9474'], govtBonds: ['#C5D98A', '#85A03F'], digitalGold: ['#F0D48A', '#C99A35'],
  digitalSilver: ['#D5DCE8', '#8E9AB4'], reits: ['#D9A7A0', '#A66A62'],
};
const FALLBACK = Object.values(CLASS_COLORS);
export const colorsFor = (key, i = 0) => CLASS_COLORS[key] || FALLBACK[i % FALLBACK.length];
export const dotGradient = (c) => `linear-gradient(135deg,${c[0]},${c[1]})`;

export const SHORT = {
  largecapMF: 'Large-cap', indexETF: 'Index', midSmallMF: 'Mid/Small', equity: 'Equity', elss: 'ELSS',
  sectorETF: 'Sector', debtMF: 'Debt', govtBonds: 'Bonds', digitalGold: 'Gold', digitalSilver: 'Silver', reits: 'REITs',
};
export const shortLabel = (key, label) => SHORT[key] || (label || key).split(/[ (]/)[0];

export const PROFILES = ['conservative', 'moderate', 'aggressive'];
export const PROFILE_META = {
  conservative: { tag: 'Steady', say: 'Move some money somewhere safer.', hint: 'Debt and large-caps lead',
    shape: [12, 45, 33, 10], wob: 'M0 16 C10 14 14 12 22 15 S38 18 46 15 S62 12 72 15 S88 17 96 14' },
  moderate: { tag: 'Balanced', say: 'Feel it, but stay the course.', hint: 'A blend of growth and safety',
    shape: [30, 40, 20, 10], wob: 'M0 16 C8 8 14 24 22 14 S36 6 46 16 S60 26 70 14 S86 8 96 15' },
  aggressive: { tag: 'Bold', say: 'Buy more. It’s on sale.', hint: 'Mid and small-caps lead',
    shape: [55, 25, 15, 5], wob: 'M0 18 C6 4 12 28 20 10 S30 2 38 20 S52 30 60 8 S76 0 84 22 S92 26 96 12' },
};
export const SHAPE_C = ['#7F8FD0', '#5B8DB8', '#5FB59B', '#D5AC5E'];

/* ---- festivals: fetched once from the backend, same data the planner uses ---- */
let festCache = null;
let festPromise = null;
export function useFestivals() {
  const [fests, setFests] = useState(festCache || []);
  useEffect(() => {
    if (festCache) return;
    festPromise = festPromise || api.festivals().then((r) => (festCache = r.festivals || [])).catch(() => (festCache = []));
    festPromise.then(setFests);
  }, []);
  return fests;
}
// The festival window (if any) that a debit date falls in; mirrors the planner.
export function festFor(fests, d) {
  let best = null;
  for (const f of fests) {
    const end = new Date(f.date + 'T00:00:00');
    const start = new Date(end);
    start.setDate(start.getDate() - f.windowWeeksBefore * 7);
    if (d >= start && d <= end && (!best || f.goldTiltFactor > best.goldTiltFactor)) best = f;
  }
  return best;
}

/* ---- month maths, same convention as the backend planner ---- */
export function firstMonth(day, today = new Date()) {
  let m = today.getMonth();
  if (today.getDate() > day) m += 1;
  return { y: today.getFullYear(), m };
}
export function monthList(months, day, fests, today = new Date()) {
  const fm = firstMonth(day, today);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(fm.y, fm.m + i, day);
    return { i, d, label: `${MON[d.getMonth()]} ${d.getFullYear()}`, fest: festFor(fests, d) };
  });
}
// Same convention as the app's futureValue() in utils/sipProjections.js.
export function valueAt(amounts, t, annualPct) {
  const r = annualPct / 100 / 12;
  let v = 0;
  for (let i = 0; i < t; i += 1) v += amounts[i] * Math.pow(1 + r, t - i);
  return v;
}
export function bez(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
export const useReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
