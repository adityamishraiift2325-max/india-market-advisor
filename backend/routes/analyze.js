import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeSector,
  generateAllocation,
  getMarketNarrative,
  generateSipAllocations,
} from '../services/claudeService.js';
import { getSectorByKey, getIndices, sectors, getNiftyPE } from '../services/marketData.js';
import { getMacroContextString } from '../services/macroContext.js';
import { withCache } from '../services/cache.js';
import { buildSipPlan, SIP_ASSETS } from '../services/sipPlanner.js';
import { planPlatforms } from '../services/platformPlanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brokers = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'brokers.json'), 'utf-8')
);
const SIP_LABELS = Object.fromEntries(SIP_ASSETS.map((a) => [a.key, a.label]));

const router = Router();

// Broker setup guide — deterministic (no AI latency). Returns the account steps
// plus only the per-asset how-to lines relevant to THIS plan's asset classes.
// Fewest platforms that cover this plan's asset classes.
router.post('/platform-plan', (req, res) => {
  const { assetClasses = [] } = req.body;
  if (!Array.isArray(assetClasses)) {
    return res.status(400).json({ error: 'assetClasses must be an array.' });
  }
  res.json(planPlatforms(assetClasses));
});

router.post('/broker-guide', (req, res) => {
  const { brokerId, assetClasses = [] } = req.body;
  const broker = brokers.brokers.find((b) => b.id === brokerId);
  if (!broker) return res.status(404).json({ error: `Unknown broker: ${brokerId}` });

  const keys = Array.isArray(assetClasses) && assetClasses.length
    ? assetClasses
    : SIP_ASSETS.map((a) => a.key);
  const steps = keys
    .filter((k) => broker.assetHowTo[k])
    .map((k) => ({ assetClass: k, label: SIP_LABELS[k] || k, how: broker.assetHowTo[k] }));

  res.json({
    id: broker.id,
    name: broker.name,
    tagline: broker.tagline,
    account: broker.account,
    steps,
  });
});

// Lightweight broker list for the selector.
router.get('/brokers', (req, res) => {
  res.json({ brokers: brokers.brokers.map((b) => ({ id: b.id, name: b.name, tagline: b.tagline })) });
});

// Core SIP feature: build a month-by-month plan. Not cached (depends on inputs).
router.post('/sip-plan', async (req, res, next) => {
  try {
    const {
      totalAmount,
      months = 12,
      sipDate = 1,
      riskProfile = 'moderate',
      stepUpPct = 0,
      pauseMonths = [],
      inflationPct = 6,
    } = req.body;

    const amt = Number(totalAmount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'A positive "totalAmount" is required.' });
    }
    const m = Number(months);
    if (!m || m < 1 || m > 120) {
      return res.status(400).json({ error: 'months must be between 1 and 120.' });
    }
    if (!['conservative', 'moderate', 'aggressive'].includes(riskProfile)) {
      return res.status(400).json({ error: 'invalid riskProfile.' });
    }
    const day = Number(sipDate);
    if (!day || day < 1 || day > 28) {
      return res.status(400).json({ error: 'sipDate must be between 1 and 28.' });
    }
    const pauses = Array.isArray(pauseMonths) ? pauseMonths.map(Number).filter((n) => n >= 0 && n < m) : [];
    if (pauses.length >= m) {
      return res.status(400).json({ error: 'Cannot pause every month.' });
    }

    // Independent I/O — run together instead of stacking their latency.
    const [macroContext, niftyPE] = await Promise.all([getMacroContextString(), getNiftyPE()]);
    const ai = await generateSipAllocations({ riskProfile, macroContext, niftyPE });

    const plan = buildSipPlan({
      totalAmount: amt,
      months: m,
      sipDate: day,
      stepUpPct: Number(stepUpPct) || 0,
      pauseMonths: pauses,
      inflationPct: Number(inflationPct) || 6,
      allocationPct: ai.allocationPct,
      instruments: ai.instruments,
      estimatedXIRR: ai.estimatedXIRR,
      strategyNote: ai.strategyNote,
      niftyPE,
    });
    plan.riskProfile = riskProfile;
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// Per-sector AI analysis. Cached 15 min to limit Claude calls.
router.get('/sector/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const [sector, macroContext] = await Promise.all([getSectorByKey(key), getMacroContextString()]);
    if (!sector) return res.status(404).json({ error: `Unknown sector: ${key}` });

    const result = await withCache(`analysis_${key}`, () =>
      analyzeSector(sector.name, sector, macroContext)
    );
    res.json({ sector: sector.name, key, ...result });
  } catch (err) {
    next(err);
  }
});

// Daily market narrative. Cached 15 min.
router.get('/narrative', async (req, res, next) => {
  try {
    const [indicesRes, macroContext] = await Promise.all([getIndices(), getMacroContextString()]);
    const result = await withCache('narrative', () =>
      getMarketNarrative(indicesRes.data, macroContext)
    );
    res.json({ narrative: result.data, cached: result.cached });
  } catch (err) {
    next(err);
  }
});

// Core value: generate an allocation. Not cached (depends on user input).
router.post('/allocate', async (req, res, next) => {
  try {
    const { amount, riskProfile = 'moderate' } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'A positive "amount" is required.' });
    }
    const validProfiles = ['conservative', 'moderate', 'aggressive'];
    if (!validProfiles.includes(riskProfile)) {
      return res
        .status(400)
        .json({ error: `riskProfile must be one of ${validProfiles.join(', ')}` });
    }

    const [macroContext, indicesRes] = await Promise.all([getMacroContextString(), getIndices()]);

    // Compact sector momentum snapshot for the allocation prompt.
    const sectorInsights = indicesRes.data
      .filter((s) => !s.error)
      .map((s) => ({ name: s.name, returns: s.returns, price: s.price }));

    const allocation = await generateAllocation({
      amount: amt,
      riskProfile,
      sectorInsights,
      macroContext,
      assetClasses: sectors.assetClasses,
    });

    res.json(allocation);
  } catch (err) {
    next(err);
  }
});

export default router;
