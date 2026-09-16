import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../api.js';

// App-wide "refresh live data" signal. refresh() busts the backend price caches
// then bumps a token; market-data views include the token in their fetch deps,
// so they re-pull fresh in place — no full page reload, no lost state.
//
// Besides the manual "Refresh" CTA, this also self-heals stale long-lived tabs:
// a background poll every few minutes, and an immediate poll whenever the tab
// regains focus (covers the common case of a browser tab left open for hours/
// days — without this, a mounted page only ever fetches once, on mount).
const RefreshContext = createContext(null);

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min — matches backend's own cache TTL
const FOCUS_POLL_MIN_GAP_MS = 60 * 1000; // don't re-poll on rapid tab-switch spam

export function useRefresh() {
  return useContext(RefreshContext);
}

export function RefreshProvider({ children }) {
  const [token, setToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const lastPollRef = useRef(0);

  // Hard refresh: busts the server-side cache so the next fetch is guaranteed
  // live, not just "within TTL". Used by the manual Refresh button.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.refreshMarket();
    } catch {
      /* even if the cache-bust call fails, still refetch what we can */
    }
    setToken((t) => t + 1);
    lastPollRef.current = Date.now();
    setLastRefreshed(new Date());
    setRefreshing(false);
  }, []);

  // Soft poll: just asks consumers to refetch through the normal (cached)
  // endpoints. Cheap — only becomes a live Yahoo call once the backend's own
  // 15-min TTL has actually expired, so this can run often without hammering
  // the data source.
  const poll = useCallback(() => {
    lastPollRef.current = Date.now();
    setToken((t) => t + 1);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') poll();
    }, POLL_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastPollRef.current < FOCUS_POLL_MIN_GAP_MS) return;
      poll();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [poll]);

  return (
    <RefreshContext.Provider value={{ token, refreshing, lastRefreshed, refresh }}>
      {children}
    </RefreshContext.Provider>
  );
}
