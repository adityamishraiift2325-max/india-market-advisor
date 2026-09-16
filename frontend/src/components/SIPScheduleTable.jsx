import { useState } from 'react';
import { splitByPct } from '../utils/splitByPct.js';
import { assetColors } from '../utils/palette.js';

function rupees(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Month-by-month schedule. Each row expands to show exactly how that month's
 * amount divides across asset classes and the specific funds — so festival
 * months visibly show the extra gold/silver, rather than just a bigger total.
 */
export default function SIPScheduleTable({ plan }) {
  const [open, setOpen] = useState(null);
  const total = plan.summary.totalInvested;
  const instruments = plan.summary.instruments || {};
  const activeAssets = (plan.assets || []).filter(
    (a) => (plan.summary.assetClassTotals[a.key] || 0) > 0
  );
  const colors = assetColors(activeAssets.map((a) => a.key));

  return (
    <div className="sip-table-wrap">
      <table className="alloc-table">
        <thead>
          <tr>
            <th />
            <th>Month</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Running</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {plan.schedule.map((r) => {
            const isOpen = open === r.monthIndex;
            const canOpen = !r.isPaused && r.totalThisMonth > 0;
            const rowAssets = activeAssets.filter((a) => (r.allocations[a.key] || 0) > 0);
            return [
              <tr
                key={r.monthIndex}
                className={`${r.isPaused ? 'paused-row' : ''} ${canOpen ? 'expandable' : ''} ${isOpen ? 'open' : ''}`}
                onClick={() => canOpen && setOpen(isOpen ? null : r.monthIndex)}
              >
                <td className="caret-cell">{canOpen ? (isOpen ? '▾' : '▸') : ''}</td>
                <td className={r.isPaused ? 'strike' : ''}>{r.label}</td>
                <td>{r.isPaused ? '—' : r.date}</td>
                <td>{r.isPaused ? 'Paused' : rupees(r.totalThisMonth)}</td>
                <td>
                  <div className="run-cell">
                    <div className="run-bar" style={{ width: `${(r.runningTotal / total) * 100}%` }} />
                    <span>{rupees(r.runningTotal)}</span>
                  </div>
                </td>
                <td className="reason">
                  {r.festivalNote && <span className="badge bullish" style={{ marginRight: 6 }}>🪔 {r.festivalNote}</span>}
                  {r.marketNudgeNote && <span className="badge neutral">{r.marketNudgeNote}</span>}
                </td>
              </tr>,
              isOpen && (
                <tr key={`${r.monthIndex}-detail`} className="month-detail-row">
                  <td colSpan={6}>
                    <div className="month-detail">
                      {rowAssets.map((a) => {
                        const amt = r.allocations[a.key];
                        const funds = splitByPct(amt, instruments[a.key] || []);
                        return (
                          <div key={a.key} className="md-asset">
                            <div className="md-asset-head">
                              <span className="tm-dot" style={{ background: colors[a.key] }} />
                              <span className="md-label">{a.label}</span>
                              <span className="md-amt">{rupees(amt)}</span>
                            </div>
                            {funds.length > 0 && (
                              <ul className="md-funds">
                                {funds.map((f, i) => (
                                  <li key={i}>
                                    <span>{f.name}{f.ticker ? ` (${f.ticker})` : ''}</span>
                                    <strong>{rupees(f.amount)}</strong>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
