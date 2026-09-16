import { futureValue } from '../utils/sipProjections.js';

function rupees(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// "Is this worth it vs. just parking it in an FD" — one glance, rupees not jargon.
export default function SIPComparisonStrip({ plan, fdRate = 6.8, fdLabel = 'Bank FD (1-3yr)' }) {
  const monthly = plan.schedule.map((r) => r.totalThisMonth);
  const sipXirr = plan.summary.estimatedXIRR;
  const sipFV = Math.round(futureValue(monthly, sipXirr));
  const fdFV = Math.round(futureValue(monthly, fdRate));
  const investedTotal = plan.summary.totalInvested;
  const gain = sipFV - fdFV;
  const maxFV = Math.max(sipFV, fdFV);

  return (
    <div className="compare-strip">
      <div className="compare-row">
        <span className="compare-label">This plan <em>({sipXirr}%)</em></span>
        <div className="compare-track">
          <div className="compare-bar sip" style={{ width: `${(sipFV / maxFV) * 100}%` }} />
        </div>
        <span className="compare-val">{rupees(sipFV)}</span>
      </div>
      <div className="compare-row">
        <span className="compare-label">{fdLabel} <em>({fdRate}%)</em></span>
        <div className="compare-track">
          <div className="compare-bar fd" style={{ width: `${(fdFV / maxFV) * 100}%` }} />
        </div>
        <span className="compare-val">{rupees(fdFV)}</span>
      </div>
      <p className="compare-note">
        You invest {rupees(investedTotal)} either way. This plan could end up{' '}
        <strong className={gain >= 0 ? 'pos' : 'neg'}>
          {gain >= 0 ? `₹${Math.abs(gain).toLocaleString('en-IN')} ahead of` : `₹${Math.abs(gain).toLocaleString('en-IN')} behind`}
        </strong>{' '}
        an FD at maturity — projected, not guaranteed.
      </p>
    </div>
  );
}
