import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const MacroAlertContext = createContext(null);

export function useMacroAlerts() {
  return useContext(MacroAlertContext);
}

export function MacroAlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.macroAlerts();
      setAlerts(r.alerts || []);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Snapshot current macro as the baseline, then clear the banner.
  const markReviewed = useCallback(async () => {
    try {
      await api.saveMacroBaseline();
    } catch {
      /* even if the save fails, hide locally so the user isn't stuck */
    }
    setAlerts([]);
  }, []);

  return (
    <MacroAlertContext.Provider value={{ alerts, loading, markReviewed, reload: load }}>
      {children}
    </MacroAlertContext.Provider>
  );
}
