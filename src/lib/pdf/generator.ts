import { jsPDF } from 'jspdf';
import { StructuredDocumentData, TemplateStyle } from '../types';

interface ThemeConfig {
  primary: [number, number, number];
  secondary: [number, number, number];
  accent: [number, number, number];
  text: [number, number, number];
  textLight: [number, number, number];
  bgLight: [number, number, number];
  border: [number, number, number];
}

const THEMES: Record<TemplateStyle, ThemeConfig> = {
  executive: {
    primary: [30, 41, 59], // Slate 800
    secondary: [79, 70, 229], // Indigo 600
    accent: [16, 185, 129], // Emerald 500
    text: [15, 23, 42],
    textLight: [100, 116, 139],
    bgLight: [248, 250, 252],
    border: [226, 232, 240],
  },
  corporate: {
    primary: [15, 30, 60], // Deep Navy
    secondary: [2, 132, 199], // Sky Blue
    accent: [245, 158, 11], // Amber 500
    text: [30, 41, 59],
    textLight: [100, 116, 139],
    bgLight: [241, 245, 249],
    border: [203, 213, 225],
  },
  minimal: {
    primary: [24, 24, 27], // Charcoal
    secondary: [82, 82, 91], // Zinc 600
    accent: [39, 39, 42],
    text: [24, 24, 27],
    textLight: [113, 113, 122],
    bgLight: [250, 250, 250],
    border: [228, 228, 231],
  },
  modern: {
    primary: [17, 24, 39], // Gray 900
    secondary: [139, 92, 246], // Violet 500
    accent: [6, 182, 212], // Cyan 500
    text: [17, 24, 39],
    textLight: [107, 114, 128],
    bgLight: [245, 243, 255],
    border: [221, 214, 254],
  },
};

