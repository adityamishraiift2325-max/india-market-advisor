import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Collapsed by default — pick a broker, get a short numbered "how to actually
// start these SIPs" guide tailored to the asset classes in this plan.
export default function BrokerGuide({ assetClasses }) {
  const [brokers, setBrokers] = useState([]);
  const [selected, setSelected] = useState('');
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.brokers().then((r) => setBrokers(r.brokers)).catch(() => setBrokers([]));
  }, []);

  async function pick(id) {
    setSelected(id);
    setGuide(null);
    if (!id) return;
    setLoading(true);
    try {
      const g = await api.brokerGuide({ brokerId: id, assetClasses });
      setGuide(g);
    } catch {
      setGuide(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="broker-guide">
      <label className="broker-select-label">
        Choose where you'll invest
        <select value={selected} onChange={(e) => pick(e.target.value)}>
          <option value="">Select a platform…</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      {loading && <p className="muted small">Loading guide…</p>}

      {guide && (
        <div className="broker-panel">
          <p className="broker-tagline">{guide.tagline}</p>

          <div className="broker-block">
            <h5>1. Set up your account</h5>
            <ol className="broker-steps">
              {guide.account.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          <div className="broker-block">
            <h5>2. Start each SIP in your plan</h5>
            <div className="broker-assets">
              {guide.steps.map((s) => (
                <div key={s.assetClass} className="broker-asset-row">
                  <span className="ba-label">{s.label}</span>
                  <span className="ba-how">{s.how}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
