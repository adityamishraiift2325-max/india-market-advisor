import { useEffect, useState } from 'react';
import { api } from '../api.js';
import SectorCard from '../components/SectorCard.jsx';

export default function Sectors() {
  const [sectors, setSectors] = useState([]);
  const [insights, setInsights] = useState({});
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    api.sectors()
      .then((r) => setSectors(r.data))
      .finally(() => setLoading(false));
  }, []);

  // Fetch AI outlook badges for all sectors (sequential to limit load).
  async function analyzeAll() {
    setAnalyzing(true);
    for (const s of sectors) {
      try {
        const res = await api.analyzeSector(s.key);
        setInsights((prev) => ({ ...prev, [s.key]: res }));
      } catch {
        /* skip failures (e.g. no API key) */
      }
    }
    setAnalyzing(false);
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Sector Dashboard</h2>
        <button className="btn" onClick={analyzeAll} disabled={analyzing || !sectors.length}>
          {analyzing ? 'Analyzing…' : 'Run AI Outlook on all'}
        </button>
      </div>

      <p className="muted small">
        Click any card for a full AI deep-dive. Outlook badges require an Anthropic API key.
      </p>

      <div className="card-grid">
        {loading && <p className="muted">Loading sectors…</p>}
        {sectors.map((s) => (
          <SectorCard key={s.key} sector={s} outlook={insights[s.key]} />
        ))}
      </div>
    </div>
  );
}
