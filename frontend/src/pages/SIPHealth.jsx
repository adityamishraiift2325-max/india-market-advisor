import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function rupees(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

const STATUS = {
  'not-started': { label: 'Not started yet', cls: 'neutral' },
  'on-track': { label: 'On track', cls: 'pos' },
  ahead: { label: 'Ahead of plan', cls: 'pos' },
  behind: { label: 'Behind plan', cls: 'neg' },
};

const PROFILES = ['conservative', 'moderate', 'aggressive'];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '—');

// Picks a new risk profile, previews the rupee-level diff for the remaining
// months (past months are untouched), then confirms to actually apply it.
function ReviseStrategy({ health, onApplied }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(health.riskProfile || 'moderate');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);

  // In-flight/resolved revise-preview requests for the OTHER two profiles,
  // fetched the moment this plan's current profile is known — before the
  // person has even opened "Revise strategy" — so picking a profile there
  // usually lands on an answer that's already ready instead of a fresh
  // ~20-30s AI call. Re-primed whenever the tracked plan's profile changes
  // (e.g. right after a switch is confirmed, for the *next* one).
  const previewCache = useRef({});
  const prefetchedFor = useRef(null);

  useEffect(() => {
    if (!health?.tracked || prefetchedFor.current === health.riskProfile) return;
    prefetchedFor.current = health.riskProfile;
    previewCache.current = {};
    PROFILES.filter((p) => p !== health.riskProfile).forEach((p) => {
      previewCache.current[p] = api.reviseSipPreview(p).catch((err) => {
        delete previewCache.current[p]; // don't poison the cache with a failure
        throw err;
      });
    });
  }, [health?.tracked, health?.riskProfile]);

  function startOpen() {
    setOpen(true);
    setProfile(health.riskProfile || 'moderate');
    setPreview(null);
    setExpanded(null);
    setErr('');
  }

  async function doPreview(p) {
    setProfile(p);
    setPreview(null);
    setExpanded(null);
    setErr('');
    setPreviewing(true);
    try {
      const inFlight = previewCache.current[p];
      setPreview(await (inFlight || api.reviseSipPreview(p)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setApplying(true);
    setErr('');
    try {
      await api.reviseSipConfirm({
        toRiskProfile: preview.toRiskProfile,
        newSchedule: preview.newSchedule,
        instruments: preview.instruments,
      });
      setOpen(false);
      setPreview(null);
      await onApplied();
    } catch (e) {
      setErr(e.message);
    } finally {
      setApplying(false);
    }
  }

  if (!open) {
    return (
      <div className="settings-card revise-card">
        <div className="revise-head">
          <div>
            <h3>Strategy</h3>
            <p className="muted small">
              Currently <strong>{cap(health.riskProfile)}</strong>. Feeling the market? Switch from
              here on — months already invested stay exactly as they were.
            </p>
          </div>
          <button type="button" className="btn" onClick={startOpen}>Revise strategy</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card revise-card">
      <h3>Revise strategy</h3>
      <p className="muted small">
        Months 1–{health.elapsed} are unaffected. This regenerates the remaining{' '}
        {health.months - health.elapsed} months under the new profile.
      </p>

      <div className="profile-toggle" style={{ margin: '10px 0 14px' }}>
        {PROFILES.map((p) => (
          <button
            type="button"
            key={p}
            className={`profile-btn ${profile === p ? 'active' : ''}`}
            onClick={() => doPreview(p)}
            disabled={previewing}
          >
            {p}
          </button>
        ))}
      </div>

      {previewing && <p className="muted small">Regenerating the remaining plan…</p>}
      {err && <p className="muted error-box">{err}</p>}

      {preview && !previewing && (
        <>
          {preview.diff.length === 0 ? (
            <p className="muted small">No material change for this profile.</p>
          ) : (
            <div className="diff-list">
              {preview.diff.map((d) => {
                const fa = preview.fundActions?.find((f) => f.key === d.key);
                const hasFunds = fa?.funds?.length > 0;
                const isOpen = expanded === d.key;
                return (
                  <div key={d.key}>
                    <button
                      type="button"
                      className="diff-row diff-row-btn"
                      onClick={() => hasFunds && setExpanded(isOpen ? null : d.key)}
                      disabled={!hasFunds}
                    >
                      <div>
                        <span className="diff-label">
                          {hasFunds && <span className="ar-caret">{isOpen ? '▾' : '▸'}</span>}
                          {d.label}
                        </span>
                        <span className="muted small diff-sub">
                          {d.status === 'new' && `not in plan → ${rupees(d.newMonthly)}/mo`}
                          {d.status === 'dropped' && `${rupees(d.oldMonthly)}/mo → dropped`}
                          {(d.status === 'increased' || d.status === 'decreased') &&
                            `${rupees(d.oldMonthly)}/mo → ${rupees(d.newMonthly)}/mo`}
                        </span>
                      </div>
                      <span className={`diff-badge ${d.delta > 0 ? 'pos' : 'neg'}`}>
                        {d.status === 'new' ? 'New' : d.status === 'dropped' ? 'Dropped' :
                          `${d.delta > 0 ? '+' : '-'}${rupees(Math.abs(d.delta) / (health.months - health.elapsed))}/mo`}
                      </span>
                    </button>
                    {isOpen && hasFunds && (
                      <div className="ar-funds">
                        <p className="muted small diff-fund-note">
                          {fa.action === 'start' && 'Start a fresh SIP in each of these funds:'}
                          {fa.action === 'stop' && 'Stop (or redirect) your SIP in these funds:'}
                          {fa.action === 'adjust' && 'Same funds — just change the monthly SIP amount:'}
                          {fa.action === 'switch' && 'Suggested funds (no prior pick on file for this class):'}
                        </p>
                        {fa.funds.map((f, i) => (
                          <div key={i} className="instrument">
                            <span className="ins-name">{f.name}</span>
                            {f.ticker && <span className="ins-ticker">{f.ticker}</span>}
                            {f.type && <span className="ins-type">{f.type}</span>}
                            <span className="ins-amount">
                              {f.before ? rupees(f.before) : '—'} → {f.after ? rupees(f.after) : '—'} /mo
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>
            Same total commitment, reshuffled: {rupees(preview.remainingAmount)} over the remaining{' '}
            {preview.remainingMonths} months.
          </p>
          <div className="action-bar" style={{ marginTop: 12 }}>
            <button type="button" className="action-btn track" onClick={confirm} disabled={applying}>
              {applying ? 'Applying…' : 'Confirm switch'}
            </button>
            <button type="button" className="action-btn" onClick={() => setOpen(false)} disabled={applying}>
              Cancel
            </button>
          </div>
        </>
      )}

      {!preview && !previewing && (
        <button type="button" className="action-btn" onClick={() => setOpen(false)}>Cancel</button>
      )}
    </div>
  );
}

// Score ring — a simple SVG donut with the grade in the middle.
function ScoreRing({ score, grade, status }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const stroke = status === 'behind' ? '#f87171' : status === 'not-started' ? '#64748b' : '#4ade80';
  return (
    <svg className="score-ring" viewBox="0 0 130 130" width="150" height="150">
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="11" />
      <circle
        cx="65" cy="65" r={r} fill="none" stroke={stroke} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text x="65" y="58" textAnchor="middle" className="ring-score">{score}</text>
      <text x="65" y="82" textAnchor="middle" className="ring-grade">Grade {grade}</text>
    </svg>
  );
}

export default function SIPHealth() {
  const [health, setHealth] = useState(null);
  const [catchUp, setCatchUp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logMonth, setLogMonth] = useState('');
  const [logAmount, setLogAmount] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await api.sipHealth();
      setHealth(h);
      if (h.tracked) {
        setCatchUp(await api.sipCatchUp());
        const def = h.missedCount > 0 ? h.missedMonths[0].monthIndex : h.nextDue?.monthIndex;
        if (def != null) {
          setLogMonth(String(def));
          const row = h.schedule.find((r) => r.monthIndex === def);
          setLogAmount(String(row?.expected ?? ''));
        }
      }
    } catch {
      setHealth({ tracked: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function pickMonth(mi) {
    setLogMonth(mi);
    const row = health?.schedule?.find((r) => String(r.monthIndex) === String(mi));
    if (row) setLogAmount(String(row.expected));
  }

  async function submitLog(e) {
    e.preventDefault();
    if (!logAmount || Number(logAmount) <= 0) return;
    try {
      await api.logSipActual({ monthIndex: Number(logMonth), amount: Number(logAmount) });
      setMsg('Logged ✓');
      setTimeout(() => setMsg(''), 2500);
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function stopTracking() {
    await api.clearSipTracking();
    await load();
  }

  if (loading) {
    return (
      <div className="page">
        <h2>SIP Health</h2>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!health?.tracked) {
    return (
      <div className="page">
        <h2>SIP Health</h2>
        <div className="settings-card">
          <p className="muted">
            No plan is being tracked yet. Go to{' '}
            <a className="link" onClick={() => navigate('/allocate')}>Allocate → SIP</a>, generate a
            plan, and hit <strong>“Track this plan”</strong> to start monitoring whether you’re
            sticking to it.
          </p>
        </div>
      </div>
    );
  }

  const st = STATUS[health.status] || STATUS['on-track'];
  const labelFor = (mi) => health.schedule.find((r) => r.monthIndex === mi)?.label || `M${mi + 1}`;

  return (
    <div className="page">
      <div className="page-head">
        <h2>SIP Health</h2>
        <button type="button" className="btn" onClick={stopTracking}>Stop tracking</button>
      </div>
      <p className="muted small">
        Tracking your {health.months}-month plan ({rupees(health.totalAmount)} target). Log what you
        actually invest each month to keep your score honest.
      </p>

      {/* Hero: ring + key stats */}
      <div className="health-hero">
        <div className="health-ring-wrap">
          <ScoreRing score={health.score} grade={health.grade} status={health.status} />
          <span className={`status-badge ${st.cls}`}>{st.label}</span>
        </div>
        <div className="health-stats">
          <div className="hstat"><span>Invested so far</span><strong>{rupees(health.actualInvested)}</strong></div>
          <div className="hstat"><span>Expected by now</span><strong>{rupees(health.expectedToDate)}</strong></div>
          <div className="hstat"><span>Adherence</span><strong>{health.adherencePct}%</strong></div>
          <div className="hstat"><span>Months due</span><strong>{health.elapsed} / {health.months}</strong></div>
          <div className="hstat"><span>Streak</span><strong>{health.streak} mo</strong></div>
          <div className="hstat"><span>Missed</span><strong className={health.missedCount ? 'neg' : ''}>{health.missedCount}</strong></div>
        </div>
      </div>

      <ReviseStrategy health={health} onApplied={load} />

      {health.revisions?.length > 0 && (
        <details className="history-details">
          <summary>Strategy changes ({health.revisions.length})</summary>
          <table className="alloc-table" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>Month</th><th>Change</th><th>Date</th></tr>
            </thead>
            <tbody>
              {health.revisions.map((r) => (
                <tr key={r.id}>
                  <td>{labelFor(r.atMonthIndex)}</td>
                  <td>{cap(r.from)} → {cap(r.to)}</td>
                  <td className="muted">{r.date.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* Catch-up nudge */}
      {catchUp?.behind && (
        <div className="catchup-card">
          <strong>You’re {rupees(catchUp.shortfall)} behind.</strong>{' '}
          Top up {rupees(catchUp.topUpNow)} now to get back on plan
          {catchUp.spreadPerMonth
            ? <> — or add <strong>{rupees(catchUp.spreadPerMonth)}/month</strong> across your remaining {catchUp.remainingMonths} months.</>
            : '.'}
        </div>
      )}

      {/* Log this month */}
      <h3 style={{ marginTop: 24 }}>Log an investment</h3>
      <form className="log-form" onSubmit={submitLog}>
        <label>
          Month
          <select value={logMonth} onChange={(e) => pickMonth(e.target.value)}>
            {health.schedule.map((r) => (
              <option key={r.monthIndex} value={r.monthIndex}>
                {r.label} — expected {rupees(r.expected)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Amount invested (₹)
          <input type="number" min="1" step="100" value={logAmount} onChange={(e) => setLogAmount(e.target.value)} />
        </label>
        <button className="btn primary" type="submit">Log it</button>
        {msg && <span className="saved-note">{msg}</span>}
      </form>

      {/* Missed months hint */}
      {health.missedCount > 0 && (
        <p className="muted small">
          Not yet logged: {health.missedMonths.map((m) => labelFor(m.monthIndex)).join(', ')}.
        </p>
      )}

      {/* History */}
      {health.actuals.length > 0 && (
        <details className="history-details" open={showHistory} onToggle={(e) => setShowHistory(e.target.open)}>
          <summary>Logged investments ({health.actuals.length})</summary>
          <table className="alloc-table" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>Month</th><th>Amount</th><th>Logged on</th></tr>
            </thead>
            <tbody>
              {health.actuals.map((a) => (
                <tr key={a.id}>
                  <td>{labelFor(a.monthIndex)}</td>
                  <td>{rupees(a.amount)}</td>
                  <td className="muted">{a.loggedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
