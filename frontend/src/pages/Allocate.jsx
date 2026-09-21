import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate } from 'motion';
import { api } from '../api.js';
import { useAllocate } from '../context/AllocateContext.jsx';
import BrokerGuide from '../components/BrokerGuide.jsx';
import { Sheet, SPRING } from '../allocate/kit.jsx';
import { PathBeat, AmountBeat, DurationBeat, DayBeat, RhythmBeat, TemperBeat } from '../allocate/beats1.jsx';
import { ReadingBeat, VerdictBeat, WhereBeat, ClassSheetBody } from '../allocate/beats2.jsx';
import { GrowthBeat, ScheduleSheetBody, RealityBeat, TaxBeat, TakeBeat } from '../allocate/beats3.jsx';
import { buildView } from '../allocate/model.js';
import { dotGradient, useReducedMotion } from '../allocate/util.js';
import '../allocate/allocate.css';
import '../allocate/beats.css';
import '../allocate/beats2.css';

const SIPB = ['path', 'amount', 'time', 'day', 'rhythm', 'temper', 'reading', 'verdict', 'where', 'growth', 'reality', 'tax', 'take'];
const LUMPB = ['path', 'amount', 'temper', 'reading', 'verdict', 'where', 'reality', 'take'];
const NAMES = {
  path: 'Path', amount: 'Amount', time: 'Duration', day: 'Day', rhythm: 'Rhythm', temper: 'Temperament', reading: 'Reading',
  verdict: 'The verdict', where: 'Where it goes', growth: 'Growth', reality: 'Reality check', tax: 'Tax notes', take: 'Take it with you',
};

