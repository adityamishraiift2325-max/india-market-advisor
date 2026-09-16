import { futureValue } from './sipProjections.js';

// Draws a single good-looking square PNG (WhatsApp-friendly) summarising the
// plan, then shares it via the Web Share API — or silently downloads it on
// desktop where Web Share with files isn't available.

function rupees(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function shortR(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return rupees(n);
}

export async function shareSIPCard(plan, fdRate = 6.8) {
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Accent bar
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(80, 110, 90, 10);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText('MY SIP PLAN', 80, 100);

  // Headline: total target
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 92px system-ui, sans-serif';
  ctx.fillText(shortR(plan.summary.totalInvested), 80, 230);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 34px system-ui, sans-serif';
  ctx.fillText(`invested over ${plan.inputs.months} months`, 80, 285);

  // Stat row
  const stats = [
    ['Monthly', rupees(plan.baseMonthlyAmount)],
    ['Est. XIRR', `${plan.summary.estimatedXIRR}% p.a.`],
    ['SIP date', `${plan.inputs.sipDate}th`],
  ];
  let sx = 80;
  stats.forEach(([k, v]) => {
    ctx.fillStyle = '#64748b';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.fillText(k.toUpperCase(), sx, 400);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 46px system-ui, sans-serif';
    ctx.fillText(v, sx, 455);
    sx += 330;
  });

  // Verdict box (SIP vs FD)
  const monthly = plan.schedule.map((r) => r.totalThisMonth);
  const sipFV = Math.round(futureValue(monthly, plan.summary.estimatedXIRR));
  const fdFV = Math.round(futureValue(monthly, fdRate));
  const gain = sipFV - fdFV;

  ctx.fillStyle = 'rgba(99,102,241,.18)';
  roundRect(ctx, 80, 560, W - 160, 320, 28);
  ctx.fill();

  ctx.fillStyle = '#a5b4fc';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText('PROJECTED VALUE AT MATURITY', 120, 630);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 74px system-ui, sans-serif';
  ctx.fillText(shortR(sipFV), 120, 720);

  ctx.fillStyle = gain >= 0 ? '#4ade80' : '#f87171';
  ctx.font = '700 38px system-ui, sans-serif';
  const verdict = gain >= 0
    ? `▲ ${shortR(Math.abs(gain))} ahead of a bank FD`
    : `▼ ${shortR(Math.abs(gain))} behind a bank FD`;
  ctx.fillText(verdict, 120, 790);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText(`vs FD @ ${fdRate}% on the same contributions`, 120, 840);

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '400 24px system-ui, sans-serif';
  ctx.fillText('India Market Advisor · estimates, not guarantees · not financial advice', 80, 1010);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], 'sip-plan.png', { type: 'image/png' });

  // Try native share (mobile); fall back to download (desktop / on failure).
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My SIP Plan' });
      return 'shared';
    } catch (err) {
      // A real user cancel (AbortError) stops here; any other error falls
      // through to the download so the user is never left empty-handed.
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sip-plan.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
