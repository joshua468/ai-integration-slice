import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import { inflateSync } from 'zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// PDF text extraction (minimal parser for simple PDFs)
// ---------------------------------------------------------------------------
function decodePdfString(s: string): string {
  return s
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\(.)/g, '$1');
}

function extractPdfText(buffer: Buffer): string {
  const src = buffer.toString('latin1');
  const out: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\n?endstream/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(src)) !== null) {
    let data: Buffer;
    try {
      data = inflateSync(Buffer.from(m[1], 'latin1'));
    } catch {
      data = Buffer.from(m[1], 'latin1');
    }

    const content = data.toString('latin1');
    // Captures strings shown via Tj or as TJ arrays, and text-move markers.
    const tokenRe =
      /\(((?:[^()\\]|\\.)*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ|T\*|(-?[\d.]+) (-?[\d.]+) [Td-]/g;
    let t: RegExpExecArray | null;

    while ((t = tokenRe.exec(content)) !== null) {
      if (t[1] !== undefined) {
        out.push(decodePdfString(t[1]));
      } else if (t[2] !== undefined) {
        const strs = [
          ...t[2].matchAll(/\(((?:[^()\\]|\\.)*)\)/g),
        ].map((x) => decodePdfString(x[1]));
        out.push(strs.join(' '));
      } else {
        out.push('\n');
      }
    }
  }

  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// PDF generation (text -> PDF via jsPDF)
// ---------------------------------------------------------------------------
function buildPdfFromText(text: string): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  for (const line of text.split(/\r?\n/)) {
    const wrapped = doc.splitTextToSize(line.trim() || ' ', contentWidth);
    for (const piece of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(piece, margin, y);
      y += 14;
    }
    y += 6;
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// ---------------------------------------------------------------------------
// DOCX generation (text -> minimal valid .docx)
// ---------------------------------------------------------------------------
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const size = entry.data.length;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(0, 8); // store (no compression)
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, entry.data);

    const centralHead = Buffer.alloc(46);
    centralHead.writeUInt32LE(0x02014b50, 0);
    centralHead.writeUInt16LE(20, 4);
    centralHead.writeUInt16LE(20, 6);
    centralHead.writeUInt16LE(0x0800, 8);
    centralHead.writeUInt16LE(0, 10);
    centralHead.writeUInt16LE(0, 12);
    centralHead.writeUInt16LE(0, 14);
    centralHead.writeUInt32LE(crc, 16);
    centralHead.writeUInt32LE(size, 20);
    centralHead.writeUInt32LE(size, 24);
    centralHead.writeUInt16LE(nameBuf.length, 28);
    centralHead.writeUInt16LE(0, 30);
    centralHead.writeUInt16LE(0, 32);
    centralHead.writeUInt16LE(0, 34);
    centralHead.writeUInt16LE(0, 36);
    centralHead.writeUInt32LE(0, 38);
    centralHead.writeUInt32LE(offset, 42);

    central.push(centralHead, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralSize = central.reduce((acc, b) => acc + b.length, 0);
  const centralOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...central, eocd]);
}

function buildDocx(text: string): Buffer {
  const wrapped = text.split(/\r?\n/);
  const paragraphs = wrapped
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    )
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
  ]);
}

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const mode = String(formData.get('mode') || 'to-pdf');

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const name = file.name.replace(/[^\w.\- ]|[\s]+/g, ' ').trim();
    const base = name.replace(/\.[^.]*$/, '') || 'document';
    const ext = extOf(file.name);

    if (mode === 'to-pdf') {
      if (ext === 'pdf') {
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${name}"`,
          },
        });
      }

      let text: string;
      if (ext === 'docx' || file.type === DOCX_MIME) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (ext === 'txt' || ext === 'md' || file.type.startsWith('text/')) {
        text = buffer.toString('utf-8');
      } else {
        return NextResponse.json(
          { error: 'For Word to PDF, please upload a .docx, .txt or .md file.' },
          { status: 400 }
        );
      }

      if (!text.trim()) {
        return NextResponse.json(
          { error: 'Could not read any text from this document.' },
          { status: 422 }
        );
      }

      const pdf = buildPdfFromText(text);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${base}.pdf"`,
        },
      });
    }

    if (mode === 'to-word') {
      if (ext !== 'pdf') {
        return NextResponse.json(
          { error: 'For PDF to Word, please upload a .pdf file.' },
          { status: 400 }
        );
      }

      const text = extractPdfText(buffer);
      if (!text) {
        return NextResponse.json(
          { error: 'Could not extract readable text from this PDF.' },
          { status: 422 }
        );
      }

      const docx = buildDocx(text);
      return new NextResponse(new Uint8Array(docx), {
        status: 200,
        headers: {
          'Content-Type': DOCX_MIME,
          'Content-Disposition': `attachment; filename="${base}.docx"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
  } catch (error: any) {
    console.error('Convert error:', error);
    return NextResponse.json(
      { error: error?.message || 'Conversion failed' },
      { status: 500 }
    );
  }
}