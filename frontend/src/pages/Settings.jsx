import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getPrefs, savePrefs } from '../utils/prefs.js';

const PROFILES = ['conservative', 'moderate', 'aggressive'];
const HORIZONS = [12, 18, 24, 36, 48];

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [form, setForm] = useState({
    repoRate: '', cpiInflation: '', iip: '', gdpGrowth: '', fiiTrend: '', diiTrend: '',
  });
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reset, setReset] = useState(false);

  // SIP preferences (localStorage) — prefill the SIP form + simulator.
  const [prefs, setPrefs] = useState(getPrefs());
  const [prefsSaved, setPrefsSaved] = useState(false);

  function updatePref(k, v) {
    setPrefs((p) => ({ ...p, [k]: v }));
    setPrefsSaved(false);
  }
  function savePreferences(e) {
    e.preventDefault();
    savePrefs({
      riskProfile: prefs.riskProfile,
      sipDate: Number(prefs.sipDate),
      months: Number(prefs.months),
      monthlyAmount: Number(prefs.monthlyAmount),
    });
    setPrefsSaved(true);
  }

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
    api.macro().then((m) => {
      const i = m.indicators;
      setForm({
        repoRate: i.repoRate, cpiInflation: i.cpiInflation, iip: i.iip,
        gdpGrowth: i.gdpGrowth, fiiTrend: i.fiiTrend, diiTrend: i.diiTrend,
      });
    }).catch(() => {});
  }, []);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
    setReset(false);
  }

  // Discard manual overrides and restore the maintained app defaults.
  async function resetToDefaults() {
    setResetting(true);
    setSaved(false);
    try {
      const { indicators: i } = await api.resetMacro();
      setForm({
        repoRate: i.repoRate, cpiInflation: i.cpiInflation, iip: i.iip,
        gdpGrowth: i.gdpGrowth, fiiTrend: i.fiiTrend, diiTrend: i.diiTrend,
      });
      setReset(true);
    } catch {
      /* leave the form as-is on failure */
    } finally {
      setResetting(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    const payload = {
      repoRate: Number(form.repoRate),
      cpiInflation: Number(form.cpiInflation),
      iip: Number(form.iip),
      gdpGrowth: Number(form.gdpGrowth),
      fiiTrend: form.fiiTrend,
      diiTrend: form.diiTrend,
    };
    await api.saveMacro(payload);
    setSaved(true);
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <section className="settings-card">
        <h3>API Key</h3>
        <p className="muted small">
          The Anthropic API key is read from <code>backend/.env</code>{' '}
          (<code>ANTHROPIC_API_KEY</code>). Restart the backend after changing it.
        </p>
        <div className={`status-pill ${health?.aiConfigured ? 'ok' : 'warn'}`}>
          AI engine: {health?.aiConfigured ? 'configured ✓' : 'not configured — AI endpoints disabled'}
        </div>
      </section>

      <section className="settings-card">
        <h3>Manual Macro Overrides</h3>
        <p className="muted small">
          Slow-moving indicators used in AI prompts. Update when RBI/MOSPI release new figures.
        </p>
        <form className="macro-form" onSubmit={save}>
          <label>Repo Rate (%)<input type="number" step="0.05" value={form.repoRate} onChange={(e) => update('repoRate', e.target.value)} /></label>
          <label>CPI Inflation (%)<input type="number" step="0.1" value={form.cpiInflation} onChange={(e) => update('cpiInflation', e.target.value)} /></label>
          <label>IIP (%)<input type="number" step="0.1" value={form.iip} onChange={(e) => update('iip', e.target.value)} /></label>
          <label>GDP Growth (%)<input type="number" step="0.1" value={form.gdpGrowth} onChange={(e) => update('gdpGrowth', e.target.value)} /></label>
          <label>FII Trend
            <select value={form.fiiTrend} onChange={(e) => update('fiiTrend', e.target.value)}>
              <option value="inflow">inflow</option>
              <option value="outflow">outflow</option>
              <option value="mixed">mixed</option>
            </select>
          </label>
          <label>DII Trend
            <select value={form.diiTrend} onChange={(e) => update('diiTrend', e.target.value)}>
              <option value="inflow">inflow</option>
              <option value="outflow">outflow</option>
              <option value="mixed">mixed</option>
            </select>
          </label>
          <button className="btn primary" type="submit">Save overrides</button>
          <button className="btn" type="button" onClick={resetToDefaults} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset to defaults'}
          </button>
          {saved && <span className="saved-note">Saved ✓</span>}
          {reset && <span className="saved-note">Reset to defaults ✓</span>}
        </form>
        <p className="muted small" style={{ marginTop: 10 }}>
          Reset discards your manual edits and restores the maintained baseline
          (Repo 6.5%, CPI 5.1%, IIP 3.2%, GDP 6.8%, FII mixed, DII inflow).
        </p>
      </section>

      <section className="settings-card">
        <h3>SIP Preferences</h3>
        <p className="muted small">
          Your usual SIP settings. These prefill the Allocate SIP form and the Simulator.
        </p>
        <form className="macro-form" onSubmit={savePreferences}>
          <label>Monthly SIP (₹)
            <input type="number" min="500" step="500" value={prefs.monthlyAmount} onChange={(e) => updatePref('monthlyAmount', e.target.value)} />
          </label>
          <label>Default horizon
            <select value={prefs.months} onChange={(e) => updatePref('months', e.target.value)}>
              {HORIZONS.map((h) => <option key={h} value={h}>{h} months</option>)}
            </select>
          </label>
          <label>SIP date
            <select value={prefs.sipDate} onChange={(e) => updatePref('sipDate', e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>Risk profile
            <select value={prefs.riskProfile} onChange={(e) => updatePref('riskProfile', e.target.value)}>
              {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button className="btn primary" type="submit">Save preferences</button>
          {prefsSaved && <span className="saved-note">Saved ✓ (applies on next page load)</span>}
        </form>
      </section>
    </div>
  );
}
