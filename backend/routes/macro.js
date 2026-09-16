import { Router } from 'express';
import { getMacro, saveOverrides, resetOverrides } from '../services/macroContext.js';
import { getMacroAlerts, snapshotBaseline } from '../services/macroAlerts.js';

const router = Router();

// Macro trigger alerts vs the user's reviewed baseline.
router.get('/alerts', async (req, res, next) => {
  try {
    res.json(await getMacroAlerts());
  } catch (err) {
    next(err);
  }
});

// Snapshot current macro as the reviewed baseline (silences current alerts).
router.post('/baseline', async (req, res, next) => {
  try {
    res.json(await snapshotBaseline());
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const macro = await getMacro();
    res.json(macro);
  } catch (err) {
    next(err);
  }
});

// Manual override of slow-moving macro indicators (repo rate, CPI, etc.)
router.post('/override', (req, res, next) => {
  try {
    const allowed = [
      'repoRate',
      'cpiInflation',
      'iip',
      'fiiTrend',
      'diiTrend',
      'gdpGrowth',
    ];
    const partial = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) partial[key] = req.body[key];
    }
    const saved = saveOverrides(partial);
    res.json({ ok: true, indicators: saved });
  } catch (err) {
    next(err);
  }
});

// Reset the six maintained indicators back to the app defaults.
router.post('/reset', (req, res, next) => {
  try {
    res.json({ ok: true, indicators: resetOverrides() });
  } catch (err) {
    next(err);
  }
});

// Static baseline for SIP/lumpsum XIRR comparisons — typical large-bank 1-3yr FD rate.
router.get('/fd-rate', (req, res) => {
  res.json({ rate: 6.8, label: 'Bank FD (1-3yr)' });
});

export default router;
