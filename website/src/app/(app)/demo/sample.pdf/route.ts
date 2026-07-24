const encoder = new TextEncoder();

function pdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function text(
  font: 'F1' | 'F2',
  size: number,
  x: number,
  y: number,
  value: string,
  color = '0.028 0.125 0.298',
) {
  return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function stream(contents: string) {
  const length = encoder.encode(contents).length;
  return `<< /Length ${length} >>\nstream\n${contents}\nendstream`;
}

function createSamplePdf() {
  const resources = '<< /Font << /F1 5 0 R /F2 6 0 R >> >>';
  const pageOne = [
    '0.96 0.98 1 rg 0 0 612 792 re f',
    '0.031 0.463 0.992 rg 0 650 612 142 re f',
    '0.592 0.278 1 rg 482 650 130 142 re f',
    text('F2', 14, 54, 742, 'EmbedPDF', '1 1 1'),
    text('F2', 38, 54, 687, 'The modern PDF viewer', '1 1 1'),
    text('F1', 16, 54, 659, 'Open source. Fast to integrate. Yours to customize.', '1 1 1'),
    text('F2', 12, 54, 602, 'A COMPLETE VIEWER, READY FOR YOUR PRODUCT'),
    text('F2', 25, 54, 554, 'Everything your users expect'),
    text('F1', 13, 54, 526, 'A polished document experience with powerful tools built in.'),
    '1 1 1 rg 54 382 236 110 re f',
    '1 1 1 rg 322 382 236 110 re f',
    '1 1 1 rg 54 238 236 110 re f',
    '1 1 1 rg 322 238 236 110 re f',
    text('F2', 16, 74, 457, 'Navigate and zoom'),
    text('F1', 11, 74, 431, 'Smooth page controls and flexible layouts.', '0.29 0.35 0.46'),
    text('F2', 16, 342, 457, 'Search instantly'),
    text('F1', 11, 342, 431, 'Find every match across the document.', '0.29 0.35 0.46'),
    text('F2', 16, 74, 313, 'Annotate together'),
    text('F1', 11, 74, 287, 'Highlight, draw, stamp, and leave notes.', '0.29 0.35 0.46'),
    text('F2', 16, 342, 313, 'Fill and sign'),
    text('F1', 11, 342, 287, 'Complete forms without leaving the viewer.', '0.29 0.35 0.46'),
    text('F2', 20, 54, 162, 'Try the toolbar above'),
    text('F1', 13, 54, 134, 'Every control you see is part of the live EmbedPDF React viewer.'),
    '0.031 0.463 0.992 rg 54 82 118 34 re f',
    text('F2', 11, 75, 94, 'EXPLORE NOW', '1 1 1'),
  ].join('\n');

  const pageTwo = [
    '1 1 1 rg 0 0 612 792 re f',
    '0.028 0.125 0.298 rg 0 700 612 92 re f',
    text('F2', 28, 54, 741, 'Built for real workflows', '1 1 1'),
    text(
      'F1',
      13,
      54,
      716,
      'Useful on day one. Extensible for everything after.',
      '0.80 0.87 0.98',
    ),
    text('F2', 12, 54, 642, 'DOCUMENT REVIEW'),
    text('F2', 24, 54, 602, 'From first draft to final signature'),
    '0.925 0.953 1 rg 54 470 504 92 re f',
    '0.031 0.463 0.992 rg 74 493 44 44 re f',
    text('F2', 18, 90, 508, '1', '1 1 1'),
    text('F2', 15, 138, 520, 'Review the document'),
    text('F1', 11, 138, 496, 'Search, navigate, and inspect every page.', '0.29 0.35 0.46'),
    '0.963 0.941 1 rg 54 350 504 92 re f',
    '0.592 0.278 1 rg 74 373 44 44 re f',
    text('F2', 18, 90, 388, '2', '1 1 1'),
    text('F2', 15, 138, 400, 'Add feedback'),
    text('F1', 11, 138, 376, 'Highlight details and add precise comments.', '0.29 0.35 0.46'),
    '0.925 0.98 0.956 rg 54 230 504 92 re f',
    '0.133 0.773 0.369 rg 74 253 44 44 re f',
    text('F2', 18, 90, 268, '3', '1 1 1'),
    text('F2', 15, 138, 280, 'Approve and share'),
    text('F1', 11, 138, 256, 'Fill, sign, print, or export the finished PDF.', '0.29 0.35 0.46'),
    text('F2', 18, 54, 158, 'One viewer. The whole workflow.'),
    text(
      'F1',
      12,
      54,
      130,
      'Keep users focused with every document tool in one consistent interface.',
    ),
  ].join('\n');

  const pageThree = [
    '0.02 0.04 0.095 rg 0 0 612 792 re f',
    '0.055 0.102 0.212 rg 48 76 516 640 re f',
    '0.031 0.463 0.992 rg 48 676 516 40 re f',
    text('F2', 12, 70, 691, 'DEVELOPER FRIENDLY', '1 1 1'),
    text('F2', 31, 70, 618, 'Ship a viewer in minutes', '1 1 1'),
    text(
      'F1',
      14,
      70,
      585,
      'A complete React integration can stay beautifully small.',
      '0.75 0.82 0.94',
    ),
    '0.027 0.067 0.155 rg 70 350 472 190 re f',
    text('F1', 12, 92, 500, "import { PDFViewer } from '@embedpdf/viewer-react';", '0.49 0.71 1'),
    text('F1', 12, 92, 458, '<PDFViewer', '0.75 0.58 1'),
    text('F1', 12, 112, 430, 'src="/document.pdf"', '0.58 0.89 0.66'),
    text('F1', 12, 112, 402, 'style={{ height: 720 }}', '0.58 0.89 0.66'),
    text('F1', 12, 92, 374, '/>', '0.75 0.58 1'),
    text('F2', 17, 70, 292, 'Your UI. Your data. Your rules.', '1 1 1'),
    text(
      'F1',
      12,
      70,
      264,
      'Self-host the viewer, customize its chrome, and keep full control.',
      '0.75 0.82 0.94',
    ),
    '0.031 0.463 0.992 rg 70 172 160 40 re f',
    text('F2', 11, 94, 187, 'READ THE DOCS', '1 1 1'),
    text('F1', 11, 70, 116, 'embedpdf.com', '0.49 0.71 1'),
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 7 0 R 9 0 R] /Count 3 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents 4 0 R >>`,
    stream(pageOne),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents 8 0 R >>`,
    stream(pageTwo),
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents 10 0 R >>`,
    stream(pageThree),
  ];

  let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}

export function GET() {
  return new Response(createSamplePdf(), {
    headers: {
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Disposition': 'inline; filename="embedpdf-demo.pdf"',
      'Content-Type': 'application/pdf',
    },
  });
}
