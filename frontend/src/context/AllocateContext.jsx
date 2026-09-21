import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { getPrefs } from '../utils/prefs.js';

// Holds all Allocate-page state + the generation calls. Mounted at App level so
// a generated allocation / SIP plan (and any in-flight request) survives
// navigating to another tab and back — the provider never unmounts, so results
// land even if the user leaves the page mid-generation.
const AllocateContext = createContext(null);

const PROFILES = ['conservative', 'moderate', 'aggressive'];

// Identifies a SIP request by every input that changes its AI output, so a
// prefetched plan is only ever reused for the exact inputs it was built from.
function sipPlanKey({ profile, total, months, sipDate, stepUp, pauses, infl }) {
  return [profile, total, months, sipDate, stepUp, [...pauses].sort((a, b) => a - b).join(','), infl].join('|');
}

export function useAllocate() {
  return useContext(AllocateContext);
}

export function AllocateProvider({ children }) {
  const prefs = getPrefs(); // localStorage SIP defaults (Settings → SIP Preferences)

  const [mode, setMode] = useState('lumpsum'); // 'lumpsum' | 'sip'
  const [amount, setAmount] = useState(500000);
  const [profile, setProfile] = useState(prefs.riskProfile);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showFunds, setShowFunds] = useState(false);

  // SIP-specific state (initial values seeded from saved preferences)
  const [sipTotal, setSipTotal] = useState(prefs.monthlyAmount * prefs.months);
  const [months, setMonths] = useState(prefs.months);
  const [sipDate, setSipDate] = useState(prefs.sipDate);
  const [stepUpOn, setStepUpOn] = useState(false);
  const [stepUpPct, setStepUpPct] = useState(10);
  const [pauseMonths, setPauseMonths] = useState([]);
  const [inflation, setInflation] = useState(6);
  const [sipPlan, setSipPlan] = useState(null);
  // Resolved plans by risk profile for the current inputs (filled as the
  // background prefetch lands), so the UI can say which styles are ready.
  const [profilePlans, setProfilePlans] = useState({});
  const [sipLoading, setSipLoading] = useState(false);
  const [sipError, setSipError] = useState(null);

  // In-flight/resolved SIP-plan requests, keyed by exact inputs. Lets a
  // background prefetch for the other two risk profiles land before the user
  // ever asks for them, and lets a real request reuse it instead of re-waiting
  // through the ~15-30s AI call it already kicked off.
  const sipPlanCache = useRef({});

  const fetchSipPlan = useCallback(
    (p) => {
      const key = sipPlanKey({
        profile: p, total: Number(sipTotal), months: Number(months), sipDate: Number(sipDate),
        stepUp: stepUpOn ? Number(stepUpPct) : 0, pauses: pauseMonths, infl: Number(inflation),
      });
      if (!sipPlanCache.current[key]) {
        sipPlanCache.current[key] = api
          .sipPlan({
            totalAmount: Number(sipTotal),
            months: Number(months),
            sipDate: Number(sipDate),
            riskProfile: p,
            stepUpPct: stepUpOn ? Number(stepUpPct) : 0,
            pauseMonths,
            inflationPct: Number(inflation),
          })
          .catch((err) => {
            delete sipPlanCache.current[key]; // don't poison the cache with a failure
            throw err;
          });
      }
      return sipPlanCache.current[key];
    },
    [sipTotal, months, sipDate, stepUpOn, stepUpPct, pauseMonths, inflation]
  );

  const submit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await api.allocate(Number(amount), profile);
        setResult(res);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [amount, profile]
  );

  const submitSip = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setSipLoading(true);
      setSipError(null);
      setSipPlan(null);
      setProfilePlans({});
      try {
        const res = await fetchSipPlan(profile);
        setSipPlan(res);
        setProfilePlans({ [profile]: res });
        // While the user reads this plan, get the other two profiles ready in
        // the background — same inputs, just a different split — so switching
        // the profile toggle and regenerating lands instantly instead of
        // re-waiting through the AI call.
        PROFILES.filter((p) => p !== profile).forEach((p) => {
          fetchSipPlan(p)
            .then((r) => setProfilePlans((prev) => ({ ...prev, [p]: r })))
            .catch(() => {}); // speculative — a failure here is silent
        });
      } catch (err) {
        setSipError(err.message);
      } finally {
        setSipLoading(false);
      }
    },
    [profile, fetchSipPlan]
  );

  // Monthly-amount view of the SIP total, for the jar/slider UI. The API still
  // takes a total, so changing months keeps the monthly amount constant.
  const monthly = Math.round(Number(sipTotal) / Number(months)) || 0;
  const setMonthly = useCallback((m) => setSipTotal(Math.round(m) * Number(months)), [months]);
  const setDuration = useCallback((n) => {
    setSipTotal(monthly * n);
    setMonths(n);
    setPauseMonths([]);
  }, [monthly]);

  // Flip the shown SIP plan to another risk profile. The other two were
  // prefetched when the plan was generated, so this is normally instant.
  const selectSipProfile = useCallback(
    async (p) => {
      setProfile(p);
      setSipError(null);
      const pending = fetchSipPlan(p);
      try {
        const res = await Promise.race([pending, new Promise((r) => setTimeout(() => r(null), 60))]);
        if (res) { setSipPlan(res); return; }
        setSipLoading(true); // not ready yet: show the reading screen until it lands
        setSipPlan(await pending);
      } catch (err) {
        setSipError(err.message);
      } finally {
        setSipLoading(false);
      }
    },
    [fetchSipPlan]
  );

  // Lump sum has no prefetch: switching profile re-runs the allocation.
  const selectLumpProfile = useCallback(
    async (p) => {
      setProfile(p);
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        setResult(await api.allocate(Number(amount), p));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [amount]
  );

  const togglePause = useCallback((i) => {
    setPauseMonths((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }, []);

  const value = {
    mode, setMode,
    amount, setAmount,
    profile, setProfile,
    result, loading, error,
    showFunds, setShowFunds,
    sipTotal, setSipTotal,
    months, setMonths,
    sipDate, setSipDate,
    stepUpOn, setStepUpOn,
    stepUpPct, setStepUpPct,
    pauseMonths, setPauseMonths,
    inflation, setInflation,
    sipPlan, sipLoading, sipError,
    submit, submitSip, togglePause,
    monthly, setMonthly, setDuration, selectSipProfile, selectLumpProfile, profilePlans,
  };

  return <AllocateContext.Provider value={value}>{children}</AllocateContext.Provider>;
}
