import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { animate, stagger } from 'motion';
import { useReducedMotion } from './util.js';

export const SPRING = (k = 400, d = 30) => ({ type: 'spring', stiffness: k, damping: d });
export const spring = (k, d, reduce) => (reduce ? { duration: 0 } : SPRING(k, d));

export function Diya({ className = 'al-diya' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 14h18c0 4-3.6 7-9 7s-9-3-9-7z" fill="#C79A4C" />
      <path d="M12 2c2.6 2.6 3.4 5 0 8-3.4-3-2.6-5.4 0-8z" fill="#F2DDAA" />
    </svg>
  );
}

/** A number that counts to its new value instead of jumping. */
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = 0.7, className, as: Tag = 'span' }) {
  const ref = useRef(null);
  const from = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (reduce) { node.textContent = format(value); from.current = value; return undefined; }
    const a = animate(from.current, value, {
      duration, ease: [0.2, 0.7, 0.3, 1],
      onUpdate: (v) => { node.textContent = format(v); from.current = v; },
    });
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <Tag ref={ref} className={className}>{format(from.current)}</Tag>;
}

/** Steady / Balanced / Bold style control with one highlight that slides. */
export function Segmented({ value, onChange, options, className = '' }) {
  const wrap = useRef(null);
  const ind = useRef(null);
  const reduce = useReducedMotion();
  const place = useCallback((instant) => {
    const w = wrap.current, i = ind.current;
    if (!w || !i) return;
    const btn = w.querySelector('[aria-checked="true"]');
    if (!btn) return;
    const to = { x: btn.offsetLeft - 4, width: btn.offsetWidth };
    animate(i, to, instant || reduce ? { duration: 0 } : SPRING(420, 34));
  }, [reduce]);
  useLayoutEffect(() => { place(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { place(false); }, [value, place]);
  useEffect(() => {
    const on = () => place(true);
    window.addEventListener('resize', on);
    if (document.fonts?.ready) document.fonts.ready.then(on);
    return () => window.removeEventListener('resize', on);
  }, [place]);
  return (
    <div ref={wrap} className={`al-flip ${className}`} role="radiogroup" style={{ position: 'relative' }}>
      <div ref={ind} style={{ position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 10, background: 'linear-gradient(135deg,rgba(255,255,255,.18),rgba(255,255,255,.07))', border: '1px solid rgba(255,255,255,.18)', pointerEvents: 'none' }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''} style={{ position: 'relative' }}
          onClick={() => onChange(o.value)}>
          <b>{o.label}</b>{o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/** Toggle whose knob stretches on press, then springs across. */
export function Switch({ checked, onChange, label }) {
  const knob = useRef(null);
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    const opts = first.current || reduce ? { duration: 0 } : SPRING(650, 26);
    animate(knob.current, { width: 19, x: checked ? 19 : 0 }, opts);
    first.current = false;
  }, [checked, reduce]);
  const press = () => { if (!reduce) animate(knob.current, { width: 25, x: checked ? 13 : 0 }, SPRING(600, 28)); };
  const release = () => { if (!reduce) animate(knob.current, { width: 19, x: checked ? 19 : 0 }, SPRING(600, 28)); };
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="al-sw"
      onPointerDown={press} onPointerLeave={release} onClick={() => onChange(!checked)}>
      <i ref={knob} />
    </button>
  );
}

/** Press and hold to confirm; letting go early rewinds. */
export function HoldButton({ label, doneLabel, onComplete, disabled, holdSeconds = 1.1 }) {
  const fill = useRef(null);
  const btn = useRef(null);
  const st = useRef({ p: 0, anim: null, down: false, done: false });
  const [done, setDone] = useState(false);
  const [past, setPast] = useState(false);
  const reduce = useReducedMotion();
  const paint = (v) => { st.current.p = v; if (fill.current) fill.current.style.width = `${v * 100}%`; setPast(v > 0.5); };
  const start = () => {
    const s = st.current;
    if (s.done || s.down || disabled) return;
    s.down = true;
    s.anim?.stop();
    s.anim = animate(s.p, 1, { duration: holdSeconds * (1 - s.p), ease: 'linear', onUpdate: paint, onComplete: finish });
    if (!reduce) animate(btn.current, { scale: 0.98 }, SPRING(500, 24));
  };
  const cancel = () => {
    const s = st.current;
    if (!s.down) return;
    s.down = false;
    if (!reduce) animate(btn.current, { scale: 1 }, SPRING(500, 22));
    if (s.done) return;
    s.anim?.stop();
    s.anim = animate(s.p, 0, { ...spring(160, 22, reduce), onUpdate: paint });
  };
  function finish() {
    const s = st.current;
    if (!s.down || s.done) return;
    s.done = true; s.down = false;
    setDone(true);
    if (!reduce) animate(btn.current, { scale: [0.98, 1.03, 1] }, { duration: 0.35 });
    onComplete?.();
  }
  useEffect(() => () => st.current.anim?.stop(), []);
  return (
    <button ref={btn} type="button" className={`al-hold ${past || done ? 'done' : ''}`} disabled={disabled}
      aria-label={done ? doneLabel : label}
      onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } start(); }}
      onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') cancel(); }}>
      <div ref={fill} className="fill" />
      <div className="lb">
        {done && (
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#1B1408" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span>{done ? doneLabel : label}</span>
      </div>
    </button>
  );
}

/** Bottom sheet: springs up, drag the grab bar down (or tap outside) to dismiss. */
export function Sheet({ onClose, title, children }) {
  const panel = useRef(null);
  const bk = useRef(null);
  const drag = useRef(null);
  const reduce = useReducedMotion();
  const H = () => (panel.current?.offsetHeight || 320) + 20;
  useEffect(() => {
    animate(panel.current, { y: H() }, { duration: 0 });
    animate(panel.current, { y: 0 }, spring(320, 32, reduce));
    animate(bk.current, { opacity: [0, 1] }, { duration: reduce ? 0 : 0.25 });
    const rows = panel.current.querySelectorAll('[data-row]');
    if (!reduce && rows.length) animate(rows, { opacity: [0, 1], y: [12, 0] }, { delay: stagger(0.05, { startDelay: 0.15 }), duration: 0.3 });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function close() {
    animate(bk.current, { opacity: 0 }, { duration: 0.2 });
    animate(panel.current, { y: H() }, spring(300, 34, reduce)).then(() => onClose());
  }
  const down = (e) => { drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    animate(panel.current, { y: d.dy }, { duration: 0 });
    animate(bk.current, { opacity: 1 - d.dy / H() }, { duration: 0 });
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > 90 || v > 0.6) close();
    else { animate(panel.current, { y: 0 }, spring(320, 26, reduce)); animate(bk.current, { opacity: 1 }, { duration: 0.15 }); }
  };
  return (
    <div className="al-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={bk} className="al-sheet-bk" onClick={close} />
      <div ref={panel} className="al-sheet-c">
        <div className="al-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        <div className="al-sh-h"><h3>{title}</h3><button type="button" className="al-sh-x" aria-label="Close" onClick={close}>✕</button></div>
        {children}
      </div>
    </div>
  );
}
