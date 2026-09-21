import { useEffect, useRef, useId } from 'react';
import { animate } from 'motion';
import { clamp, rupees, useReducedMotion } from './util.js';
import { spring } from './kit.jsx';

const JAR = 'M94 34 L94 56 C94 66 88 72 76 80 C46 100 24 130 24 172 C24 236 66 274 120 274 C174 274 216 236 216 172 C216 130 194 100 164 80 C152 72 146 66 146 56 L146 34 Z';
const WAVE = 'M0 0 Q30 -9 60 0 T120 0 T180 0 T240 0 T300 0 T360 0 V150 H0Z';
const Y0 = 274, Y1 = 72;
const BUBBLES = [[70, 54, 3.2], [112, 96, 2.4], [150, 70, 3.6], [96, 130, 2.2], [168, 120, 2.8]];

export function MiniJar({ level = 0.55 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="al-minijar" viewBox="0 0 240 300" aria-hidden="true">
      <defs>
        <clipPath id={`mc${id}`}><path d={JAR} /></clipPath>
        <linearGradient id={`mg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F2DDAA" /><stop offset=".5" stopColor="#D5AC5E" /><stop offset="1" stopColor="#8C5A24" /></linearGradient>
      </defs>
      <g clipPath={`url(#mc${id})`}><rect x="0" y={Y0 - level * (Y0 - Y1)} width="240" height="300" fill={`url(#mg${id})`} /></g>
      <path d={JAR} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.5)" strokeWidth="5" />
    </svg>
  );
}

/**
 * The jar you pour into. `value` is a rupee amount on a log scale between min
 * and max; dragging (or arrow keys) reports a snapped value through onChange.
 * The level springs, and a coin drops each time the amount changes.
 */
export default function Jar({ value, min, max, snap, onChange, label = 'Amount' }) {
  const uid = useId().replace(/:/g, '');
  const wrap = useRef(null);
  const svg = useRef(null);
  const liq = useRef(null);
  const coins = useRef(null);
  const shown = useRef(null);
  const anim = useRef(null);
  const lastCoin = useRef(0);
  const dragging = useRef(false);
  const reduce = useReducedMotion();
  const toT = (v) => Math.log(clamp(v, min, max) / min) / Math.log(max / min);
  const fromT = (t) => min * Math.pow(max / min, clamp(t, 0, 1));

  const setLevel = (t) => { if (liq.current) liq.current.style.transform = `translateY(${Y0 - clamp(t, 0, 1.03) * (Y0 - Y1)}px)`; };

  useEffect(() => {
    const t = toT(value);
    if (shown.current == null) { shown.current = t; setLevel(t); return undefined; }
    anim.current?.stop();
    anim.current = animate(shown.current, t, {
      ...spring(150, 11, reduce),
      onUpdate: (x) => { shown.current = x; setLevel(x); },
    });
    dropCoin(t);
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function dropCoin(t) {
    if (reduce || !coins.current) return;
    const now = Date.now();
    if (now - lastCoin.current < 330) return;
    lastCoin.current = now;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = `<circle r="15" fill="url(#coin${uid})" stroke="#8C5A24" stroke-width="1.6"/><circle r="10.5" fill="none" stroke="#FFF3CC" stroke-opacity=".7"/><text y="4.8" text-anchor="middle" font-size="13" font-weight="800" fill="#6E4413" font-family="Manrope,sans-serif">₹</text>`;
    coins.current.appendChild(g);
    const y = Y0 - t * (Y0 - Y1);
    const a = g.animate([
      { transform: 'translate(120px,-10px) rotate(-40deg)', opacity: 0 },
      { transform: 'translate(120px,22px) rotate(0deg)', opacity: 1, offset: 0.18 },
      { transform: `translate(120px,${y}px) rotate(220deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(120px,${y + 34}px) rotate(320deg) scale(.7)`, opacity: 0 },
    ], { duration: 950, easing: 'cubic-bezier(.45,0,.7,.6)' });
    a.onfinish = () => g.remove();
  }

  const fromY = (e) => {
    const r = svg.current.getBoundingClientRect();
    const yv = ((e.clientY - r.top) / r.height) * 300;
    onChange(snap(fromT((Y0 - yv) / (Y0 - Y1))));
  };
  const step = (dir, big) => {
    const s = snap(value * (1 + 0.08 * dir * (big ? 4 : 1)));
    onChange(s === value ? snap(value + dir * (snap(min) || 500)) : s);
  };

  return (
    <div ref={wrap} className="al-jarwrap" tabIndex={0} role="slider" aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={rupees(value)}
      onPointerDown={(e) => { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } fromY(e); }}
      onPointerMove={(e) => { if (dragging.current) fromY(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        const k = e.key;
        if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'PageUp') { step(1, k === 'PageUp'); e.preventDefault(); }
        else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 'PageDown') { step(-1, k === 'PageDown'); e.preventDefault(); }
      }}>
      <svg ref={svg} viewBox="0 0 240 300" aria-hidden="true">
        <defs>
          <clipPath id={`c${uid}`}><path d={JAR} /></clipPath>
          <linearGradient id={`q${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F7E7BC" /><stop offset=".26" stopColor="#DDB468" /><stop offset=".62" stopColor="#B57A34" /><stop offset="1" stopColor="#7A4A1E" /></linearGradient>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".5" stopColor="#fff" stopOpacity=".03" /><stop offset="1" stopColor="#fff" stopOpacity=".1" /></linearGradient>
          <linearGradient id={`r${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".8" /><stop offset=".5" stopColor="#fff" stopOpacity=".2" /><stop offset="1" stopColor="#fff" stopOpacity=".55" /></linearGradient>
          <radialGradient id={`coin${uid}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFF3CC" /><stop offset=".45" stopColor="#E2B860" /><stop offset="1" stopColor="#A97C36" /></radialGradient>
        </defs>
        <path d={JAR} fill={`url(#g${uid})`} />
        <g clipPath={`url(#c${uid})`}>
          <g ref={liq} style={{ transform: `translateY(${Y0}px)` }}>
            <rect x="-20" y="149" width="400" height="260" fill="#7A4A1E" />
            <path className="al-wv w2" d={WAVE} fill={`url(#q${uid})`} opacity=".5" transform="translate(-40 -4)" />
            <path className="al-wv" d={WAVE} fill={`url(#q${uid})`} />
            {BUBBLES.map((b, i) => <circle key={i} cx={b[0]} cy={b[1]} r={b[2]} fill="#fff" opacity=".35" />)}
          </g>
        </g>
        <path d={JAR} fill="none" stroke={`url(#r${uid})`} strokeWidth="3" />
        <ellipse cx="120" cy="34" rx="26" ry="6.5" fill="rgba(255,255,255,.07)" stroke={`url(#r${uid})`} strokeWidth="2.5" />
        <path d="M50 132 C38 154 36 182 44 208" fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="7" strokeLinecap="round" />
        <path d="M64 108 C60 114 56 120 54 126" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" />
        <g ref={coins} />
        <g fill="#F7E7BC">
          <path className="al-spk" d="M22 60 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
          <path className="al-spk" style={{ animationDelay: '1.2s' }} d="M214 92 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" />
        </g>
      </svg>
    </div>
  );
}
