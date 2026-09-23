import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'motion';
import { api } from '../api.js';
import { useAllocate } from '../context/AllocateContext.jsx';
import { CountUp, Segmented, SPRING } from './kit.jsx';
import { rupees, clamp, PROFILES, PROFILE_META, useFestivals, useReducedMotion } from './util.js';

/* ------------------------------------------------------------- reading */
// Progress is an estimate: the real wait is 10-30s and unknowable, so the orb
// eases toward ~92% and only completes when the plan actually arrives.
export function ReadingBeat({ loading, error, onRetry, onEdit, onDone }) {
  const [lines, setLines] = useState([]);
  const [data, setData] = useState(null);
  const [t, setT] = useState(0);
  const [finished, setFinished] = useState(false);
  const fests = useFestivals();
  const t0 = useRef(Date.now());
  const reduce = useReducedMotion();
  const list = useRef(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.indices().catch(() => null), api.macro().catch(() => null)]).then(([i, m]) => { if (live) setData({ i, m }); });
    return () => { live = false; };
  }, []);

  const trace = useMemo(() => {
    const out = [];
    const nifty = data?.i?.data?.find((x) => x.key === 'nifty50');
    const mac = data?.m?.indicators;
    out.push(nifty
      ? ['Nifty 50 · live', `${nifty.price.toLocaleString('en-IN')}  ${nifty.returns.d1 >= 0 ? '▲' : '▼'} ${Math.abs(nifty.returns.d1)}%`, nifty.returns.d1 >= 0 ? 'up' : '']
      : ['Nifty 50', 'reading…', '']);
    if (mac) {
      out.push([`Repo ${mac.repoRate}% · CPI ${mac.cpiInflation}% · IIP ${mac.iip}%`, 'macro', '']);
      out.push([`FII ${mac.fiiTrend} · DII ${mac.diiTrend}`, 'flows', '']);
    }
    const now = new Date();
    const next = fests.map((f) => ({ f, d: new Date(f.date + 'T00:00:00') })).filter((x) => x.d >= now).sort((a, b) => a.d - b.d)[0];
    if (next) out.push(['Festival calendar', `${next.f.name} in ${Math.ceil((next.d - now) / 864e5)} days · gold ×${next.f.goldTiltFactor}`, 'gold']);
    return out;
  }, [data, fests]);

  useEffect(() => {
    if (lines.length >= trace.length) return undefined;
    const id = setTimeout(() => setLines(trace.slice(0, lines.length + 1)), lines.length === 0 ? 350 : 700);
    return () => clearTimeout(id);
  }, [lines.length, trace]);
  useEffect(() => {
    if (lines.length && !reduce && list.current) {
      const last = list.current.lastElementChild;
      if (last) animate(last, { opacity: [0, 1], y: [10, 0] }, SPRING(420, 26));
    }
  }, [lines.length, reduce]);

  useEffect(() => {
    if (finished || error) return undefined;
    const id = setInterval(() => setT((Date.now() - t0.current) / 1000), 100);
    return () => clearInterval(id);
  }, [finished, error]);

  // Finish once the plan has arrived, but keep the screen up long enough to read.
  useEffect(() => {
    if (loading || error || finished) return undefined;
    const wait = Math.max(0, 1400 - (Date.now() - t0.current));
    const id = setTimeout(() => setFinished(true), wait);
    return () => clearTimeout(id);
  }, [loading, error, finished]);
  useEffect(() => {
    if (!finished) return undefined;
    const id = setTimeout(onDone, 650);
    return () => clearTimeout(id);
  }, [finished, onDone]);

  const p = finished ? 1 : 0.92 * (1 - Math.exp(-t / 13));
  return (
    <>
      <div className="al-rd-top">
        <div className="al-orb">
          <svg viewBox="0 0 92 92">
            <defs><linearGradient id="alog" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F4E0AE" /><stop offset="1" stopColor="#B5843A" /></linearGradient></defs>
            <circle cx="46" cy="46" r="42" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
            <circle cx="46" cy="46" r="42" fill="none" stroke="url(#alog)" strokeWidth="4" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={264 * (1 - p)} style={{ transition: 'stroke-dashoffset .5s ease-out' }} />
          </svg>
          <div className="tmr">{t.toFixed(1)}s</div>
        </div>
        <div><h2 className="al-q sm" style={{ margin: '0 0 4px' }}>Reading the market</h2>
          <p className="al-sub" style={{ margin: 0 }}>Claude is building your plan from today’s numbers. This usually takes under a minute.</p></div>
      </div>
      <p className="al-sub" style={{ margin: '6px 0 10px' }}>These are the inputs it’s working from:</p>
      <ul className="al-trace" ref={list}>
        {lines.map((l, i) => (
          <li key={i} className="al-glass"><span className="al-tick">✓</span><span className="al-t-l">{l[0]}</span><span className={`al-t-v ${l[2]}`}>{l[1]}</span></li>
        ))}
      </ul>
      {!error && <div className="al-drafting"><span className="al-pl" /><span>{finished ? 'Done' : 'Drafting the split across your asset classes…'}</span></div>}
      {error && (
        <div className="al-errcard" role="alert">
          <b>The plan didn’t finish.</b>
          <p>{error}. Your inputs are kept. A timeout usually clears on a second try.</p>
          <div className="row"><button type="button" className="al-btn pri" onClick={onRetry}>Try again</button><button type="button" className="al-btn ghost" onClick={onEdit}>Edit inputs</button></div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- verdict */
const RC = 2 * Math.PI * 78;
export function VerdictBeat({ view, demo }) {
  const { profile, selectSipProfile, selectLumpProfile, profilePlans, months } = useAllocate();
  const [sel, setSel] = useState(null);
  const arcs = useRef({});
  const reduce = useReducedMotion();
  const key = view.classes.map((c) => c.pct).join(',');
  useLayoutEffect(() => {
    let start = 0;
    const anims = [];
    view.classes.forEach((c, i) => {
      const el = arcs.current[c.key]; if (!el) return;
      const len = Math.max(0, (c.pct / 100) * RC - 2.5);
      el.setAttribute('stroke-dashoffset', -(start * RC));
      start += c.pct / 100;
      if (reduce) el.setAttribute('stroke-dasharray', `${len} ${RC - len}`);
      else anims.push(animate(0, len, { duration: 0.9, delay: i * 0.04, ease: [0.2, 0.7, 0.3, 1], onUpdate: (v) => el.setAttribute('stroke-dasharray', `${v} ${RC - v}`) }));
    });
    return () => anims.forEach((a) => a.stop());
  }, [key, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(null); }, [key]);
  const cur = sel && view.classes.find((c) => c.key === sel);
  const flipTo = (p) => (view.sip ? selectSipProfile(p) : selectLumpProfile(p));
  const others = PROFILES.filter((p) => p !== profile);
  const ready = view.sip ? others.filter((p) => profilePlans[p]).length : 0;
  return (
    <>
      {demo && <div className="al-banner">Market data is illustrative right now, figures may not match the live market.</div>}
      <div className="al-vd">
        <div className="al-vd-l">
          <svg className="al-ring" viewBox="0 0 200 200" role="img" aria-label="Allocation ring. Tap a slice for its amount.">
            <defs>{view.classes.map((c) => (
              <linearGradient key={c.key} id={`alrg-${c.key}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="200"><stop offset="0" stopColor={c.colors[0]} /><stop offset="1" stopColor={c.colors[1]} /></linearGradient>
            ))}</defs>
            <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="20" />
            <g style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }}>
              {view.classes.map((c) => (
                <circle key={c.key} ref={(el) => { arcs.current[c.key] = el; }} className="al-arc" cx="100" cy="100" r="78" stroke={`url(#alrg-${c.key})`}
                  strokeDasharray={`0 ${RC}`} style={{ opacity: sel && sel !== c.key ? 0.28 : 1, strokeWidth: sel === c.key ? 25 : 20, transition: 'opacity .25s, stroke-width .25s' }}
                  onClick={() => setSel(sel === c.key ? null : c.key)} />
              ))}
            </g>
          </svg>
          <div className="al-rc">
            <div className="al-rc-a"><CountUp value={cur ? (view.sip ? cur.amount / view.eff : cur.amount) : view.perMonth} format={rupees} /></div>
            <div className="al-rc-b">{cur ? `${cur.label}${view.sip ? ' per month' : ''}` : view.sip ? 'per month' : 'invested today'}</div>
            <div className="al-rc-c">{cur ? `${cur.pct}% of your plan` : view.sip ? `${rupees(view.invested)} over ${months} months` : ''}</div>
          </div>
        </div>
        <div className="al-vd-r">
          <p className="al-ringhint">Tap a slice to read it. Tap it again to go back.</p>
          <p className="al-thesis">{view.strategy}</p>
          <Segmented value={profile} onChange={flipTo} options={PROFILES.map((p) => ({ value: p, label: PROFILE_META[p].tag }))} />
          <div className="al-ready">{view.sip ? (ready === 2 ? `✓ ${others.map((p) => PROFILE_META[p].tag).join(' and ')} already computed. Flip instantly.` : 'Computing the other styles in the background…') : 'Flipping re-runs the plan for that style.'}</div>
          <div className="al-kpis">
            {(view.sip
              ? [['Total invested', rupees(view.invested)], ['Base monthly', rupees(view.base)], ['Inflation-adj. target', rupees(view.adjTarget)], ['Est. XIRR (yearly)', `~${view.xirr}% a year`, 1]]
              : [['Invested today', rupees(view.invested)], ['Asset classes', view.classes.length], ['Est. XIRR (yearly)', `~${view.xirr}% a year`, 1]]
            ).map((r) => <div key={r[0]} className={`al-kpi al-glass ${r[2] ? 'g' : ''}`}><span>{r[0]}</span><b>{r[1]}</b></div>)}
          </div>
          {view.sip && <p className="al-note" style={{ marginTop: 8 }}>{view.nudge ? 'Nifty valuation is above the 24 guardrail, so part of the plan was shifted into debt.' : 'Valuation is under the guardrail, so no defensive shift into debt was applied.'} Estimates aren’t guarantees.</p>}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- where */
function pack(items, W, H) {
  const minR = 31, area = W * H * 0.5;
  const radii = (k) => items.map((it) => Math.max(minR, k * Math.sqrt(it.p)));
  let lo = 2, hi = 70;
  for (let s = 0; s < 34; s += 1) { const mid = (lo + hi) / 2; const sum = radii(mid).reduce((a, r) => a + Math.PI * r * r, 0); if (sum > area) hi = mid; else lo = mid; }
  const rs = radii(lo);
  const pos = items.map((_, i) => { const a = i * 2.399, d = 14 * Math.sqrt(i + 1); return { x: W / 2 + Math.cos(a) * d * 1.5, y: H / 2 + Math.sin(a) * d }; });
  for (let it = 0; it < 620; it += 1) {
    for (let i = 0; i < pos.length; i += 1) for (let j = i + 1; j < pos.length; j += 1) {
      const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, min = rs[i] + rs[j] + 5;
      if (d < min) { const p = (min - d) / 2, nx = dx / d, ny = dy / d; pos[i].x -= nx * p; pos[i].y -= ny * p; pos[j].x += nx * p; pos[j].y += ny * p; }
    }
    for (let n = 0; n < pos.length; n += 1) {
      if (it < 480) { pos[n].x += (W / 2 - pos[n].x) * 0.012; pos[n].y += (H / 2 - pos[n].y) * 0.012; }
      pos[n].x = clamp(pos[n].x, rs[n] + 2, W - rs[n] - 2); pos[n].y = clamp(pos[n].y, rs[n] + 2, H - rs[n] - 2);
    }
  }
  return { pos, rs };
}

export function WhereBeat({ view, openClass }) {
  const box = useRef(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const reduce = useReducedMotion();
  useLayoutEffect(() => { if (box.current) setSize({ W: box.current.clientWidth, H: box.current.clientHeight }); }, []);
  const layout = useMemo(() => (size.W ? pack(view.classes.map((c) => ({ p: c.pct })), size.W, size.H) : null), [size, view]);
  useEffect(() => {
    if (!layout || reduce || !box.current) return;
    const els = box.current.querySelectorAll('.al-bo');
    els.forEach((el, i) => animate(el, { scale: [0.9, 1], opacity: [0, 1] }, { ...SPRING(260, 18), delay: i * 0.07 }));
    els.forEach((el, i) => animate(el.firstChild, { y: [0, -6, 0] }, { duration: 6 + (i % 3), repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }));
  }, [layout, reduce]);
  return (
    <>
      <h2 className="al-q sm">Where it goes</h2>
      <p className="al-capline">Bigger circle, bigger share. Tap one for the funds, the amounts{view.sip ? '' : ', and the reason'}.</p>
      <div ref={box} className="al-bubbles">
        {layout && view.classes.map((c, i) => {
          const r = layout.rs[i], p = layout.pos[i];
          const v = view.sip ? c.amount / view.eff : c.amount;
          return (
            <button key={c.key} type="button" className="al-bo" aria-label={`${c.label} ${c.pct} percent`} onClick={() => openClass(c)}
              style={{ left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r }}>
              <div className="al-bi" style={{ border: `1.5px solid ${c.colors[0]}CC`, background: `radial-gradient(circle at 32% 26%,${c.colors[0]}2E,${c.colors[1]}0F 62%,transparent)`, boxShadow: `0 0 26px -10px ${c.colors[1]}, inset 0 0 22px -12px ${c.colors[0]}` }}>
                <span className="bn" style={{ fontSize: clamp(r / 4.3, 9, 13.5), color: c.colors[0] }}>{c.short}</span>
                <span className="ba" style={{ fontSize: clamp(r / 3.1, 11, 18) }}>{rupees(v)}</span>
                {r > 44 && <span className="bp">{c.pct}%{view.sip ? ' · /mo' : ''}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function ClassSheetBody({ view, c }) {
  return (
    <>
      <div className="al-metas">
        <span>Share<b>{c.pct}%</b></span>
        <span>{view.sip ? 'Per month (avg)' : 'Amount'}<b>{rupees(view.sip ? c.monthly : c.amount)}</b></span>
        {!view.sip && c.xirr != null && <span>Expected XIRR<b>{c.xirr}% a year</b></span>}
        {!view.sip && c.outlook && <span>3M outlook<b style={{ color: c.outlook === 'bullish' ? 'var(--jade)' : c.outlook === 'bearish' ? 'var(--warn)' : 'var(--tx-dim)' }}>{c.outlook}</b></span>}
      </div>
      {c.reason && <div className="al-why" data-row><small>Why this</small><p>{c.reason}</p></div>}
      <h4 className="al-sec">Where to put it</h4>
      {c.funds.length === 0 && <p className="al-note">No specific instruments for this class.</p>}
      {c.funds.map((f, i) => (
        <div key={i} className="al-fund" data-row>
          <div>{f.name}{f.ticker && <span className="al-tkr">{f.ticker}</span>}<small>{f.type}</small></div>
          <div className="fa">{rupees(f.amount)}{view.sip && f.monthly != null && <small style={{ fontWeight: 500, display: 'inline' }}> ≈ {rupees(f.monthly)}/mo</small>}</div>
        </div>
      ))}
    </>
  );
}
