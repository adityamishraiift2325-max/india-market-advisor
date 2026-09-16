// SIP preferences persisted in localStorage — used to prefill the Allocate SIP
// form and the Simulator so the user doesn't re-enter their usual values.
const KEY = 'sipPrefs';

const DEFAULTS = {
  riskProfile: 'moderate',
  sipDate: 5,
  months: 12,
  monthlyAmount: 10000,
};

export function getPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore malformed storage */
  }
  return { ...DEFAULTS };
}

export function savePrefs(partial) {
  const merged = { ...getPrefs(), ...partial };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable — non-fatal */
  }
  return merged;
}
