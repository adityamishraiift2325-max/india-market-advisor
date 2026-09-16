import { Router } from 'express';
import { simulateHistoricalSip } from '../services/simulator.js';

const router = Router();

// Backtest a monthly SIP over the last N years. Not cached (depends on inputs;
// each run hits Yahoo for monthly history).
router.post('/historical-sip', async (req, res, next) => {
  try {
    const { monthlyAmount, years = 5, riskProfile = 'moderate' } = req.body;
    const amt = Number(monthlyAmount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'A positive "monthlyAmount" is required.' });
    }
    const y = Number(years);
    if (!y || y < 1 || y > 15) {
      return res.status(400).json({ error: 'years must be between 1 and 15.' });
    }
    if (!['conservative', 'moderate', 'aggressive'].includes(riskProfile)) {
      return res.status(400).json({ error: 'invalid riskProfile.' });
    }
    const result = await simulateHistoricalSip({ monthlyAmount: amt, years: y, riskProfile });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
