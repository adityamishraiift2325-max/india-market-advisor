import { useState } from 'react';
import { useMacroAlerts } from '../context/MacroAlertContext.jsx';

// Slim, app-wide banner. Hidden entirely when there's nothing to flag.
export default function MacroAlertBanner() {
  const { alerts, markReviewed } = useMacroAlerts();
  const [open, setOpen] = useState(false);

  if (!alerts.length) return null;

  const top = alerts[0];
  const more = alerts.length - 1;
  const severity = alerts.some((a) => a.severity === 'warning') ? 'warning' : 'info';

  return (
    <div className={`macro-alert-banner ${severity}`}>
      <div className="mab-head">
        <span className="mab-icon">{severity === 'warning' ? '⚠️' : '🔔'}</span>
        <button
          type="button"
          className="mab-summary"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <strong>{top.title}</strong>
          {more > 0 && <span className="mab-more">+{more} more</span>}
          <span className="mab-chevron">{open ? '▴' : '▾'}</span>
        </button>
        <button type="button" className="mab-review" onClick={markReviewed}>
          Mark reviewed
        </button>
      </div>

      {open && (
        <ul className="mab-list">
          {alerts.map((a) => (
            <li key={a.id} className={a.severity}>
              <span className="mab-dot" />
              <div>
                <strong>{a.title}</strong>
                <p>{a.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
