import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

export default function AllocationDonut({ allocations = [] }) {
  const active = allocations.filter((a) => a.percentage > 0);

  const data = {
    labels: active.map((a) => a.assetClass),
    datasets: [
      {
        data: active.map((a) => a.percentage),
        backgroundColor: active.map((_, i) => PALETTE[i % PALETTE.length]),
        borderColor: '#0f172a',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${ctx.parsed}%`,
        },
      },
    },
  };

  return (
    <div style={{ height: 320 }}>
      <Doughnut data={data} options={options} />
    </div>
  );
}
