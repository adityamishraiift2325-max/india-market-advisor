import { Router } from 'express';
import {
  getIndices,
  getSectors,
  getCommodities,
  getForex,
} from '../services/marketData.js';
import { clearCache } from '../services/cache.js';

const router = Router();

// Force-refresh live market data: clears the price caches so the next fetch
// pulls fresh from the source. Leaves AI analyses/narrative caches intact.
router.post('/refresh', (req, res) => {
  const cleared = clearCache(['indices', 'sectors', 'commodities', 'forex']);
  res.json({ ok: true, cleared, at: new Date().toISOString() });
});

router.get('/indices', async (req, res, next) => {
  try {
    const result = await getIndices();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/sectors', async (req, res, next) => {
  try {
    const result = await getSectors();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/commodities', async (req, res, next) => {
  try {
    const result = await getCommodities();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/forex', async (req, res, next) => {
  try {
    const result = await getForex();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
