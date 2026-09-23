import { useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'motion';
import { api } from '../api.js';
import { useAllocate } from '../context/AllocateContext.jsx';
import { Diya, HoldButton } from './kit.jsx';
import { rupees, shortR, clamp, bez, valueAt, MON, DOWF, PROFILES, PROFILE_META, dotGradient, useReducedMotion } from './util.js';
import { downloadICS } from '../utils/exportICS.js';
import { exportPDF } from '../utils/exportPDF.js';
import { shareSIPCard } from '../utils/shareCard.js';

const isoParts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m: m - 1, d, dt: new Date(y, m - 1, d) }; };

/* -------------------------------------------------------------- growth */
export function GrowthBeat({ view, compact, openSchedule, fdRate }) {
  const rows = view.rows, n = rows.length;
  const [sel, setSel] = useState(n - 1);
  const host = useRef(null);
  const clip = useRef(null);
  const drag = useRef(false);
  const reduce = useReducedMotion();
  const W = compact ? 520 : 900, H = compact ? 150 : 190, padL = 42, padR = 10, top = 12, bot = 22, cw = W - padL - padR, ch = H - top - bot;
  const d = useMemo(() => {
    const inv = [0], pro = [0], fd = [0];
    for (let t = 1; t <= n; t += 1) { inv.push(rows[t - 1].runningTotal); pro.push(valueAt(view.amounts, t, view.xirr)); fd.push(valueAt(view.amounts, t, fdRate)); }
    const maxV = Math.max(pro[n], fd[n], inv[n]) * 1.06;
    const X = (t) => padL + (t / n) * cw, Y = (v) => top + ch - (v / maxV) * ch;
    const pts = (a) => a.map((v, t) => [X(t), Y(v)]);
    const line = (p) => `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}${bez(p)}`;
    const pp = pts(pro), ip = pts(inv), fp = pts(fd);
    return { inv, pro, fd, maxV, X, Y, pp, ip, fp, line, area: `${line(pp)} L${ip[n][0].toFixed(1)},${ip[n][1].toFixed(1)}${bez(ip.slice().reverse())} Z` };
  }, [rows, n, view.amounts, view.xirr, fdRate, H]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSel(n - 1);
    if (reduce || !clip.current) { clip.current?.setAttribute('width', W); return undefined; }
    const a = animate(0, W, { duration: 1.2, ease: [0.2, 0.7, 0.3, 1], onUpdate: (w) => clip.current?.setAttribute('width', w) });
    return () => a.stop();
  }, [n, view.xirr, reduce]);
  const at = (e) => { const r = host.current.getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; setSel(clamp(Math.round(((f * W - padL) / cw) * n), 1, n) - 1); };
  const r = rows[sel], t = sel + 1, x = d.X(t);
  const grid = [0, 0.5, 1].map((f) => { const v = (d.maxV * f) / 1.06; return { y: d.Y(v), v: f ? shortR(v) : '0' }; });
  const ks = view.classes.filter((c) => r.allocations?.[c.key]).sort((a, b) => r.allocations[b.key] - r.allocations[a.key]);
  return (
    <>
      <h2 className="al-q sm">How it could grow</h2>
      <div ref={host} className="al-gr al-glass"
        onPointerDown={(e) => { drag.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } at(e); }}
        onPointerMove={(e) => { if (drag.current) at(e); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Projected value of your SIP against what you put in and a bank FD">
          <defs>
            <linearGradient id="alga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D5AC5E" stopOpacity=".38" /><stop offset="1" stopColor="#D5AC5E" stopOpacity=".05" /></linearGradient>
            <linearGradient id="algl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E9CD8C" /><stop offset="1" stopColor="#F7ECD0" /></linearGradient>
            <clipPath id="algc"><rect ref={clip} x="0" y="0" width="0" height={H} /></clipPath>
          </defs>
          {grid.map((g, i) => (
            <g key={i}><line x1={padL} x2={W - padR} y1={g.y} y2={g.y} stroke="rgba(255,255,255,.08)" />
              <text x={padL - 6} y={g.y + 3.5} textAnchor="end" fontSize="10" fill="#6F7A94" fontFamily="IBM Plex Mono,monospace">{g.v}</text></g>
          ))}
          {[0, 0.5, 1].map((f) => { const m = Math.round(n * f); return <text key={f} x={d.X(m)} y={H - 5} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fontSize="10" fill="#6F7A94" fontFamily="IBM Plex Mono,monospace">{m ? `month ${m}` : 'start'}</text>; })}
          {rows.map((row, i) => (row.festivalNote ? <line key={i} x1={d.X(i + 1)} x2={d.X(i + 1)} y1={top} y2={top + ch} stroke="#D5AC5E" strokeOpacity=".28" strokeDasharray="2 3" /> : null))}
          <g clipPath="url(#algc)">
            <path d={d.area} fill="url(#alga)" />
            <path d={d.line(d.ip)} fill="none" stroke="#8B96B4" strokeWidth="1.6" strokeDasharray="4 4" />
            <path d={d.line(d.fp)} fill="none" stroke="#B9C3DA" strokeWidth="1.4" strokeOpacity=".8" />
            <path d={d.line(d.pp)} fill="none" stroke="url(#algl)" strokeWidth="2.6" strokeLinecap="round" />
          </g>
          <line x1={x} x2={x} y1={top} y2={top + ch} stroke="#fff" strokeOpacity=".7" strokeWidth="1.2" />
          <circle cx={x} cy={d.Y(d.pro[t])} r="4" fill="#F7ECD0" stroke="#B98436" strokeWidth="2" />
          <circle cx={x} cy={d.Y(d.inv[t])} r="3" fill="#0B1222" stroke="#8B96B4" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="al-legend">
        <span><i style={{ borderColor: '#8B96B4', borderTopStyle: 'dashed' }} />What you put in</span>
        <span><i style={{ borderColor: '#E9CD8C' }} />Plan at ~{view.xirr}% a year</span>
        <span><i style={{ borderColor: '#B9C3DA' }} />Bank FD at {fdRate}%</span>
      </div>
      <div className="al-ro al-glass">
        <div className="al-ro-top">
          <div className="ttl"><small>{sel === n - 1 ? 'End of plan' : `Month ${t} of ${n}`}</small><b>{r.label}{r.isPaused ? ' · skipped' : ` · instalment ${rupees(r.totalThisMonth)}`}</b></div>
          <div className="al-nav2">
            <button type="button" aria-label="Previous month" disabled={sel <= 0} onClick={() => setSel(sel - 1)}>‹</button>
            <span>{t}/{n}</span>
            <button type="button" aria-label="Next month" disabled={sel >= n - 1} onClick={() => setSel(sel + 1)}>›</button>
          </div>
        </div>
        <div className="al-ro-vals">
          <div>Put in<b>{rupees(d.inv[t])}</b></div>
          <div className="g">Could be worth<b>~{rupees(d.pro[t])}</b></div>
          <div>Bank FD<b>{rupees(d.fd[t])}</b></div>
        </div>
        {r.festivalNote && <div className="al-ro-fest"><Diya />{r.festivalNote}</div>}
        {!r.isPaused && (
          <div className="al-ro-split">
            {ks.slice(0, 4).map((c) => <span key={c.key}><i className="al-dotc" style={{ background: dotGradient(c.colors) }} />{c.short} <b className="mono">{rupees(r.allocations[c.key])}</b></span>)}
            {ks.length > 4 && <span>+{ks.length - 4} more</span>}
          </div>
        )}
      </div>
      <button type="button" className="al-linkbtn" onClick={openSchedule}>Open the full schedule ›</button>
    </>
  );
}

