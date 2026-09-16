import { useState, useMemo } from 'react';
import { splitByPct } from '../utils/splitByPct.js';
import { assetColors } from '../utils/palette.js';

function rupees(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * "What do I actually do this month?" — the one card that answers it.
 * Defaults to the next instalment that's still due, with arrows to step through
 * the plan. Shows a proportion bar plus the exact rupee split per asset class,
 * and (when known) the single platform that covers the whole thing.
 */
export default function SIPThisMonth({ plan, platform }) {
  const active = useMemo(
    () => plan.schedule.filter((r) => !r.isPaused && r.totalThisMonth > 0),
    [plan]
  );

  // Default to the next instalment still due; if the whole plan is in the past,
  // show the final one rather than snapping back to month 1.
  const todayStr = new Date().toISOString().slice(0, 10);
  const found = active.findIndex((r) => r.date >= todayStr);
  const defaultIdx = found === -1 ? Math.max(0, active.length - 1) : found;
  const [idx, setIdx] = useState(defaultIdx);

  if (!active.length) return null;
  const row = active[Math.min(idx, active.length - 1)];

  const assets = (plan.assets || []).filter((a) => (row.allocations[a.key] || 0) > 0);
  const colors = assetColors(
    (plan.assets || [])
      .filter((a) => (plan.summary.assetClassTotals[a.key] || 0) > 0)
      .map((a) => a.key)
  );
  const instruments = plan.summary.instruments || {};

  const isNext = row.monthIndex === active[defaultIdx]?.monthIndex;
  const single = platform?.minPlatforms === 1 ? platform.singleOptions : null;

  return (
    <div className="this-month-card">
      <div className="tm-head">
        <div>
          <span className="tm-eyebrow">{isNext ? 'Next instalment' : 'Instalment'}</span>
          <h3 className="tm-title">
            {row.label} <span className="muted">· due {row.date.slice(8, 10)}/{row.date.slice(5, 7)}</span>
          </h3>
        </div>
        <div className="tm-right">
          <div className="tm-total">{rupees(row.totalThisMonth)}</div>
          <div className="tm-nav">
            <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0} aria-label="Previous month">‹</button>
            <span className="muted">{idx + 1}/{active.length}</span>
            <button type="button" onClick={() => setIdx((i) => Math.min(active.length - 1, i + 1))} disabled={idx >= active.length - 1} aria-label="Next month">›</button>
          </div>
        </div>
      </div>

      {row.festivalNote && (
        <div className="tm-festival">🪔 {row.festivalNote}</div>
      )}

      {/* Proportion bar — the quick visual */}
      <div className="tm-bar">
        {assets.map((a) => (
          <span
            key={a.key}
            className="tm-seg"
            style={{
              width: `${(row.allocations[a.key] / row.totalThisMonth) * 100}%`,
              background: colors[a.key],
            }}
            title={`${a.label}: ${rupees(row.allocations[a.key])}`}
          />
        ))}
      </div>

      {/* Exact split, with the specific funds under each class */}
      <div className="tm-list">
        {assets.map((a) => {
          const amt = row.allocations[a.key];
          const funds = splitByPct(amt, instruments[a.key] || []);
          return (
            <div key={a.key} className="tm-item">
              <div className="tm-item-head">
                <span className="tm-dot" style={{ background: colors[a.key] }} />
                <span className="tm-label">{a.label}</span>
                <span className="tm-amt">{rupees(amt)}</span>
              </div>
              {funds.length > 0 && (
                <div className="tm-funds">
                  {funds.map((f, i) => (
                    <span key={i} className="tm-fund">
                      {f.name}
                      {f.ticker && <em> {f.ticker}</em>}
                      <strong>{rupees(f.amount)}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {single?.length > 0 && (
        <div className="tm-platform">
          ✅ <strong>One platform covers all of this</strong> — {single.map((s) => s.name).join(' or ')}.
          {single[0].substituteFor?.length > 0 && (
            <span className="muted"> ({single[0].substituteLabels.join(', ')} via an equivalent fund/ETF.)</span>
          )}
        </div>
      )}
      {platform?.minPlatforms > 1 && (
        <div className="tm-platform warn">
          Needs {platform.minPlatforms} platforms: {platform.combo.map((c) => `${c.name} (${c.newlyCoveredLabels.join(', ')})`).join(' + ')}.
        </div>
      )}
    </div>
  );
}
