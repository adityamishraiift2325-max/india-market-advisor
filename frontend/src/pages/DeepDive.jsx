import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Sparkline from '../components/Sparkline.jsx';

function pct(n) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function DeepDive() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [sector, setSector] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.indices()
      .then((r) => {
        const s = r.data.find((x) => x.key === key);
        if (!cancelled) setSector(s);
      });
    api.analyzeSector(key)
      .then((res) => { if (!cancelled) setAnalysis(res); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key]);

  const up = (sector?.returns?.d1 ?? 0) >= 0;

  return (
    <div className="page">
      <button className="link back" onClick={() => navigate(-1)}>← Back</button>

      <div className="deepdive-head">
        <div>
          <h2>{sector?.name || key}</h2>
          <div className="big-price">{sector?.price?.toLocaleString('en-IN') ?? '—'}</div>
        </div>
        {sector && (
          <div className="returns-grid">
            {['d1', 'w1', 'm1', 'ytd'].map((k) => (
              <div key={k} className="return-cell">
                <span className="muted small">{k.toUpperCase()}</span>
                <span className={sector.returns?.[k] >= 0 ? 'pos' : 'neg'}>
                  {pct(sector.returns?.[k])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sector?.sparkline && (
        <div className="deepdive-spark">
          <Sparkline data={sector.sparkline} color={up ? '#4ade80' : '#f87171'} height={80} />
        </div>
      )}

      <section className="analysis">
        <h3>AI Analysis</h3>
        {loading && <p className="muted">Running Claude analysis…</p>}
        {error && (
          <p className="muted">
            Analysis unavailable: {error}. Add your Anthropic API key in{' '}
            <a className="link" onClick={() => navigate('/settings')}>Settings</a>.
          </p>
        )}
        {analysis && (
          <div className="analysis-body">
            <div className={`badge large ${analysis.outlook}`}>
              {analysis.outlook} · {analysis.confidence} confidence
            </div>
            <p className="summary">{analysis.summary}</p>

            <h4>Key Drivers</h4>
            <ul>{analysis.keyDrivers?.map((d, i) => <li key={i}>{d}</li>)}</ul>

            <h4>Risks</h4>
            <ul>{analysis.risks?.map((r, i) => <li key={i}>{r}</li>)}</ul>

            <h4>3-Month View</h4>
            <p>{analysis.threeMonthView}</p>
          </div>
        )}
      </section>
    </div>
  );
}