export default function Allocate() {
  const A = useAllocate();
  const { mode, profile, result, sipPlan, loading, sipLoading, error, sipError, submit, submitSip } = A;
  const navigate = useNavigate();
  const sip = mode === 'sip';
  const list = sip ? SIPB : LUMPB;
  const busy = sip ? sipLoading : loading;
  const err = sip ? sipError : error;
  const view = useMemo(() => buildView(mode, sipPlan, result), [mode, sipPlan, result]);

  // Coming back to the tab with a finished plan lands on the verdict.
  const [beat, setBeat] = useState(() => (view ? 'verdict' : busy ? 'reading' : 'path'));
  const [visited, setVisited] = useState(() => (view ? 99 : 0));
  const [dir, setDir] = useState(1);
  const [sheet, setSheet] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [compact, setCompact] = useState(false);
  const [fd, setFd] = useState(6.8);
  const stage = useRef(null);
  const beatEl = useRef(null);
  const toastEl = useRef(null);
  const reduce = useReducedMotion();
  const idx = Math.max(0, list.indexOf(beat));
  const vi = list.indexOf('verdict');
  const inResults = idx >= vi;

  useEffect(() => { api.fdRate().then((r) => setFd(r.rate ?? 6.8)).catch(() => {}); }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el || !('ResizeObserver' in window)) return undefined;
    const ro = new ResizeObserver(() => setCompact(el.clientWidth < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = useCallback((name, d) => {
    const to = list.indexOf(name);
    if (to < 0) return;
    setSheet(null);
    setDir(d ?? (to >= idx ? 1 : -1));
    setBeat(name);
    setVisited((v) => Math.max(v, to));
  }, [list, idx]);

  // A profile flip (lump sum re-runs the plan) puts the reading screen back up.
  useEffect(() => { if (busy && inResults) go('reading', 1); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Slide each new screen in.
  useEffect(() => {
    if (!beatEl.current || reduce) return;
    animate(beatEl.current, { opacity: [0, 1] }, { duration: 0.28 });
    animate(beatEl.current, { x: [dir * 40, 0] }, SPRING(320, 34));
    beatEl.current.scrollTop = 0;
  }, [beat]); // eslint-disable-line react-hooks/exhaustive-deps

  const toast = useCallback((msg) => setToastMsg({ msg, id: Date.now() }), []);
  useEffect(() => {
    if (!toastMsg) return undefined;
    if (toastEl.current && !reduce) animate(toastEl.current, { opacity: [0, 1], y: [14, 0] }, SPRING(400, 28));
    const id = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(id);
  }, [toastMsg, reduce]);

  const build = () => { (sip ? submitSip : submit)(); go('reading', 1); };
  const next = () => {
    const name = beat;
    if (name === 'temper') build(); else go(list[idx + 1], 1);
  };
  const openClass = (c) => setSheet({ title: c.label, dot: dotGradient(c.colors), body: <ClassSheetBody view={view} c={c} /> });
  const openSchedule = () => setSheet({ title: 'Full schedule', body: <ScheduleSheetBody view={view} /> });
  const openBrokers = () => setSheet({
    title: 'Set up your accounts',
    body: <BrokerGuide assetClasses={view.classes.map((c) => c.key)} />,
  });

  // The stage picks up the temperament colours as soon as it's chosen.
  const mood = profile;

  const renderBeat = () => {
    switch (beat) {
      case 'path': return <PathBeat onPick={() => { setDir(1); setBeat('amount'); setVisited((v) => Math.max(v, 1)); }} />;
      case 'amount': return <AmountBeat />;
      case 'time': return <DurationBeat />;
      case 'day': return <DayBeat />;
      case 'rhythm': return <RhythmBeat />;
      case 'temper': return <TemperBeat />;
      case 'reading': return <ReadingBeat loading={busy} error={err} onRetry={build} onEdit={() => go('temper', -1)} onDone={() => go('verdict', 1)} />;
      case 'verdict': return view ? <VerdictBeat view={view} /> : null;
      case 'where': return view ? <WhereBeat view={view} openClass={openClass} /> : null;
      case 'growth': return view ? <GrowthBeat view={view} compact={compact} openSchedule={openSchedule} fdRate={fd} /> : null;
      case 'reality': return view ? <RealityBeat view={view} months={sip ? view.months : 0} /> : null;
      case 'tax': return view ? <TaxBeat view={view} /> : null;
      case 'take': return view ? <TakeBeat view={view} fdRate={fd} toast={toast} /> : null;
      default: return null;
    }
  };

  const isLast = idx === list.length - 1;
  let bottom;
  if (err && beat === 'reading') bottom = <p className="al-hint">Nothing was lost — your inputs are still there.</p>;
  else if (beat === 'path') bottom = <p className="al-hint">Tap a card to begin — no forms, no scrolling.</p>;
  else if (beat === 'reading') bottom = <p className="al-hint">The wait is real: the plan is built fresh from today’s market.</p>;
  else if (!inResults) {
    bottom = (
      <>
        {beat === 'rhythm' && <button type="button" className="al-btn ghost" onClick={() => { A.setStepUpOn(false); A.setPauseMonths([]); A.setInflation(6); go('temper', 1); }}>Use defaults</button>}
        <button type="button" className="al-btn pri" onClick={next}>{beat === 'temper' ? 'Build my plan' : 'Continue'}</button>
      </>
    );
  } else {
    bottom = (
      <>
        <button type="button" className="al-btn ghost sq" aria-label="Previous screen" disabled={idx === vi} style={idx === vi ? { opacity: 0.3 } : undefined} onClick={() => go(list[idx - 1], -1)}>‹</button>
        <span className="al-scenelbl">{idx - vi + 1} / {list.length - vi}</span>
        {!isLast && <button type="button" className="al-btn pri" onClick={() => go(list[idx + 1], 1)}>Next · {NAMES[list[idx + 1]]} ›</button>}
        {isLast && sip && view && <button type="button" className="al-btn pri" onClick={openBrokers}>Set up your accounts ›</button>}
        {isLast && !sip && <button type="button" className="al-btn ghost" style={{ flex: 1 }} onClick={() => go('amount', -1)}>Try another amount</button>}
      </>
    );
  }

  // Arrow keys and swipe move between result screens, like the mockup.
  const sx = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (!inResults || sheet || e.target.matches('input,textarea,[role=slider]')) return;
      if (e.key === 'ArrowRight' && idx < list.length - 1) go(list[idx + 1], 1);
      if (e.key === 'ArrowLeft' && idx > vi) go(list[idx - 1], -1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inResults, sheet, idx, list, vi, go]);

  return (
    <div className="page al">
      <div className="al-head">
        <h2>Investment Planner</h2>
        <button type="button" className="al-classic" onClick={() => navigate('/allocate/classic')}>Use the classic form</button>
      </div>
      <div ref={stage} className="al-stage" data-mood={mood}>
        <div className="al-aurora"><i className="al-blob al-b1" /><i className="al-blob al-b2" /><i className="al-blob al-b3" /></div>
        <div className="al-top">
          <button type="button" className="al-back" aria-label="Back" hidden={idx === 0 || beat === 'reading'} onClick={() => go(list[idx - 1], -1)}>‹</button>
          <div className="al-pips">
            {list.map((b, i) => {
              const can = i <= visited && b !== 'reading' && i !== idx && (i < vi || !!view);
              return <button key={b} type="button" className={`al-pip ${i < idx ? 'done' : ''} ${i === idx ? 'cur' : ''}`} aria-label={NAMES[b]} disabled={!can} onClick={() => go(b)}><span /></button>;
            })}
          </div>
          <span className="al-where">{NAMES[beat]}</span>
        </div>
        <div className="al-vp">
          <section ref={beatEl} key={beat} className="al-beat"
            onPointerDown={(e) => { sx.current = e.target.closest('button,input,a,[role=slider],[data-noswipe],.al-cal,.al-gr,.al-bubbles,.al-jr') ? null : [e.clientX, e.clientY]; }}
            onPointerUp={(e) => {
              const s = sx.current; sx.current = null;
              if (!s || !inResults) return;
              const dx = e.clientX - s[0], dy = e.clientY - s[1];
              if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
              if (dx < 0 && idx < list.length - 1) go(list[idx + 1], 1); else if (dx > 0 && idx > vi) go(list[idx - 1], -1);
            }}>
            {renderBeat()}
          </section>
        </div>
        <div className="al-bot">{bottom}</div>
        {sheet && <Sheet title={sheet.title} onClose={() => setSheet(null)}>{sheet.body}</Sheet>}
        {toastMsg && <div ref={toastEl} className="al-toast" role="status">{toastMsg.msg}</div>}
      </div>
    </div>
  );
}
