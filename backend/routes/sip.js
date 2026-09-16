import { Router } from 'express';
import {
  trackPlan,
  getTrackedPlan,
  logActual,
  clearTracking,
  computeHealth,
  computeCatchUp,
  applyRevision,
} from '../services/sipTracker.js';
import { previewRevision } from '../services/sipRevision.js';

const router = Router();

// Save a generated SIP plan as the one being tracked.
router.post('/track-plan', (req, res, next) => {
  try {
    const plan = req.body?.plan || req.body;
    if (!plan || !Array.isArray(plan.schedule)) {
      return res.status(400).json({ error: 'A generated SIP plan (with a schedule) is required.' });
    }
    res.json({ ok: true, plan: trackPlan(plan) });
  } catch (err) {
    next(err);
  }
});

router.get('/tracked-plan', (req, res, next) => {
  try {
    res.json({ plan: getTrackedPlan() });
  } catch (err) {
    next(err);
  }
});

router.post('/log-actual', (req, res, next) => {
  try {
    res.json({ ok: true, entry: logActual(req.body || {}) });
  } catch (err) {
    next(err);
  }
});

router.get('/health-score', (req, res, next) => {
  try {
    res.json(computeHealth());
  } catch (err) {
    next(err);
  }
});

router.get('/catch-up', (req, res, next) => {
  try {
    res.json(computeCatchUp());
  } catch (err) {
    next(err);
  }
});

// Regenerate the plan's remaining months under a new risk profile and return
// the rupee-level diff. Read-only — nothing is saved until /revise-confirm.
router.post('/revise-preview', async (req, res, next) => {
  try {
    const { riskProfile } = req.body || {};
    if (!riskProfile) {
      return res.status(400).json({ error: 'riskProfile is required.' });
    }
    res.json(await previewRevision({ riskProfile }));
  } catch (err) {
    next(err);
  }
});

// Persist a previously previewed revision — echoes back `toRiskProfile` and
// `newSchedule` from the /revise-preview response so what's applied is exactly
// what the user saw, without a second (possibly different) AI call.
router.post('/revise-confirm', (req, res, next) => {
  try {
    const { toRiskProfile, newSchedule, instruments } = req.body || {};
    if (!toRiskProfile || !Array.isArray(newSchedule) || !newSchedule.length) {
      return res.status(400).json({ error: 'toRiskProfile and newSchedule are required.' });
    }
    const { plan, revision } = applyRevision({ toRiskProfile, newSchedule, instruments });
    res.json({ ok: true, plan, revision });
  } catch (err) {
    next(err);
  }
});

router.post('/clear', (req, res, next) => {
  try {
    clearTracking();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
