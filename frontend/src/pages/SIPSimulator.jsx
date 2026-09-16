import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { api } from '../api.js';
import { getPrefs } from '../utils/prefs.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const PROFILES = ['conservative', 'moderate', 'aggressive'];
const HORIZONS = [3, 5, 7, 10];

function rupees(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function shortR(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return rupees(n);
}

export default function SIPSimulator() {
  const prefs = getPrefs();
  const [monthly, setMonthly] = useState(prefs.monthlyAmount);
  const [years, setYears] = useState(5);
  const [profile, setProfile] = useState(prefs.riskProfile);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.simulateHistoricalSip({ monthlyAmount: Number(monthly), years: Number(years), riskProfile: profile });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h2>SIP Simulator</h2>
      <p className="muted small">
        “If I’d run this SIP over the last few years, what would it be worth today?” Backtests a{' '}
        {profile} allocation on real market history — equity, mid-cap, gold and silver use actual
        monthly prices; debt, G-secs and REITs use labelled assumed returns.
      </p>

      <form className="allocate-form" onSubmit={run}>
        <label>
          Monthly SIP (₹)
          <input type="number" min="500" step="500" value={monthly} onChange={(e) => setMonthly(e.target.value)} required />
        </label>
        <label>
          Look back
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {HORIZONS.map((h) => <option key={h} value={h}>{h} years</option>)}
          </select>
        </label>
        <label>
          Risk profile
          <div className="profile-toggle">
            {PROFILES.map((p) => (
              <button type="button" key={p} className={`profile-btn ${profile === p ? 'active' : ''}`} onClick={() => setProfile(p)}>
                {p}
              </button>
            ))}
          </div>
        </label>
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Backtesting…' : 'Run backtest'}
        </button>
      </form>

      {error && <p className="muted error-box">{error}</p>}

      {result && <SimResult result={result} />}
    </div>
  );
}

function SimResult({ result }) {
  const beatFd = result.finalValue >= result.fd.value;
  const labels = result.series.map((s) => s.date.slice(0, 7));

  const data = {
    labels,
    datasets: [
      {
        label: 'Portfolio value',
        data: result.series.map((s) => s.value),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,.15)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.25,
      },
      {
        label: 'Invested',
        data: result.series.map((s) => s.invested),
        borderColor: '#94a3b8',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${shortR(ctx.parsed.y)}` } },
    },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
      y: { ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => shortR(v) }, grid: { color: 'rgba(148,163,184,.08)' } },
    },
  };

  return (
    <div className="allocation-result">
      <p className="muted small">Period: {result.period.from} → {result.period.to} ({result.inputs.months} monthly instalments)</p>

      <div className="sim-hero">
        <div className="sim-stat"><span>You invested</span><strong>{shortR(result.totalInvested)}</strong></div>
        <div className="sim-stat big"><span>Would be worth</span><strong>{shortR(result.finalValue)}</strong></div>
        <div className="sim-stat"><span>Gain</span><strong className={result.absoluteGain >= 0 ? 'pos' : 'neg'}>{result.absoluteGain >= 0 ? '+' : ''}{shortR(result.absoluteGain)}</strong></div>
        <div className="sim-stat"><span>XIRR</span><strong className="pos">{result.xirr != null ? `${result.xirr}%` : '—'}</strong></div>
        <div className="sim-stat"><span>Growth</span><strong>{result.multiple}×</strong></div>
      </div>

      <p className={`sim-verdict ${beatFd ? 'pos' : 'neg'}`}>
        {beatFd
          ? `This blend beat a ${result.fd.rate}% FD by ${shortR(result.finalValue - result.fd.value)} (FD would be ${shortR(result.fd.value)}).`
          : `A ${result.fd.rate}% FD would have done better here (${shortR(result.fd.value)} vs ${shortR(result.finalValue)}).`}
      </p>

      <div style={{ height: 300, marginTop: 12 }}>
        <Line data={data} options={options} />
      </div>

      <h3 style={{ marginTop: 24 }}>By asset class</h3>
      <table className="alloc-table">
        <thead>
          <tr><th>Asset class</th><th>Source</th><th>Invested</th><th>Final value</th><th>Gain</th><th>Gain %</th></tr>
        </thead>
        <tbody>
          {result.perClass.map((c) => {
            const g = c.finalValue - c.invested;
            const gPct = c.invested > 0 ? (g / c.invested) * 100 : 0;
            return (
              <tr key={c.key}>
                <td><div className="ac-name">{c.label}</div><div className="ac-reason">{c.proxy}</div></td>
                <td><span className={`badge ${c.source === 'market' ? 'bullish' : 'neutral'}`}>{c.source === 'market' ? 'market data' : 'assumed'}</span></td>
                <td>{rupees(c.invested)}</td>
                <td>{rupees(c.finalValue)}</td>
                <td className={g >= 0 ? 'xirr-cell' : ''} style={g < 0 ? { color: 'var(--neg)' } : {}}>{g >= 0 ? '+' : ''}{rupees(g)}</td>
                <td className={g >= 0 ? 'xirr-cell' : ''} style={g < 0 ? { color: 'var(--neg)' } : {}}>{gPct >= 0 ? '+' : ''}{gPct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="muted small disclaimer">
        Past performance doesn’t predict future returns. Equity/mid-cap/gold/silver use real index &
        ETF history; debt, G-secs and REITs use assumed flat returns (shown above), so the blended
        figure is an estimate, not an exact record. Not financial advice.
      </p>
    </div>
  );
}
