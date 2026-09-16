import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// jsPDF's built-in fonts don't carry the ₹ glyph, so use "Rs" in the PDF.
function rs(n) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function exportPDF(plan) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const accent = [99, 102, 241];

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('SIP Investment Plan', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated ${new Date().toLocaleDateString('en-IN')} · India Market Advisor`, 40, 52);

  // Summary line
  const s = plan.summary;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const metaY = 96;
  const metas = [
    ['Target', rs(s.totalInvested)],
    ['Horizon', `${plan.inputs.months} months`],
    ['Base monthly', rs(plan.baseMonthlyAmount)],
    ['Est. XIRR', `${s.estimatedXIRR}% p.a.`],
  ];
  const colW = (pageW - 80) / metas.length;
  metas.forEach(([k, v], i) => {
    const x = 40 + i * colW;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(k.toUpperCase(), x, metaY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(13);
    doc.text(v, x, metaY + 16);
  });

  if (s.strategyNote) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const wrapped = doc.splitTextToSize(s.strategyNote, pageW - 80);
    doc.text(wrapped, 40, metaY + 40);
  }

  // Allocation table (asset class + specific instruments)
  const assets = plan.assets || [];
  const allocBody = assets
    .filter((a) => (s.assetClassTotals[a.key] || 0) > 0)
    .map((a) => {
      const total = s.assetClassTotals[a.key] || 0;
      const pct = ((total / s.totalInvested) * 100).toFixed(1) + '%';
      const funds = (s.instruments?.[a.key] || [])
        .map((f) => `${f.name}${f.ticker ? ` (${f.ticker})` : ''} — ${rs(f.amount)}`)
        .join('\n');
      return [a.label, rs(total), pct, funds || '—'];
    });

  autoTable(doc, {
    startY: metaY + 64,
    head: [['Asset class', 'Total', 'Share', 'Where it goes (funds / stocks)']],
    body: allocBody,
    theme: 'striped',
    headStyles: { fillColor: accent, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 5, valign: 'top' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95 }, 1: { cellWidth: 70 }, 2: { cellWidth: 45 } },
    margin: { left: 40, right: 40 },
  });

  // Monthly schedule table
  const schedBody = plan.schedule.map((r, i) => [
    `${i + 1}. ${r.label}`,
    r.isPaused ? '—' : r.date,
    r.isPaused ? 'Paused' : rs(r.totalThisMonth),
    rs(r.runningTotal),
    r.festivalNote ? r.festivalNote.split(' (')[0] + ' (gold/silver up)' : '',
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 24,
    head: [['Month', 'Date', 'Amount', 'Running total', 'Note']],
    body: schedBody,
    theme: 'grid',
    headStyles: { fillColor: accent, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 4 },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      if (data.section === 'body' && plan.schedule[data.row.index]?.isPaused) {
        data.cell.styles.textColor = [148, 163, 184];
      }
    },
  });

  // Footer disclaimer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Festival tilts and XIRR are illustrative estimates, not guarantees. Educational use only, not financial advice.',
    40,
    doc.internal.pageSize.getHeight() - 24,
    { maxWidth: pageW - 80 }
  );

  doc.save('sip-plan.pdf');
}