export function ScheduleSheetBody({ view }) {
  return (
    <div className="al-stab-w">
      <table className="al-stab">
        <thead><tr><th>Month</th><th>Date</th><th>Amount</th><th>Running</th><th>Notes</th></tr></thead>
        <tbody>
          {view.rows.map((r) => {
            const p = r.date ? isoParts(r.date) : null;
            return (
              <tr key={r.monthIndex} className={r.isPaused ? 'p' : ''}>
                <td>{r.label}</td><td className="n">{p ? `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}` : '-'}</td>
                <td className="n">{r.isPaused ? 'skipped' : rupees(r.totalThisMonth)}</td><td className="n">{rupees(r.runningTotal)}</td>
                <td className="fs">{r.festivalNote ? r.festivalNote.split(' (')[0] : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- reality */
export function RealityBeat({ view, months }) {
  const { profile, profilePlans } = useAllocate();
  const reduce = useReducedMotion();
  const bars = useMemo(() => {
    if (!view.sip) return PROFILES.map((p) => ({ p, v: view.xirrComparison?.[p] })).filter((b) => b.v != null);
    return PROFILES.map((p) => ({ p, v: p === profile ? view.xirr : profilePlans[p]?.summary?.estimatedXIRR })).filter((b) => b.v != null);
  }, [view, profile, profilePlans]);
  const max = Math.max(...bars.map((b) => b.v), 1);
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = setTimeout(() => setGrown(true), reduce ? 0 : 120); return () => clearTimeout(id); }, [reduce]);
  const sf = view.sip ? valueAt(view.amounts, view.amounts.length, view.xirr) : null;
  return (
    <div>
      <h2 className="al-q sm">Is it worth the trouble?</h2>
      {view.sip && (
        <div className="al-rcb"><h4>Does it keep pace with inflation?</h4>
          <div className="al-pace"><span className={`ok ${sf >= view.adjTarget ? '' : 'no'}`}>{sf >= view.adjTarget ? '✓' : '!'}</span>
            <span>{rupees(sf)} projected vs. {rupees(view.adjTarget)} needed after inflation over {months} months. {sf >= view.adjTarget ? 'Clears it.' : 'Falls short.'}</span></div></div>
      )}
      <div className="al-rcb"><h4>Estimated XIRR by temperament, a yearly rate</h4>
        <div className="al-xb">{bars.map((b) => (
          <div key={b.p} className={`al-xcol ${b.p === profile ? 'on' : ''}`}><i style={{ height: grown ? `${(b.v / max) * 78}%` : 0, transition: reduce ? 'none' : 'height 1s cubic-bezier(.2,.7,.3,1)' }}><em>{b.v}%</em></i>{PROFILE_META[b.p].tag}{b.p === profile ? ' ★' : ''}</div>
        ))}</div>
        <p className="al-cnote">XIRR is annualised: the same yearly rate whether you invest for 3 months or 3 years. {view.sip && months < 12 ? `Over your ${months} months you would earn only a part of it, and a short plan can end lower than it started. ` : ''}
          {view.sip && bars.length < 3 ? 'The other styles appear here once they finish computing. ' : ''}These are estimates, not guarantees.</p></div>
    </div>
  );
}

/* ----------------------------------------------------------------- tax */
export function TaxBeat({ view }) {
  const bar = useRef(null);
  const reduce = useReducedMotion();
  const e80 = Math.min(150000, view.section80C || 0);
  useEffect(() => { if (bar.current) { const to = `${(e80 / 150000) * 100}%`; if (reduce) bar.current.style.width = to; else animate(bar.current, { width: ['0%', to] }, { duration: 1, ease: [0.2, 0.7, 0.3, 1] }); } }, [e80, reduce]);
  const flags = [...view.taxFlags].sort((a, b) => Number(b.severity === 'warning' || b.severity === 'alert') - Number(a.severity === 'warning' || a.severity === 'alert'));
  return (
    <>
      <h2 className="al-q sm">Tax notes</h2>
      {e80 > 0 && (
        <div className="al-t80 al-glass"><div className="al-mod-t" style={{ fontSize: 12.5 }}>Section 80C used via ELSS</div>
          <div className="tk"><i ref={bar} style={{ width: 0 }} /></div><div className="al-mod-s">{rupees(e80)} of ₹1,50,000 limit</div></div>
      )}
      <div className="al-flags">
        {flags.length === 0 && <p className="al-note">No notable tax flags for this horizon.</p>}
        {flags.map((f, i) => { const w = f.severity === 'warning' || f.severity === 'alert'; return <div key={i} className={`al-flag ${w ? 'w' : ''}`}><span className="dot" /><div><b>{f.assetClass}</b>{f.flag}</div></div>; })}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- take */
const GL = {
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  pdf: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>,
  img: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4 4 3 3-2 4 3" /></svg>,
  trk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18l5-6 4 3 7-9" /><path d="M15 6h5v5" /></svg>,
};
export function TakeBeat({ view, fdRate, toast }) {
  const top = view.classes.slice().sort((a, b) => b.pct - a.pct).slice(0, 3).map((c) => `${c.short} ${c.pct}%`).join(' · ');
  const first = view.sip && view.rows[0]?.date ? isoParts(view.rows[0].date) : null;
  const run = async (fn, ok, bad) => { try { const r = await fn(); toast(r === 'downloaded' ? 'Share image downloaded. Attach it in WhatsApp.' : ok); } catch { toast(bad); } };
  return (
    <>
      <h2 className="al-q sm">{view.sip ? 'Your plan, in your pocket' : 'Your plan, ready to act on'}</h2>
      <div className="al-tk-sum al-glass">
        {view.sip
          ? <><div className="n">{rupees(view.perMonth)} <small>a month · {view.eff} instalments</small></div>
            <p>{rupees(view.invested)} in total{first ? `, first debit ${DOWF[first.dt.getDay()].slice(0, 3)} ${first.d} ${MON[first.m]}` : ''}. Largest: {top}.</p></>
          : <><div className="n">{rupees(view.invested)} <small>invested today</small></div><p>Largest: {top}.</p></>}
      </div>
      {view.sip && (
        <ul className="al-tk-list">
          <li><span className="al-gl">{GL.cal}</span><div><b>Calendar reminders</b><span className="d">{view.eff} calendar events, one per instalment, each with the amount, set for the afternoon before.</span></div>
            <button type="button" className="al-btn sm ghost" onClick={() => run(() => downloadICS(view.plan), 'Calendar file downloaded', 'Could not create the calendar file.')}>Add</button></li>
          <li><span className="al-gl">{GL.pdf}</span><div><b>Your plan on paper</b><span className="d">PDF: summary, each fund with its amount, and the monthly schedule.</span></div>
            <button type="button" className="al-btn sm ghost" onClick={() => run(() => exportPDF(view.plan), 'PDF downloaded', 'Could not create the PDF.')}>Download</button></li>
          <li><span className="al-gl">{GL.img}</span><div><b>A share image</b><span className="d">A card with your total, yearly return estimate and projected value.</span></div>
            <button type="button" className="al-btn sm ghost" onClick={() => run(() => shareSIPCard(view.plan, fdRate), 'Share card ready', 'Could not generate the share image.')}>Share</button></li>
          <li><span className="al-gl">{GL.trk}</span><div><b>Tracking</b><span className="d">Log each instalment on SIP Health; see if you are on pace.</span></div>
            <HoldButton label="Hold to track" doneLabel="Tracking" holdSeconds={1}
              onComplete={() => run(() => api.trackSipPlan(view.plan), 'Plan tracked. Log instalments on SIP Health.', 'Could not save the tracked plan.')} /></li>
        </ul>
      )}
      <p className="al-disc">{view.sip ? 'Festival tilts and XIRR are illustrative, not guarantees. ' : ''}{view.disclaimer || 'Educational tool, not investment advice.'}</p>
    </>
  );
}