export function generateDocumentPdf(
  data: StructuredDocumentData,
  style: TemplateStyle = 'executive'
): { dataUri: string; buffer: Uint8Array } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const theme = THEMES[style] || THEMES.executive;
  const pageWidth = doc.internal.pageSize.getWidth(); // ~210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // ~297mm
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  function checkPageBreak(requiredHeight: number) {
    if (cursorY + requiredHeight > pageHeight - 20) {
      doc.addPage();
      cursorY = margin;
      drawHeaderWatermark();
    }
  }

  function drawHeaderWatermark() {
    doc.setFontSize(8);
    doc.setTextColor(...theme.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(`DocAI Studio • ${data.title.slice(0, 40)}`, margin, 10);
    doc.text(`CONFIDENTIAL`, pageWidth - margin - 20, 10);
    doc.setDrawColor(...theme.border);
    doc.setLineWidth(0.2);
    doc.line(margin, 12, pageWidth - margin, 12);
  }

  // --- TOP HERO / HEADER ---
  // Background top bar
  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Top Title Bar Text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title.slice(0, 50), margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 230);
  const subtitleText = data.subtitle || `${data.organization || 'Enterprise Studio'} • ${data.date || new Date().toLocaleDateString()}`;
  doc.text(subtitleText.slice(0, 65), margin, 21);

  // Document Type Badge on top right
  const badgeText = (data.documentType || 'DOCUMENT').toUpperCase();
  const badgeWidth = doc.getTextWidth(badgeText) + 8;
  doc.setFillColor(...theme.secondary);
  doc.roundedRect(pageWidth - margin - badgeWidth, 8, badgeWidth, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(badgeText, pageWidth - margin - badgeWidth + 4, 13.5);

  cursorY = 36;

  // --- METADATA STRIP ---
  doc.setFillColor(...theme.bgLight);
  doc.setDrawColor(...theme.border);
  doc.roundedRect(margin, cursorY, contentWidth, 14, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(...theme.textLight);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTHOR / ENTITY:', margin + 4, cursorY + 5.5);
  doc.text('DATE ISSUED:', margin + 60, cursorY + 5.5);
  doc.text('VERSION:', margin + 110, cursorY + 5.5);
  doc.text('EST. READ TIME:', margin + 145, cursorY + 5.5);

  doc.setTextColor(...theme.text);
  doc.setFont('helvetica', 'normal');
  doc.text((data.author || data.organization || 'DocAI Engine').slice(0, 28), margin + 4, cursorY + 10.5);
  doc.text((data.date || 'Current Date').slice(0, 20), margin + 60, cursorY + 10.5);
  doc.text((data.version || 'v1.0 Final').slice(0, 15), margin + 110, cursorY + 10.5);
  doc.text(`${data.metrics?.estimatedReadTimeMinutes || 2} min read`, margin + 145, cursorY + 10.5);

  cursorY += 19;

  // --- EXECUTIVE SUMMARY BOX ---
  if (data.executiveSummary) {
    checkPageBreak(30);
    doc.setFillColor(theme.bgLight[0], theme.bgLight[1], theme.bgLight[2]);
    doc.setDrawColor(...theme.secondary);
    doc.setLineWidth(0.8);

    const summaryLines = doc.splitTextToSize(data.executiveSummary, contentWidth - 12);
    const boxHeight = summaryLines.length * 4.5 + 14;

    doc.roundedRect(margin, cursorY, contentWidth, boxHeight, 2, 2, 'FD');

    // Accent left stripe
    doc.setFillColor(...theme.secondary);
    doc.rect(margin, cursorY, 3, boxHeight, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...theme.secondary);
    doc.text('EXECUTIVE SUMMARY', margin + 6, cursorY + 6);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.text);
    doc.text(summaryLines, margin + 6, cursorY + 11);

    cursorY += boxHeight + 6;
  }

  // --- KEY TAKEAWAYS (If available) ---
  if (data.keyTakeaways && data.keyTakeaways.length > 0) {
    checkPageBreak(25);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...theme.primary);
    doc.text('Core Takeaways & Strategic Highlights', margin, cursorY);
    cursorY += 5;

    for (const takeaway of data.keyTakeaways) {
      checkPageBreak(10);
      doc.setFillColor(...theme.accent);
      doc.circle(margin + 2, cursorY - 1, 1, 'F');

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...theme.text);
      const lines = doc.splitTextToSize(takeaway, contentWidth - 8);
      doc.text(lines, margin + 6, cursorY);
      cursorY += lines.length * 4 + 2;
    }
    cursorY += 4;
  }

  // --- SECTIONS ---
  if (data.sections && data.sections.length > 0) {
    for (const section of data.sections) {
      checkPageBreak(30);

      // Section Heading
      doc.setFontSize(11.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...theme.primary);
      doc.text(section.heading, margin, cursorY);

      // Underline accent
      doc.setDrawColor(...theme.secondary);
      doc.setLineWidth(0.4);
      doc.line(margin, cursorY + 1.5, margin + 45, cursorY + 1.5);

      cursorY += 6.5;

      // Main Paragraph Content
      if (section.content) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...theme.text);
        const pLines = doc.splitTextToSize(section.content, contentWidth);
        checkPageBreak(pLines.length * 4.2);
        doc.text(pLines, margin, cursorY);
        cursorY += pLines.length * 4.2 + 2;
      }

      // Bullet Points
      if (section.bulletPoints && section.bulletPoints.length > 0) {
        for (const bullet of section.bulletPoints) {
          checkPageBreak(8);
          doc.setFillColor(...theme.secondary);
          doc.rect(margin + 1, cursorY - 1.5, 1.5, 1.5, 'F');

          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...theme.text);
          const bLines = doc.splitTextToSize(bullet, contentWidth - 8);
          doc.text(bLines, margin + 6, cursorY);
          cursorY += bLines.length * 4 + 1.5;
        }
        cursorY += 2;
      }

      // Callout Box
      if (section.callout) {
        checkPageBreak(18);
        const calloutLines = doc.splitTextToSize(section.callout.text, contentWidth - 14);
        const cHeight = calloutLines.length * 4.2 + 10;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(...theme.border);
        doc.roundedRect(margin, cursorY, contentWidth, cHeight, 1.5, 1.5, 'FD');

        doc.setFillColor(...theme.accent);
        doc.rect(margin, cursorY, 2.5, cHeight, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...theme.accent);
        doc.text(section.callout.type.toUpperCase().replace('_', ' '), margin + 5, cursorY + 4.5);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...theme.text);
        doc.text(calloutLines, margin + 5, cursorY + 9);

        cursorY += cHeight + 4;
      }

      cursorY += 3;
    }
  }

  // --- TABLES (If available) ---
  if (data.tables && data.tables.length > 0) {
    for (const table of data.tables) {
      checkPageBreak(35);

      if (table.title) {
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...theme.primary);
        doc.text(table.title, margin, cursorY);
        cursorY += 5;
      }

      const colCount = table.headers.length || 1;
      const colWidth = contentWidth / colCount;
      const rowHeight = 7;

      // Table Header Row
      doc.setFillColor(...theme.primary);
      doc.rect(margin, cursorY, contentWidth, rowHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');

      table.headers.forEach((h, i) => {
        doc.text(h.slice(0, 22), margin + i * colWidth + 2, cursorY + 4.8);
      });
      cursorY += rowHeight;

      // Table Data Rows
      table.rows.forEach((row, rowIndex) => {
        checkPageBreak(rowHeight + 2);
        if (rowIndex % 2 === 1) {
          doc.setFillColor(...theme.bgLight);
          doc.rect(margin, cursorY, contentWidth, rowHeight, 'F');
        }
        doc.setDrawColor(...theme.border);
        doc.setLineWidth(0.15);
        doc.line(margin, cursorY + rowHeight, margin + contentWidth, cursorY + rowHeight);

        doc.setTextColor(...theme.text);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');

        row.forEach((cell, colIndex) => {
          doc.text(cell.slice(0, 24), margin + colIndex * colWidth + 2, cursorY + 4.8);
        });

        cursorY += rowHeight;
      });

      if (table.summary) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...theme.textLight);
        doc.text(`Note: ${table.summary}`, margin, cursorY + 3.5);
        cursorY += 6;
      }

      cursorY += 4;
    }
  }

  // --- FINANCIALS & TOTALS (If invoice) ---
  if (data.financials && data.financials.total !== undefined) {
    checkPageBreak(25);
    const finX = pageWidth - margin - 70;
    doc.setFillColor(...theme.bgLight);
    doc.setDrawColor(...theme.border);
    doc.roundedRect(finX, cursorY, 70, 22, 2, 2, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.textLight);
    doc.text('Subtotal:', finX + 4, cursorY + 5.5);
    doc.text('Tax / Surcharges:', finX + 4, cursorY + 10.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...theme.primary);
    doc.text('TOTAL AMOUNT:', finX + 4, cursorY + 17);

    const curr = data.financials.currency || '$';
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.text);
    doc.text(`${curr}${(data.financials.subtotal || 0).toFixed(2)}`, finX + 66, cursorY + 5.5, { align: 'right' });
    doc.text(`${curr}${(data.financials.tax || 0).toFixed(2)}`, finX + 66, cursorY + 10.5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...theme.secondary);
    doc.setFontSize(10);
    doc.text(`${curr}${(data.financials.total || 0).toFixed(2)}`, finX + 66, cursorY + 17, { align: 'right' });

    cursorY += 26;
  }

  // --- ACTION ITEMS (If available) ---
  if (data.actionItems && data.actionItems.length > 0) {
    checkPageBreak(30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...theme.primary);
    doc.text('Action Items & Implementation Roadmap', margin, cursorY);
    cursorY += 5;

    for (const item of data.actionItems) {
      checkPageBreak(12);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...theme.border);
      doc.roundedRect(margin, cursorY, contentWidth, 10, 1.5, 1.5, 'FD');

      // Checkbox box
      doc.rect(margin + 3, cursorY + 2.5, 3.5, 3.5, 'D');

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...theme.text);
      doc.text(item.task.slice(0, 50), margin + 9, cursorY + 5.2);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...theme.textLight);
      const meta = `Assignee: ${item.assignee || 'Unassigned'} • Due: ${item.dueDate || 'TBD'} • Priority: ${item.priority || 'Normal'}`;
      doc.text(meta, margin + 9, cursorY + 8.5);

      cursorY += 12;
    }
  }

  // --- PAGE NUMBERING ON ALL PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...theme.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated by DocAI Studio Engine • Page ${i} of ${totalPages}`, margin, pageHeight - 8);
    doc.text(new Date().toLocaleTimeString(), pageWidth - margin - 20, pageHeight - 8);
  }

  const dataUri = doc.output('datauristring');
  const buffer = doc.output('arraybuffer');

  return { dataUri, buffer: new Uint8Array(buffer) };
}
