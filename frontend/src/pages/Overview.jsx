import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import SectorCard from '../components/SectorCard.jsx';
import { useRefresh } from '../context/RefreshContext.jsx';

export default function Overview() {
  const [indices, setIndices] = useState([]);
  const [narrative, setNarrative] = useState(null);
  const [narrErr, setNarrErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { token } = useRefresh();

  // Index prices refetch on refresh; the AI narrative is fetched once (its cache
  // isn't busted by a price refresh, so re-pulling it would add nothing).
  useEffect(() => {
    api.indices()
      .then((r) => setIndices(r.data))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    api.narrative()
      .then((r) => setNarrative(r.narrative))
      .catch((e) => setNarrErr(e.message));
  }, []);

  const broad = indices.filter((i) => i.type === 'broad');
  const sectors = indices.filter((i) => i.type === 'sector');

  return (
    <div className="page">
      <section className="narrative-card">
        <h2>Today's Market Briefing</h2>
        {narrative ? (
          <p>{narrative}</p>
        ) : narrErr ? (
          <p className="muted">
            AI briefing unavailable: {narrErr}. Add your Anthropic API key in{' '}
            <a onClick={() => navigate('/settings')} className="link">Settings</a>.
          </p>
        ) : (
          <p className="muted">Generating briefing…</p>
        )}
      </section>

      <h2 className="section-title">Broad Indices</h2>
      <div className="card-grid">
        {loading && <p className="muted">Loading market data…</p>}
        {broad.map((s) => <SectorCard key={s.key} sector={s} />)}
      </div>

      <h2 className="section-title">Sectors</h2>
      <div className="card-grid">
        {sectors.map((s) => <SectorCard key={s.key} sector={s} />)}
      </div>
    </div>
  );
}
