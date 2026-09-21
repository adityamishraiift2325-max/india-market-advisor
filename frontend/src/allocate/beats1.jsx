import { useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'motion';
import { useAllocate } from '../context/AllocateContext.jsx';
import Jar, { MiniJar } from './Jar.jsx';
import { CountUp, Diya, Switch, SPRING } from './kit.jsx';
import {
  clamp, rupees, words, ordinal, MON, MONF, DOWF, PROFILES, PROFILE_META, SHAPE_C,
  useFestivals, festFor, firstMonth, monthList, bez, useReducedMotion,
} from './util.js';

const spanText = (n) => {
  const y = Math.floor(n / 12), m = n % 12;
  return (y ? `${y} ${y > 1 ? 'yrs' : 'yr'}` : '') + (y && m ? ' ' : '') + (m ? `${m} mo` : '');
};

/* ---------------------------------------------------------------- path */
export function PathBeat({ onPick }) {
  const { setMode } = useAllocate();
  const pick = (m) => { setMode(m); onPick(m); };
  return (
    <>
      <h2 className="al-q">How would you like to put your money to work?</h2>
      <p className="al-sub">Two ways in. You can come back and try the other.</p>
      <div className="al-paths">
        <button type="button" className="al-pathcard" data-p="lump" onClick={() => pick('lumpsum')}>
          <MiniJar level={0.6} />
          <div><b>All at once</b><span className="d">A lump sum, split across asset classes today.</span></div>
        </button>
        <button type="button" className="al-pathcard" data-p="sip" onClick={() => pick('sip')}>
          <MiniJar level={0.35} />
          <div><b>Little by little</b><span className="d">A monthly SIP that leans into gold around festivals.</span></div>
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- amount */
const RANGES = {
  sip: { min: 1000, max: 100000, chips: [2000, 5000, 10000, 25000], snap: (v) => Math.round(v / 500) * 500, step: () => 500 },
  lump: {
    min: 10000, max: 10000000, chips: [50000, 200000, 500000, 2500000],
    step: (v) => (v < 100000 ? 5000 : v < 1000000 ? 10000 : 50000),
    snap: (v) => { const s = v < 100000 ? 5000 : v < 1000000 ? 10000 : 50000; return Math.round(v / s) * s; },
  },
};
export function AmountBeat() {
  const { mode, monthly, setMonthly, months, amount, setAmount } = useAllocate();
  const sip = mode === 'sip';
  const c = sip ? RANGES.sip : RANGES.lump;
  const value = sip ? monthly : Number(amount);
  const set = (v) => { const n = clamp(c.snap(v), c.min, c.max); return sip ? setMonthly(n) : setAmount(n); };
  const t = Math.log(clamp(value, c.min, c.max) / c.min) / Math.log(c.max / c.min);
  return (
    <>
      <h2 className="al-q">{sip ? 'How much can you set aside each month?' : 'How much would you like to invest?'}</h2>
      <p className="al-sub">{sip ? 'Pour it in. Drag the jar, or use the slider.' : 'One lump sum, split across asset classes today.'}</p>
      <div className="al-amt">
        <Jar value={clamp(value, c.min, c.max)} min={c.min} max={c.max} snap={(v) => clamp(c.snap(v), c.min, c.max)} onChange={set} label={sip ? 'Monthly amount' : 'Amount'} />
        <div className="al-amt-r">
          <div className="al-bignum">
            <CountUp value={value} format={rupees} />
            {sip && <small> / month</small>}
          </div>
          <div className="al-words">{sip ? `${rupees(value * months)} over ${months} months · duration next` : words(value)}</div>
          <input className="al-range" type="range" min="0" max="1000" aria-label="Amount slider"
            value={Math.round(t * 1000)} style={{ '--p': `${t * 100}%` }}
            onChange={(e) => set(c.min * Math.pow(c.max / c.min, e.target.value / 1000))} />
          <div className="al-chips al-amt-chips">
            {c.chips.map((v) => <button key={v} type="button" className={`al-chip ${v === value ? 'on' : ''}`} onClick={() => set(v)}>{rupees(v)}</button>)}
          </div>
          <div className="al-stp al-amt-stp">
            <button type="button" aria-label="Decrease" onClick={() => set(value - c.step(value))}>−</button>
            <span className="v">fine-tune</span>
            <button type="button" aria-label="Increase" onClick={() => set(value + c.step(value))}>+</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ duration */
const MINM = 3, MAXM = 120;
export function DurationBeat() {
  const { months, setDuration, sipDate } = useAllocate();
  const fests = useFestivals();
  const jr = useRef(null);
  const drag = useRef(false);
  const handle = useRef(null);
  const reduce = useReducedMotion();
  const set = (v) => setDuration(clamp(Math.round(v) || 12, MINM, MAXM));
  const ml = useMemo(() => monthList(months, sipDate, fests), [months, sipDate, fests]);
  const far = useMemo(() => monthList(MAXM, sipDate, fests), [sipDate, fests]);
  const seen = new Set();
  const marks = far.filter((m) => { if (!m.fest) return false; const k = m.fest.name + m.d.getFullYear(); if (seen.has(k)) return false; seen.add(k); return true; });
  const inside = []; const seen2 = new Set(); let caught = 0;
  ml.forEach((m) => { if (m.fest) { caught += 1; const k = m.fest.name + m.d.getFullYear(); if (!seen2.has(k)) { seen2.add(k); inside.push(m); } } });
  const pc = (months / MAXM) * 100;
  useEffect(() => { if (handle.current && !reduce) animate(handle.current, { scale: [1.15, 1] }, { duration: 0.18 }); }, [months, reduce]);
  const fromX = (e) => { const r = jr.current.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * MAXM); };
  const last = ml[months - 1];
  const notes = [];
  if (months < 12) notes.push('Under a year is a short window for equity — a bad stretch may not recover in time.');
  if (last && fests.length) {
    const lastFest = fests.reduce((a, f) => (f.date > a ? f.date : a), '');
    if (last.d > new Date(lastFest + 'T00:00:00')) notes.push(`Festival tilts are only known until ${lastFest.slice(0, 4)}, so later months get none.`);
  }
  return (
    <>
      <h2 className="al-q">For how long?</h2>
      <div className="al-dur">
        <span className="big">{months}<small>months</small></span>
        <span className="span">{months >= 12 ? `${spanText(months)} · ` : ''}{ml[0]?.label} → {last?.label}</span>
      </div>
      <div ref={jr} className="al-jr" tabIndex={0} role="slider" aria-label="Duration in months" aria-valuemin={MINM} aria-valuemax={MAXM} aria-valuenow={months}
        onPointerDown={(e) => { drag.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } fromX(e); }}
        onPointerMove={(e) => { if (drag.current) fromX(e); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
        onKeyDown={(e) => {
          const k = e.key, d = k === 'ArrowRight' || k === 'ArrowUp' ? 1 : k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : k === 'PageUp' ? 6 : k === 'PageDown' ? -6 : 0;
          if (d) { set(months + d); e.preventDefault(); }
        }}>
        <div className="al-jr-line" />
        <div className="al-jr-fill" style={{ width: `${pc}%` }} />
        {Array.from({ length: MAXM / 12 }, (_, i) => {
          const y = i + 1;
          return (
            <span key={y}>
              <div className={`al-jr-tick ${y * 12 <= months ? 'past' : ''}`} style={{ left: `${(y * 12 / MAXM) * 100}%` }} />
              <div className="al-jr-yr" style={{ left: `${(y * 12 / MAXM) * 100}%` }}>{y}y</div>
            </span>
          );
        })}
        {marks.map((m) => (
          <div key={m.label + m.fest.name} className="al-jr-fest" style={{ left: `${((m.i + 0.5) / MAXM) * 100}%`, opacity: m.i < months ? 1 : 0.3 }} title={m.fest.name}><Diya className="al-diya" /></div>
        ))}
        <div ref={handle} className="al-jr-h" style={{ left: `${pc}%` }} />
        <div className="al-jr-tag" style={{ left: `${clamp(pc, 6, 94)}%` }}>{months} mo</div>
        <div className="al-jr-end" style={{ left: 0 }}>Start · {far[0]?.label}</div>
        <div className="al-jr-end" style={{ right: 0 }}>10 yrs</div>
      </div>
      <div className="al-durrow"><div className="al-chips">
        {[6, 12, 24, 36, 60].map((h) => <button key={h} type="button" className={`al-chip ${months === h ? 'on' : ''}`} onClick={() => set(h)}>{h < 12 ? `${h} months` : `${h / 12} ${h === 12 ? 'year' : 'years'}`}</button>)}
      </div></div>
      <div className="al-durrow"><div className="al-stp">
        <button type="button" aria-label="One month less" onClick={() => set(months - 1)}>−</button>
        <input className="al-numin" type="number" min={MINM} max={MAXM} inputMode="numeric" aria-label="Custom number of months" value={months}
          onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= MINM && v <= MAXM) set(v); }} />
        <span>months</span>
        <button type="button" aria-label="One month more" onClick={() => set(months + 1)}>+</button>
      </div></div>
      <div className="al-fest-line">
        {caught ? <><span>{caught} festival month{caught > 1 ? 's' : ''} inside your plan:</span>
          {inside.map((m) => <span key={m.label} className="al-fchip"><Diya />{m.fest.name} · {MON[m.d.getMonth()]} ’{String(m.d.getFullYear()).slice(2)}</span>)}</>
          : <span>No festival months inside this plan.</span>}
      </div>
      {notes.length > 0 && <p className="al-note">{notes.join(' ')}</p>}
    </>
  );
}

/* ----------------------------------------------------------------- day */
export function DayBeat() {
  const { months, sipDate, setSipDate } = useAllocate();
  const fests = useFestivals();
  const today = new Date();
  const [off, setOff] = useState(0);
  const fm = firstMonth(sipDate, today);
  const vm = new Date(fm.y, fm.m + off, 1);
  const y = vm.getFullYear(), m = vm.getMonth();
  const ml = useMemo(() => monthList(months, sipDate, fests), [months, sipDate, fests]);
  const first = ml[0].d, last = ml[ml.length - 1].d;
  const dn = new Date(y, m, sipDate);
  const f = festFor(fests, dn);
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const fdates = Object.fromEntries(fests.map((x) => [x.date, x.name]));
  const pad = (n) => String(n).padStart(2, '0');
  const pick = (d) => {
    const abs = fm.y * 12 + fm.m + off;
    setSipDate(d);
    const f1 = firstMonth(d, today);
    setOff(clamp(abs - (f1.y * 12 + f1.m), 0, months - 1));
  };
  const dow = dn.getDay(), we = dow === 0 || dow === 6;
  return (
    <>
      <h2 className="al-q">Which day of the month?</h2>
      <p className="al-sub">Your first debit is <b style={{ color: 'var(--tx)' }}>{DOWF[first.getDay()].slice(0, 3)}, {first.getDate()} {MON[first.getMonth()]} {first.getFullYear()}</b>. Browse the months, tap a date.</p>
      <div className="al-cal al-glass">
        <div className="al-cal-h">
          <button type="button" aria-label="Previous month" disabled={off <= 0} onClick={() => setOff(Math.max(0, off - 1))}>‹</button>
          <b>{MONF[m]} {y}</b>
          <button type="button" aria-label="Next month" disabled={off >= months - 1} onClick={() => setOff(Math.min(months - 1, off + 1))}>›</button>
        </div>
        <div className="al-cal-badge">{f && <><Diya />Festival month — gold and silver lean in (×{f.goldTiltFactor})</>}</div>
        <div className="al-cal-g">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <div key={d} className={`al-cal-w ${i > 4 ? 'we' : ''}`}>{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const d = i + 1, dt = new Date(y, m, d), w = dt.getDay(), wk = w === 0 || w === 6;
            const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
            const past = y === today.getFullYear() && m === today.getMonth() && d <= today.getDate();
            const off2 = d > 28 || past;
            return (
              <button key={d} type="button" className={`al-cd ${wk ? 'we' : ''} ${d === sipDate ? 'pick' : ''}`} disabled={off2}
                title={d > 28 ? 'SIP dates run from 1 to 28' : undefined}
                aria-label={`${DOWF[w]} ${d} ${MONF[m]}${fdates[iso] ? `, ${fdates[iso]}` : ''}`} onClick={() => pick(d)}>
                {d}{fdates[iso] && <svg className="fd" viewBox="0 0 24 24"><path d="M12 2c2.6 2.6 3.4 5 0 8-3.4-3-2.6-5.4 0-8z" fill="#F2DDAA" /></svg>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="al-dayread">
        <b>{DOWF[dow]}, {sipDate} {MONF[m]} {y}</b>
        <span>{we && <><span className="wk">That’s a weekend.</span> A debit on a non-working day usually goes through on the next working day — your platform decides. </>}
          Debited on the {ordinal(sipDate)} of every month, {months} times. Last one: {DOWF[last.getDay()].slice(0, 3)}, {last.getDate()} {MON[last.getMonth()]} {last.getFullYear()}.</span>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- rhythm */
export function RhythmBeat() {
  const { monthly, months, sipDate, stepUpOn, setStepUpOn, stepUpPct, setStepUpPct, pauseMonths, togglePause, inflation, setInflation } = useAllocate();
  const fests = useFestivals();
  const ml = useMemo(() => monthList(months, sipDate, fests), [months, sipDate, fests]);
  const s = Number(stepUpPct) / 100, a = monthly;
  const y2 = a * (1 + s), y3 = a * (1 + s) * (1 + s);
  const span = Math.max(0.06, (1 + s) * (1 + s) - 1);
  const yy = (v) => 50 - (40 * (v / a - 1)) / span;
  const pts = [[24, yy(a)], [150, yy(y2)], [276, yy(y3)]];
  const eff = months - pauseMonths.length;
  const tot = a * months;
  const groups = [];
  ml.forEach((mo) => { const yr = mo.d.getFullYear(); const g = groups[groups.length - 1]; if (g && g.yr === yr) g.items.push(mo); else groups.push({ yr, items: [mo] }); });
  const adj = Math.round(tot * Math.pow(1 + Number(inflation) / 100, months / 12));
  const skip = (i) => { if (!pauseMonths.includes(i) && pauseMonths.length >= months - 1) return; togglePause(i); };
  return (
    <>
      <h2 className="al-q sm">Fine-tune the rhythm <span style={{ color: 'var(--tx-faint)', fontSize: '.55em', fontFamily: 'Manrope,sans-serif', fontWeight: 600 }}>· optional</span></h2>
      <div className="al-mod al-glass">
        <div className="al-mod-h"><div><div className="al-mod-t">Raise it every year</div><div className="al-mod-s">Step-up SIP — incomes tend to grow</div></div>
          <Switch checked={stepUpOn} onChange={setStepUpOn} label="Step-up SIP" /></div>
        {stepUpOn && (
          <>
            <svg className="al-climb" viewBox="0 0 300 64">
              <defs>
                <linearGradient id="alclg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E9CD8C" /><stop offset="1" stopColor="#C79A4C" /></linearGradient>
                <linearGradient id="alcla" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D5AC5E" stopOpacity=".35" /><stop offset="1" stopColor="#D5AC5E" stopOpacity="0" /></linearGradient>
              </defs>
              <path d={`M${pts[0][0]},${pts[0][1]}${bez(pts)} L276,64 L24,64 Z`} fill="url(#alcla)" />
              <path d={`M${pts[0][0]},${pts[0][1]}${bez(pts)}`} fill="none" stroke="url(#alclg)" strokeWidth="2.6" strokeLinecap="round" />
              {pts.map((p, i) => (
                <g key={i}><circle cx={p[0]} cy={p[1]} r="4.5" fill="#F7ECD0" stroke="#B98436" strokeWidth="2.5" />
                  <text x={p[0]} y={p[1] - 10} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#EDEFF5" fontFamily="Manrope,sans-serif">{rupees([a, y2, y3][i])}</text></g>
              ))}
            </svg>
            <div className="al-stp" style={{ marginTop: 6 }}>
              <button type="button" aria-label="Lower step-up" onClick={() => setStepUpPct(Math.max(1, Number(stepUpPct) - 1))}>−</button>
              <span className="v">{stepUpPct}% / year</span>
              <button type="button" aria-label="Raise step-up" onClick={() => setStepUpPct(Math.min(50, Number(stepUpPct) + 1))}>+</button>
            </div>
          </>
        )}
      </div>
      <div className="al-mod al-glass">
        <div className="al-mod-h"><div><div className="al-mod-t">Skip a month</div><div className="al-mod-s">Tap a month to skip its debit</div></div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--tx-dim)', whiteSpace: 'nowrap' }}>{eff} of {months} active</span></div>
        <div className="al-skipbox">
          {groups.map((g) => (
            <div key={g.yr} className="al-skipyr"><i>{g.yr}</i>
              <div className="al-chips">{g.items.map((mo) => {
                const p = pauseMonths.includes(mo.i);
                return <button key={mo.i} type="button" className={`al-sk ${p ? 'p' : ''}`} aria-pressed={p} aria-label={`${MON[mo.d.getMonth()]} ${g.yr}${p ? ' skipped' : ''}`} onClick={() => skip(mo.i)}>{MON[mo.d.getMonth()]}</button>;
              })}</div>
            </div>
          ))}
        </div>
        <div className="al-skipsay">{pauseMonths.length
          ? <>Skipping {pauseMonths.length} month{pauseMonths.length > 1 ? 's' : ''}: the others rise from <b>{rupees(Math.round(tot / months))}</b> to <b>{rupees(Math.round(tot / eff))}</b>, so your total stays the same.</>
          : <>Nothing skipped. Your total is spread over all {months} months.</>}</div>
      </div>
      <div className="al-mod al-glass">
        <div className="al-mod-h"><div><div className="al-mod-t">Inflation to beat</div><div className="al-mod-s">What prices might do meanwhile</div></div>
          <div className="al-stp">
            <button type="button" aria-label="Lower inflation" onClick={() => setInflation(Math.max(3, +(Number(inflation) - 0.5).toFixed(1)))}>−</button>
            <span className="v">{inflation}%</span>
            <button type="button" aria-label="Raise inflation" onClick={() => setInflation(Math.min(12, +(Number(inflation) + 0.5).toFixed(1)))}>+</button>
          </div></div>
        <div className="al-inflsay">To keep pace, <b>{rupees(tot)}</b> has to become <b>{rupees(adj)}</b> in {months} months.</div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- temperament */
export function TemperBeat() {
  const { profile, setProfile } = useAllocate();
  const cards = useRef([]);
  const reduce = useReducedMotion();
  useEffect(() => {
    cards.current.forEach((el, i) => {
      if (!el) return;
      const on = PROFILES[i] === profile;
      animate(el, { y: on ? -3 : 0, scale: on ? 1.01 : 1 }, reduce ? { duration: 0 } : SPRING(420, 26));
    });
  }, [profile, reduce]);
  return (
    <>
      <h2 className="al-q">A rough month happens.<br />Markets fall 15%. You…</h2>
      <p className="al-sub">There’s no wrong answer — it just changes the mix.</p>
      <div className="al-tcards">
        {PROFILES.map((k, i) => {
          const p = PROFILE_META[k];
          return (
            <button key={k} ref={(el) => { cards.current[i] = el; }} type="button" className={`al-tc ${profile === k ? 'sel' : ''}`} data-k={k} aria-pressed={profile === k} onClick={() => setProfile(k)}>
              <div className="al-tc-top"><span className="al-tc-tag">{p.tag}</span>
                <svg className="al-wob" viewBox="0 0 96 32" aria-hidden="true"><path d={p.wob} /></svg></div>
              <div className="al-tc-say">{p.say}</div>
              <div className="al-shape">{p.shape.map((w, j) => <i key={j} style={{ flex: `${w} 0 0`, background: SHAPE_C[j] }} />)}</div>
              <div className="al-tc-foot"><span>{p.hint}</span></div>
            </button>
          );
        })}
      </div>
    </>
  );
}
