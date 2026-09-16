// Build a .ics calendar file from a SIP plan — one all-day reminder per active
// month on the SIP date, with festival months flagged. Generated client-side
// (the plan is already in memory), no backend round-trip.

function esc(s) {
  return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

function ymd(dateStr) {
  return dateStr.replace(/-/g, ''); // 'YYYY-MM-DD' -> 'YYYYMMDD'
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function rupees(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function downloadICS(plan) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const total = plan.inputs.months;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//India Market Advisor//SIP Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  plan.schedule.forEach((r, i) => {
    if (r.isPaused) return;
    const summary = `SIP: invest ${rupees(r.totalThisMonth)} (month ${i + 1} of ${total})`;
    let desc = `Your monthly SIP contribution. Running total after this: ${rupees(r.runningTotal)}.`;
    if (r.festivalNote) desc = `Festival month — gold/silver tilt is higher. ${r.festivalNote} ${desc}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:sip-${i}-${ymd(r.date)}@india-market-advisor`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(r.date)}`,
      `DTEND;VALUE=DATE:${nextDay(r.date)}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT9H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(summary)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sip-plan.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
