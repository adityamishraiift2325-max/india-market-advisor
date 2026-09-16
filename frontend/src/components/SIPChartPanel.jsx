import { Chart } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from 'chart.js';

ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#a855f7',
];

function fmtShort(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${n}`;
}

// One chart: stacked monthly contributions (by asset class) + cumulative line
// against the flat target — kept to a single visual so the user isn't
// juggling two separate charts to understand the same plan.
export default function SIPChartPanel({ plan }) {
  const assets = (plan.assets || []).filter((a) => (plan.summary.assetClassTotals[a.key] || 0) > 0);
  const labels = plan.schedule.map((r) => {
    const short = r.label.split(' ')[0];
    const star = r.festivalNote ? ' ★' : '';
    return short + star;
  });

  const barDatasets = assets.map((a, i) => ({
    type: 'bar',
    label: a.label,
    data: plan.schedule.map((r) => (r.isPaused ? 0 : r.allocations[a.key] || 0)),
    backgroundColor: PALETTE[i % PALETTE.length],
    stack: 'sip',
    borderRadius: 3,
    borderSkipped: false,
  }));

  const target = plan.summary.totalInvested;
  const lineDataset = {
    type: 'line',
    label: 'Cumulative invested',
    data: plan.schedule.map((r) => r.runningTotal),
    borderColor: '#f8fafc',
    backgroundColor: 'rgba(248,250,252,.08)',
    borderWidth: 2,
    pointRadius: 0,
    fill: false,
    yAxisID: 'y1',
    tension: 0.25,
    order: -1,
  };

  const data = { labels, datasets: [...barDatasets, lineDataset] };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items[0]?.dataIndex;
            const row = plan.schedule[idx];
            return row?.isPaused ? `${row.label} — paused` : row?.label;
          },
          label: (ctx) => {
            if (ctx.dataset.label === 'Cumulative invested') {
              return `Total so far: ${fmtShort(ctx.parsed.y)}`;
            }
            if (!ctx.parsed.y) return null;
            return `${ctx.dataset.label}: ${fmtShort(ctx.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0 },
        grid: { display: false },
      },
      y: {
        stacked: true,
        ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => fmtShort(v) },
        grid: { color: 'rgba(148,163,184,.08)' },
      },
      y1: {
        position: 'right',
        min: 0,
        max: target * 1.05,
        ticks: { display: false },
        grid: { display: false },
      },
    },
  };

  return (
    <div>
      <div className="chart-legend-row">
        {assets.map((a, i) => (
          <span key={a.key} className="legend-chip">
            <span className="legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
            {a.label}
          </span>
        ))}
      </div>
      <p className="muted small" style={{ margin: '2px 0 12px' }}>
        Bars = monthly split by asset class (★ = festival month). White line = total invested so far.
      </p>
      <div style={{ height: 320 }}>
        <Chart type="bar" data={data} options={options} />
      </div>
    </div>
  );
}
