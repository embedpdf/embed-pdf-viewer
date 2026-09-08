// Deterministic generator for fixtures/letter_spaced_text.pdf (byte-stable: no dates, no
// randomness). Exercises the ignoreWhitespace search flag: letter-spaced words, a tracked-out
// heading (character spacing), a glued "totalamount", a line-wrapped "in / voice", and a
// mixed-case "I n v o i c e" for matchCase. Re-run after editing and commit both files:
//   node packages/engine/main/test/fixtures/generate-letter-spaced-fixture.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2] ?? resolve(here, 'letter_spaced_text.pdf');

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** One text line: { text, size?, x?, charSpacing?, bold? } */
function buildContentStream(lines) {
  const operations = [];
  let y = PAGE_HEIGHT - 80;
  for (const line of lines) {
    const size = line.size ?? 12;
    const font = line.bold ? '/F2' : '/F1';
    const x = line.x ?? 60;
    const charSpacing = line.charSpacing ?? 0;
    y -= line.gapBefore ?? 0;
    operations.push(
      'BT',
      `${font} ${size} Tf`,
      `${charSpacing} Tc`,
      `1 0 0 1 ${x} ${y} Tm`,
      `(${escapePdfText(line.text)}) Tj`,
      'ET',
    );
    y -= size * 1.8;
  }
  return operations.join('\n');
}

const PAGE_1 = [
  { text: 'INVOICE', size: 22, bold: true, charSpacing: 6 },
  { text: 'Whitespace-insensitive search sample', size: 10, gapBefore: 6 },
  { text: 'Ref: i n v o i c e 42', gapBefore: 18 },
  { text: 'Letter-spaced heading: I N V O I C E', bold: true },
  { text: 'Mixed case for matchCase: I n v o i c e' },
  { text: 'Plain for comparison: Invoice 42' },
  { text: 'Glued words: totalamount due 1,250.00', gapBefore: 18 },
  { text: 'Spaced words: total amount due 1,250.00' },
  { text: 'Wrapped across lines, first half ends in', gapBefore: 18 },
  { text: 'voice and continues here.' },
  { text: 'Whole-word trap: the invoices were sent.', gapBefore: 18 },
];

const PAGE_2 = [
  { text: 'Page two', size: 16, bold: true },
  { text: 'Second occurrence: i n v o i c e 43', gapBefore: 18 },
  { text: 'Tabular gaps:   total      amount      99.00' },
  { text: 'Nothing to find here: shipping and handling.', gapBefore: 18 },
];

const objects = [];
function addObject(body) {
  objects.push(body);
  return objects.length; // 1-based object number
}

const catalogNumber = 1;
const pagesNumber = 2;
objects.push(null, null); // placeholders for catalog and pages

const helveticaNumber = addObject(
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
);
const helveticaBoldNumber = addObject(
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
);

const pageNumbers = [PAGE_1, PAGE_2].map((lines) => {
  const content = buildContentStream(lines);
  const contentNumber = addObject(
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  );
  return addObject(
    `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${helveticaNumber} 0 R /F2 ${helveticaBoldNumber} 0 R >> >> ` +
      `/Contents ${contentNumber} 0 R >>`,
  );
});

objects[catalogNumber - 1] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`;
objects[pagesNumber - 1] =
  `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNumbers.length} >>`;

let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
const offsets = [];
objects.forEach((body, index) => {
  offsets.push(Buffer.byteLength(pdf, 'latin1'));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

writeFileSync(outputPath, Buffer.from(pdf, 'latin1'));
console.log(
  `wrote ${outputPath} (${Buffer.byteLength(pdf, 'latin1')} bytes, ${pageNumbers.length} pages)`,
);
