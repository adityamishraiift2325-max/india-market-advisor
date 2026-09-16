import { useNavigate } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function pct(n) {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export default function SectorCard({ sector, outlook }) {
  const navigate = useNavigate();
  const up = (sector.returns?.d1 ?? 0) >= 0;
  const color = up ? '#4ade80' : '#f87171';

  const badge = outlook?.outlook;
  const badgeClass =
    badge === 'bullish' ? 'badge bullish' : badge === 'bearish' ? 'badge bearish' : badge === 'neutral' ? 'badge neutral' : 'badge loading';

  return (
    <button className="sector-card" onClick={() => navigate(`/sectors/${sector.key}`)}>
      <div className="sector-card-head">
        <h3>{sector.name}</h3>
        {sector.seed && <span className="seed-tag" title="Illustrative fallback data">demo</span>}
      </div>

      <div className="sector-price">{fmt(sector.price)}</div>

      <div className="returns-row">
        <span className={up ? 'pos' : 'neg'}>{pct(sector.returns?.d1)}</span>
        <span className="muted">1D</span>
        <span className={sector.returns?.m1 >= 0 ? 'pos' : 'neg'}>{pct(sector.returns?.m1)}</span>
        <span className="muted">1M</span>
      </div>

      <Sparkline data={sector.sparkline} color={color} />

      <div className="sector-card-foot">
        {badge ? (
          <span className={badgeClass}>{badge}</span>
        ) : (
          <span className="badge loading">analyze →</span>
        )}
        <span className="ytd muted">YTD {pct(sector.returns?.ytd)}</span>
      </div>
    </button>
  );
}
