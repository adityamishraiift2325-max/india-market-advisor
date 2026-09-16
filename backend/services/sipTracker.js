import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Lives in backend/state/, NOT backend/data/ — data/ ships static reference
// files baked into the Docker image (sectors.json, brokers.json, ...); a
// deploy volume mounted there would shadow all of them with an empty mount.
// state/ holds only runtime-written files, so a volume can own it entirely.
const STORE_FILE = path.join(__dirname, '..', 'state', 'sipActuals.json');

function readStore() {
  try {
    if (fs.existsSync(STORE_FILE)) return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch {
    /* fall through to empty */
  }
  return { plan: null, actuals: [] };
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  return store;
}

// Save a compact tracked plan from a generated SIP plan. Re-tracking clears old
// actuals, since their monthIndex maps to the previous schedule.
// Keeps per-asset `allocations` on each row (not just the month total) — the
// strategy-revision feature needs those to diff old vs new asset-class totals.
export function trackPlan(plan) {
  const schedule = (plan.schedule || []).map((r) => ({
    monthIndex: r.monthIndex,
    label: r.label,
    date: r.date,
    expected: r.isPaused ? 0 : r.totalThisMonth,
    cumulative: r.runningTotal,
    allocations: r.allocations || {},
  }));
  // Keep just the fund identity (name/ticker/type/allocationPct within its asset
  // class) — not the rupee amounts, which are tied to the full-plan total and go
  // stale the moment a month elapses or a revision changes the remaining total.
  const instruments = {};
  for (const [key, list] of Object.entries(plan.summary?.instruments || {})) {
    instruments[key] = (list || []).map((f) => ({
      name: f.name, ticker: f.ticker ?? null, type: f.type ?? null, allocationPct: f.allocationPct,
    }));
  }

  const store = readStore();
  store.plan = {
    riskProfile: plan.riskProfile ?? null,
    totalAmount: plan.summary?.totalInvested ?? plan.inputs?.totalAmount ?? null,
    months: plan.inputs?.months ?? schedule.length,
    sipDate: plan.inputs?.sipDate ?? null,
    stepUpPct: plan.inputs?.stepUpPct ?? 0,
    pauseMonths: plan.inputs?.pauseMonths ?? [],
    inflationPct: plan.inputs?.inflationPct ?? 6,
    startDate: schedule[0]?.date ?? null,
    schedule,
    instruments,
    trackedAt: new Date().toISOString(),
  };
  store.actuals = [];
  store.revisions = [];
  return writeStore(store).plan;
}

export function getTrackedPlan() {
  return readStore().plan;
}

export function logActual({ monthIndex, amount }) {
  const store = readStore();
  if (!store.plan) {
    throw Object.assign(new Error('No tracked plan. Track a plan first.'), { status: 400 });
  }
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    throw Object.assign(new Error('A positive amount is required.'), { status: 400 });
  }
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    monthIndex: Number(monthIndex),
    amount: Math.round(amt),
    loggedAt: new Date().toISOString(),
  };
  store.actuals.push(entry);
  writeStore(store);
  return entry;
}

export function clearTracking() {
  return writeStore({ plan: null, actuals: [], revisions: [] });
}

// Apply a previewed strategy revision: splice the new remaining-months schedule
// (already regenerated + diffed by services/sipRevision.js) onto the untouched
// past months, recompute running totals, and log the switch. Past months —
// and any actuals already logged against them — are never touched.
export function applyRevision({ toRiskProfile, newSchedule, instruments }) {
  const store = readStore();
  if (!store.plan) {
    throw Object.assign(new Error('No tracked plan. Track a plan first.'), { status: 400 });
  }
  if (!Array.isArray(newSchedule) || !newSchedule.length) {
    throw Object.assign(new Error('newSchedule is required.'), { status: 400 });
  }

  const fromRiskProfile = store.plan.riskProfile || null;
  const elapsed = newSchedule[0].monthIndex;
  const kept = (store.plan.schedule || []).slice(0, elapsed);

  let running = kept.length ? kept[kept.length - 1].cumulative : 0;
  const spliced = newSchedule.map((r) => {
    running += r.expected;
    return {
      monthIndex: r.monthIndex,
      label: r.label,
      date: r.date,
      expected: r.expected,
      cumulative: running,
      allocations: r.allocations || {},
    };
  });

  store.plan.schedule = [...kept, ...spliced];
  store.plan.riskProfile = toRiskProfile;
  // Fund picks for asset classes that carried over keep their original
  // instruments (same fund, new amount); only newly-added/dropped classes
  // change — sipRevision.js already merged that, we just persist it verbatim.
  if (instruments && typeof instruments === 'object') {
    store.plan.instruments = instruments;
  }

  store.revisions = store.revisions || [];
  const revision = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    atMonthIndex: elapsed,
    from: fromRiskProfile,
    to: toRiskProfile,
    date: new Date().toISOString(),
  };
  store.revisions.push(revision);

  writeStore(store);
  return { plan: store.plan, revision };
}

