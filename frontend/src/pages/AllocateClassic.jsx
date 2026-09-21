import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAllocate } from '../context/AllocateContext.jsx';
import AllocationDonut from '../components/AllocationDonut.jsx';
import SIPChartPanel from '../components/SIPChartPanel.jsx';
import SIPComparisonStrip from '../components/SIPComparisonStrip.jsx';
import BrokerGuide from '../components/BrokerGuide.jsx';
import SIPThisMonth from '../components/SIPThisMonth.jsx';
import SIPScheduleTable from '../components/SIPScheduleTable.jsx';
import { downloadICS } from '../utils/exportICS.js';
import { exportPDF } from '../utils/exportPDF.js';
import { shareSIPCard } from '../utils/shareCard.js';

const PROFILES = ['conservative', 'moderate', 'aggressive'];

function rupees(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const HORIZONS = [12, 18, 24, 36, 48];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function AllocateClassic() {
  // State lives in AllocateContext (App-level) so it survives tab navigation.
  const {
    mode, setMode,
    amount, setAmount,
    profile, setProfile,
    result, loading, error,
    showFunds, setShowFunds,
    sipTotal, setSipTotal,
    months, setMonths,
    sipDate, setSipDate,
    stepUpOn, setStepUpOn,
    stepUpPct, setStepUpPct,
    pauseMonths, setPauseMonths,
    inflation, setInflation,
    sipPlan, sipLoading, sipError,
    submit, submitSip, togglePause,
  } = useAllocate();

  const navigate = useNavigate();

  // Rupee amount for a single instrument within its asset class.
  function fundAmount(alloc, ins) {
    const list = alloc.instruments || [];
    const hasWeights = list.some((i) => i.allocationPct != null);
    const pct = hasWeights ? (ins.allocationPct || 0) : 100 / list.length;
    return Math.round((alloc.amount * pct) / 100);
  }

  // Client-side live preview (no AI call).
  const effectiveMonths = months - pauseMonths.length;
  const baseMonthly = Math.round(Number(sipTotal) / months);
  const inflTarget = Math.round(
    Number(sipTotal) * Math.pow(1 + Number(inflation) / 100, months / 12)
  );
  const year2Monthly = Math.round(baseMonthly * (1 + Number(stepUpPct) / 100));
  const year3Monthly = Math.round(baseMonthly * Math.pow(1 + Number(stepUpPct) / 100, 2));

  return (
    <div className="page">
      <h2>Investment Planner</h2>

      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-btn ${mode === 'lumpsum' ? 'active' : ''}`}
          onClick={() => setMode('lumpsum')}
        >
          Lumpsum
        </button>
        <button
          type="button"
          className={`mode-btn ${mode === 'sip' ? 'active' : ''}`}
          onClick={() => setMode('sip')}
        >
          SIP
        </button>
      </div>

      {mode === 'lumpsum' && (
      <>
      <p className="muted small">
        Enter an amount and risk profile. Claude builds a diversified split across
        10 asset classes using current macro + sector momentum.
      </p>

      <form className="allocate-form" onSubmit={submit}>
        <label>
          Investment amount (₹)
          <input
            type="number"
            min="1000"
            step="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>

        <label>
          Risk profile
          <div className="profile-toggle">
            {PROFILES.map((p) => (
              <button
                type="button"
                key={p}
                className={`profile-btn ${profile === p ? 'active' : ''}`}
                onClick={() => setProfile(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </label>

        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Building allocation…' : 'Generate Allocation'}
        </button>
      </form>

      {error && (
        <p className="muted error-box">
          {error}. Add your Anthropic API key in{' '}
          <a className="link" onClick={() => navigate('/settings')}>Settings</a>.
        </p>
      )}

      {result && (
        <div className="allocation-result">
          <div className="alloc-top">
            <AllocationDonut allocations={result.allocations} />
            <div className="strategy">
              <h3>Strategy</h3>
              <p>{result.overallStrategy}</p>
              <div className="pill-row">
                <div className="total-pill">Total: {rupees(result.totalAmount)}</div>
                {result.portfolioXirr != null && (
                  <div className="xirr-pill">Est. XIRR: {result.portfolioXirr}% p.a.</div>
                )}
              </div>
            </div>
          </div>

          {result.xirrComparison && (
            <div className="xirr-compare">
              <h3>Projected XIRR by risk profile</h3>
              <p className="muted small">
                Amount-weighted 3-year estimate for ₹{Number(result.totalAmount).toLocaleString('en-IN')}.
                Forward estimates, not guarantees.
              </p>
              <div className="xirr-bars">
                {['conservative', 'moderate', 'aggressive'].map((p) => {
                  const v = result.xirrComparison[p];
                  const max = Math.max(...Object.values(result.xirrComparison));
                  const isActive = p === result.riskProfile;
                  return (
                    <div key={p} className={`xirr-bar ${isActive ? 'active' : ''}`}>
                      <div className="xirr-bar-track">
                        <div className="xirr-bar-fill" style={{ height: `${(v / max) * 100}%` }}>
                          <span className="xirr-bar-val">{v}%</span>
                        </div>
                      </div>
                      <span className="xirr-bar-label">{p}{isActive ? ' ★' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="table-head-row">
            <h3>Allocation breakdown</h3>
            <button
              type="button"
              className={`btn ${showFunds ? 'primary' : ''}`}
              onClick={() => setShowFunds((s) => !s)}
            >
              {showFunds ? 'Hide fund amounts' : 'Show ₹ per fund'}
            </button>
          </div>

          <table className="alloc-table">
            <thead>
              <tr>
                <th>Asset Class</th>
                <th>%</th>
                <th>Amount</th>
                <th>XIRR</th>
                <th>3M</th>
                <th>Where to invest{showFunds ? ' — amount each' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {result.allocations
                .filter((a) => a.percentage > 0)
                .map((a) => (
                  <tr key={a.assetClass}>
                    <td>
                      <div className="ac-name">{a.assetClass}</div>
                      <div className="ac-reason">{a.reason}</div>
                    </td>
                    <td>{a.percentage}%</td>
                    <td>{rupees(a.amount)}</td>
                    <td className="xirr-cell">{a.expectedXirr != null ? `${a.expectedXirr}%` : '—'}</td>
                    <td><span className={`dot ${a.outlook3m}`} title={a.outlook3m} /></td>
                    <td className="instruments">
                      {(a.instruments || []).map((ins, i) => (
                        <div key={i} className="instrument">
                          <span className="ins-name">{ins.name}</span>
                          {ins.ticker && <span className="ins-ticker">{ins.ticker}</span>}
                          {showFunds ? (
                            <span className="ins-amount">{rupees(fundAmount(a, ins))}</span>
                          ) : (
                            <span className="ins-type">{ins.type}</span>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p className="muted small disclaimer">{result.disclaimer}</p>
        </div>
      )}
      </>
      )}

      {mode === 'sip' && (
      <>
      <p className="muted small">
        Invest gradually instead of all at once. Set your target, horizon and
        monthly date — Claude builds a month-by-month plan that tilts gold/silver
        up around Indian festivals (Dhanteras, Akshaya Tritiya) when demand peaks.
      </p>

      <form className="allocate-form sip-form" onSubmit={submitSip}>
        <label>
          Total target amount (₹)
          <input
            type="number"
            min="12000"
            step="1000"
            value={sipTotal}
            onChange={(e) => setSipTotal(e.target.value)}
            required
          />
        </label>

        <label>
          Horizon
          <select value={months} onChange={(e) => { setMonths(Number(e.target.value)); setPauseMonths([]); }}>
            {HORIZONS.map((h) => <option key={h} value={h}>{h} months</option>)}
          </select>
        </label>

        <label>
          SIP date
          <select value={sipDate} onChange={(e) => setSipDate(Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{ordinal(d)}</option>
            ))}
          </select>
        </label>

        <label>
          Risk profile
          <div className="profile-toggle">
            {PROFILES.map((p) => (
              <button
                type="button"
                key={p}
                className={`profile-btn ${profile === p ? 'active' : ''}`}
                onClick={() => setProfile(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </label>

        <label>
          Inflation %
          <input
            type="number"
            min="3"
            max="12"
            step="0.5"
            value={inflation}
            onChange={(e) => setInflation(e.target.value)}
          />
        </label>

        <label className="checkbox-label">
          <input type="checkbox" checked={stepUpOn} onChange={(e) => setStepUpOn(e.target.checked)} />
          Step-up SIP
          {stepUpOn && (
            <input
              className="inline-num"
              type="number"
              min="1"
              max="50"
              value={stepUpPct}
              onChange={(e) => setStepUpPct(e.target.value)}
            />
          )}
          {stepUpOn && <span className="muted small">% / year</span>}
        </label>

        <button className="btn primary" type="submit" disabled={sipLoading}>
          {sipLoading ? 'Building SIP plan…' : 'Generate SIP Plan'}
        </button>
      </form>

      {/* Live preview — no AI call */}
      <div className="sip-preview">
        <div className="preview-chip"><span>Base monthly SIP</span><strong>{rupees(baseMonthly)}</strong></div>
        <div className="preview-chip"><span>Inflation-adjusted target</span><strong>{rupees(inflTarget)}</strong></div>
        <div className="preview-chip"><span>Effective months</span><strong>{effectiveMonths}</strong></div>
        {stepUpOn && (
          <div className="preview-chip"><span>Yr2 / Yr3 monthly</span><strong>{rupees(year2Monthly)} / {rupees(year3Monthly)}</strong></div>
        )}
      </div>

      {/* Pause month picker */}
      <details className="pause-picker">
        <summary>Pause specific months ({pauseMonths.length} selected)</summary>
        <div className="pause-grid">
          {Array.from({ length: months }, (_, i) => (
            <button
              type="button"
              key={i}
              className={`pause-cell ${pauseMonths.includes(i) ? 'paused' : ''}`}
              onClick={() => togglePause(i)}
            >
              M{i + 1}
            </button>
          ))}
        </div>
      </details>

      {sipError && (
        <p className="muted error-box">
          {sipError}. If this is an auth error, log in via the backend.
        </p>
      )}

      {sipPlan && <SipResult plan={sipPlan} />}
      </>
      )}
    </div>
  );
}

function SipResult({ plan }) {
  const [view, setView] = useState('schedule'); // 'schedule' | 'allocation' | 'charts' | 'tax'
  const [fd, setFd] = useState({ rate: 6.8, label: 'Bank FD (1-3yr)' });
  const [platform, setPlatform] = useState(null);
  const assets = plan.assets || [];
  const instruments = plan.summary.instruments || {};
  const total = plan.summary.totalInvested;
  const taxCount = (plan.taxFlags?.length || 0) + (plan.summary.section80CUtilised > 0 ? 1 : 0);

  // Fetch the FD baseline once and share it with the comparison strip + share card.
  useEffect(() => {
    api.fdRate().then(setFd).catch(() => {});
  }, []);

  // Work out the fewest platforms that cover this plan's asset classes.
  useEffect(() => {
    const keys = (plan.assets || [])
      .filter((a) => (plan.summary.assetClassTotals[a.key] || 0) > 0)
      .map((a) => a.key);
    if (keys.length) api.platformPlan(keys).then(setPlatform).catch(() => {});
  }, [plan]);

  return (
    <div className="allocation-result">
      <div className="sip-summary-strip">
        <div className="preview-chip"><span>Total invested</span><strong>{rupees(total)}</strong></div>
        <div className="preview-chip"><span>Base monthly</span><strong>{rupees(plan.baseMonthlyAmount)}</strong></div>
        <div className="preview-chip"><span>Infl-adj target</span><strong>{rupees(plan.inflationAdjustedTarget)}</strong></div>
        <div className="xirr-pill">Est. XIRR: {plan.summary.estimatedXIRR}% p.a.</div>
      </div>

      {plan.summary.strategyNote && (
        <div className="narrative-card" style={{ margin: '4px 0 14px' }}>
          <p style={{ margin: 0 }}>{plan.summary.strategyNote}</p>
        </div>
      )}

      <SIPThisMonth plan={plan} platform={platform} />

      {/* Sub-views keep the screen uncluttered — one panel at a time. */}
      <div className="result-tabs">
        <button type="button" className={`result-tab ${view === 'schedule' ? 'active' : ''}`} onClick={() => setView('schedule')}>
          📅 Monthly schedule
        </button>
        <button type="button" className={`result-tab ${view === 'allocation' ? 'active' : ''}`} onClick={() => setView('allocation')}>
          🎯 Where it goes
        </button>
        <button type="button" className={`result-tab ${view === 'charts' ? 'active' : ''}`} onClick={() => setView('charts')}>
          📊 Charts
        </button>
        <button type="button" className={`result-tab ${view === 'tax' ? 'active' : ''}`} onClick={() => setView('tax')}>
          🧾 Tax view{taxCount ? ` (${taxCount})` : ''}
        </button>
      </div>

      {view === 'schedule' && (
        <>
          <p className="muted small" style={{ marginTop: 4 }}>
            Tap any month to see exactly how that instalment splits across asset classes and funds.
          </p>
          <SIPScheduleTable plan={plan} />
        </>
      )}

      {view === 'allocation' && (
        <>
          <p className="muted small" style={{ marginTop: 4 }}>
            Totals over {plan.inputs.months} months. Tap any asset class to see the
            specific funds/stocks and how much goes into each.
          </p>
          <div className="asset-accordion">
            {assets.map((a) => {
              const t = plan.summary.assetClassTotals[a.key] || 0;
              if (t <= 0) return null;
              return (
                <AssetRow
                  key={a.key}
                  asset={a}
                  total={t}
                  portfolioTotal={total}
                  funds={instruments[a.key] || []}
                />
              );
            })}
          </div>
        </>
      )}

      {view === 'charts' && (
        <div className="charts-view">
          <SIPChartPanel plan={plan} />
          <h4 className="compare-title">SIP vs. parking it in an FD</h4>
          <SIPComparisonStrip plan={plan} fdRate={fd.rate} fdLabel={fd.label} />
        </div>
      )}

      {view === 'tax' && (
        <div className="tax-view">
          {plan.summary.section80CUtilised > 0 && (
            <div className="tax-80c-card">
              <div className="t80-label">Section 80C utilised via ELSS</div>
              <div className="t80-bar-wrap">
                <div className="t80-bar" style={{ width: `${Math.min(100, (plan.summary.section80CUtilised / 150000) * 100)}%` }} />
              </div>
              <div className="muted small">
                {rupees(plan.summary.section80CUtilised)} of ₹1,50,000 limit used
              </div>
            </div>
          )}

          {plan.taxFlags?.length > 0 ? (
            <div className="tax-flags">
              {plan.taxFlags.map((f, i) => (
                <span
                  key={i}
                  className={`badge ${f.severity === 'warning' || f.severity === 'alert' ? 'bearish' : 'neutral'}`}
                  title={f.flag}
                >
                  {f.assetClass}: {f.flag}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted small">No notable tax flags for this horizon.</p>
          )}
        </div>
      )}

      <SipActions plan={plan} fdRate={fd.rate} />

      <p className="muted small disclaimer">
        Festival tilts and XIRR are illustrative, not guarantees. Not financial advice.
      </p>
    </div>
  );
}

// One compact action bar: export the plan, then a collapsed broker setup guide.
function SipActions({ plan, fdRate }) {
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();
  const assetKeys = (plan.assets || [])
    .filter((a) => (plan.summary.assetClassTotals[a.key] || 0) > 0)
    .map((a) => a.key);

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 6000);
  }

  async function onShare() {
    try {
      const r = await shareSIPCard(plan, fdRate);
      if (r === 'downloaded') flash('Share image downloaded — attach it in WhatsApp.');
    } catch {
      flash('Could not generate the share image.');
    }
  }

  async function onTrack() {
    try {
      await api.trackSipPlan(plan);
      flash('Plan tracked ✓ — open SIP Health to log your monthly investments.');
    } catch {
      flash('Could not save the tracked plan.');
    }
  }

  return (
    <div className="sip-actions">
      <h4 className="actions-title">Take action on this plan</h4>
      <div className="action-bar">
        <button type="button" className="action-btn" onClick={() => downloadICS(plan)}>
          📅 Add to Calendar
        </button>
        <button type="button" className="action-btn" onClick={() => exportPDF(plan)}>
          📄 Download PDF
        </button>
        <button type="button" className="action-btn" onClick={onShare}>
          📲 Share card
        </button>
        <button type="button" className="action-btn track" onClick={onTrack}>
          📊 Track this plan
        </button>
      </div>
      {msg && (
        <p className="muted small" style={{ marginTop: 2 }}>
          {msg}{' '}
          {/Plan tracked/.test(msg) && (
            <a className="link" onClick={() => navigate('/sip-health')}>Open SIP Health →</a>
          )}
        </p>
      )}

      <details className="broker-details">
        <summary>🏦 How to set this up with a broker</summary>
        <BrokerGuide assetClasses={assetKeys} />
      </details>
    </div>
  );
}

// One expandable asset class: click to reveal the specific funds/stocks + ₹ amounts.
function AssetRow({ asset, total, portfolioTotal, funds }) {
  const [open, setOpen] = useState(false);
  const pct = ((total / portfolioTotal) * 100).toFixed(1);
  const hasFunds = funds.length > 0;
  return (
    <div className={`asset-row ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="asset-row-head"
        onClick={() => hasFunds && setOpen((o) => !o)}
        disabled={!hasFunds}
      >
        <span className="ar-caret">{hasFunds ? (open ? '▾' : '▸') : ''}</span>
        <span className="ar-label">{asset.label}</span>
        <span className="ar-bar-wrap"><span className="ar-bar" style={{ width: `${pct}%` }} /></span>
        <span className="ar-amount">{rupees(total)}</span>
        <span className="ar-pct muted">{pct}%</span>
      </button>
      {open && hasFunds && (
        <div className="ar-funds">
          {funds.map((f, i) => (
            <div key={i} className="instrument">
              <span className="ins-name">{f.name}</span>
              {f.ticker && <span className="ins-ticker">{f.ticker}</span>}
              {f.type && <span className="ins-type">{f.type}</span>}
              <span className="ins-amount">{rupees(f.amount)}</span>
              <span className="ins-mo muted">≈ {rupees(f.monthly)}/mo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
