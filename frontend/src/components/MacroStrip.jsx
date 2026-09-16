import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useRefresh } from '../context/RefreshContext.jsx';

function fmt(n, digits = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function Chip({ label, value, sub }) {
  return (
    <div className="chip">
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
      {sub != null && <span className="chip-sub">{sub}</span>}
    </div>
  );
}

export default function MacroStrip() {
  const [macro, setMacro] = useState(null);
  const [indices, setIndices] = useState(null);
  const { token, refreshing, refresh } = useRefresh();

  // Refetch whenever the refresh token bumps (initial load is token 0).
  useEffect(() => {
    api.macro().then(setMacro).catch(() => {});
    api.indices().then((r) => setIndices(r.data)).catch(() => {});
  }, [token]);

  const ind = macro?.indicators;
  const nifty = indices?.find((i) => i.key === 'nifty50');
  const sensex = indices?.find((i) => i.key === 'sensex');
  const gold = macro?.live?.gold;
  const usdinr = macro?.live?.usdinr;

  // Most recent session date across the live market chips.
  const asOf = [nifty?.asOf, sensex?.asOf].filter(Boolean).sort().pop();
  const asOfLabel = asOf ? new Date(asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <>
      <div className="macro-strip">
        <Chip label="NIFTY 50" value={fmt(nifty?.price)} sub={nifty ? `${nifty.returns?.d1 >= 0 ? '▲' : '▼'} ${fmt(nifty.returns?.d1)}%` : null} />
        <Chip label="SENSEX" value={fmt(sensex?.price)} sub={sensex ? `${sensex.returns?.d1 >= 0 ? '▲' : '▼'} ${fmt(sensex.returns?.d1)}%` : null} />
        <Chip label="USD/INR" value={fmt(usdinr?.price)} />
        <Chip label="Gold $/oz" value={fmt(gold?.price)} />
        <Chip label="Repo Rate" value={ind ? `${ind.repoRate}%` : '—'} />
        <Chip label="CPI" value={ind ? `${ind.cpiInflation}%` : '—'} />
        <Chip label="FII" value={ind?.fiiTrend || '—'} />
      </div>
      <div className="data-freshness">
        {asOfLabel && <span>Market data as of {asOfLabel}{nifty?.seed ? ' · illustrative' : ''}</span>}
        <button type="button" className="refresh-btn" onClick={refresh} disabled={refreshing} title="Refresh live market data">
          <span className={refreshing ? 'spin' : ''}>↻</span> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </>
  );
}