// How many instalments are due as of `now` (schedule dates that have arrived).
// Exported so the revision service can find the past/future split too.
export function monthsElapsed(schedule, now) {
  const today = now.toISOString().slice(0, 10);
  let n = 0;
  for (const r of schedule) if (r.date <= today) n++;
  return n;
}

export function computeHealth(now = new Date()) {
  const store = readStore();
  const plan = store.plan;
  if (!plan) return { tracked: false };

  const schedule = plan.schedule || [];
  const elapsed = monthsElapsed(schedule, now);
  const expectedToDate = elapsed > 0 ? schedule[elapsed - 1].cumulative : 0;
  const actualInvested = store.actuals.reduce((s, a) => s + a.amount, 0);

  const loggedIdx = new Set(store.actuals.map((a) => a.monthIndex));
  const missedMonths = schedule
    .slice(0, elapsed)
    .filter((r) => r.expected > 0 && !loggedIdx.has(r.monthIndex))
    .map((r) => ({ monthIndex: r.monthIndex, label: r.label, expected: r.expected }));

  // Streak: consecutive most-recent due months that have a logged actual.
  let streak = 0;
  for (let i = elapsed - 1; i >= 0; i--) {
    if (schedule[i].expected === 0) continue; // paused months don't break the streak
    if (loggedIdx.has(schedule[i].monthIndex)) streak++;
    else break;
  }

  const ratio = expectedToDate > 0 ? actualInvested / expectedToDate : 1;
  const adherencePct = Math.round(ratio * 100);
  const score = Math.max(0, Math.min(100, Math.round(Math.min(1, ratio) * 100)));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';

  let status;
  if (elapsed === 0) status = 'not-started';
  else if (actualInvested >= expectedToDate * 1.02) status = 'ahead';
  else if (actualInvested >= expectedToDate * 0.98) status = 'on-track';
  else status = 'behind';

  const nextDue = schedule[elapsed]
    ? {
        monthIndex: schedule[elapsed].monthIndex,
        label: schedule[elapsed].label,
        date: schedule[elapsed].date,
        expected: schedule[elapsed].expected,
      }
    : null;

  return {
    tracked: true,
    riskProfile: plan.riskProfile || null,
    instruments: plan.instruments || {},
    revisions: store.revisions || [],
    months: plan.months,
    totalAmount: plan.totalAmount,
    elapsed,
    expectedToDate: Math.round(expectedToDate),
    actualInvested,
    adherencePct,
    score,
    grade,
    status,
    streak,
    missedMonths,
    missedCount: missedMonths.length,
    nextDue,
    schedule,
    actuals: store.actuals.slice().sort((a, b) => a.monthIndex - b.monthIndex),
  };
}

export function computeCatchUp(now = new Date()) {
  const store = readStore();
  const plan = store.plan;
  if (!plan) return { tracked: false };

  const schedule = plan.schedule || [];
  const elapsed = monthsElapsed(schedule, now);
  const expectedToDate = elapsed > 0 ? schedule[elapsed - 1].cumulative : 0;
  const actualInvested = store.actuals.reduce((s, a) => s + a.amount, 0);
  const shortfall = Math.max(0, Math.round(expectedToDate - actualInvested));
  const remainingMonths = Math.max(0, schedule.length - elapsed);

  return {
    tracked: true,
    behind: shortfall > 0,
    shortfall,
    remainingMonths,
    topUpNow: shortfall,
    spreadPerMonth: remainingMonths > 0 ? Math.round(shortfall / remainingMonths) : null,
  };
}
