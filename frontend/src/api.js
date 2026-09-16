// Thin fetch wrapper around the backend API.
const BASE = '/api';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => get('/health'),
  indices: () => get('/market/indices'),
  sectors: () => get('/market/sectors'),
  refreshMarket: () => post('/market/refresh', {}),
  macro: () => get('/macro'),
  saveMacro: (overrides) => post('/macro/override', overrides),
  resetMacro: () => post('/macro/reset', {}),
  fdRate: () => get('/macro/fd-rate'),
  macroAlerts: () => get('/macro/alerts'),
  saveMacroBaseline: () => post('/macro/baseline', {}),
  narrative: () => get('/analyze/narrative'),
  analyzeSector: (key) => get(`/analyze/sector/${key}`),
  allocate: (amount, riskProfile) => post('/analyze/allocate', { amount, riskProfile }),
  sipPlan: (payload) => post('/analyze/sip-plan', payload),
  brokers: () => get('/analyze/brokers'),
  brokerGuide: (payload) => post('/analyze/broker-guide', payload),
  platformPlan: (assetClasses) => post('/analyze/platform-plan', { assetClasses }),
  trackSipPlan: (plan) => post('/sip/track-plan', { plan }),
  trackedSipPlan: () => get('/sip/tracked-plan'),
  logSipActual: (payload) => post('/sip/log-actual', payload),
  sipHealth: () => get('/sip/health-score'),
  sipCatchUp: () => get('/sip/catch-up'),
  clearSipTracking: () => post('/sip/clear', {}),
  reviseSipPreview: (riskProfile) => post('/sip/revise-preview', { riskProfile }),
  reviseSipConfirm: (payload) => post('/sip/revise-confirm', payload),
  simulateHistoricalSip: (payload) => post('/simulate/historical-sip', payload),
};
