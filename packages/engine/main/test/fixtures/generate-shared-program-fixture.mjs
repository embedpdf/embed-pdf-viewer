// Deterministic generator for fixtures/kept_font_shared_program.pdf (byte-stable): a form whose
// /AcroForm /DR holds two Type 1 font dictionaries that read one bare CFF program (/FontFile3
// /Type1C) with other widths, 600 and 900, and a text field in each (`narrow`, `wide`). A browser
// draws each with a display program of its own: the same glyphs at that dictionary's advances.
// The font is PDFium's test font from the engine-runtime fork's checkout
// (packages/engine/runtime/runtime-src):
//   - testing/resources/fonts/foxit_fixed.cff (BSD-3-Clause).
// Re-run after editing and commit both files:
//   node packages/engine/main/test/fixtures/generate-shared-program-fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeSource = resolve(here, '../../../runtime/runtime-src');
const outputPath = process.argv[2] ?? resolve(here, 'kept_font_shared_program.pdf');

const cff = readFileSync(resolve(runtimeSource, 'testing/resources/fonts/foxit_fixed.cff'));

const widthsOf = (width) => Array.from({ length: 126 - 32 + 1 }, () => width).join(' ');
const font = (width) =>
  `<< /Type /Font /Subtype /Type1 /BaseFont /FoxitFixed /FirstChar 32 /LastChar 126 ` +
  `/Widths [${widthsOf(width)}] /Encoding /WinAnsiEncoding /FontDescriptor 7 0 R >>`;

const field = (name, fontAlias, bottom) =>
  `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /F 4 /Rect [72 ${bottom} 300 ` +
  `${bottom + 30}] /DA (/${fontAlias} 12 Tf 0 g) /P 3 0 R >>`;

const objects = [
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [8 0 R 9 0 R] /DR << /Font << ' +
    '/FNarrow 5 0 R /FWide 6 0 R >> >> >> >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [8 0 R 9 0 R] >>',
  Buffer.concat([
    Buffer.from(`<< /Subtype /Type1C /Length ${cff.length} >>\nstream\n`, 'latin1'),
    cff,
    Buffer.from('\nendstream', 'latin1'),
  ]),
  font(600),
  font(900),
  '<< /Type /FontDescriptor /FontName /FoxitFixed /Flags 32 /FontBBox [0 -250 1000 900] ' +
    '/ItalicAngle 0 /Ascent 900 /Descent -250 /CapHeight 700 /StemV 80 /FontFile3 4 0 R >>',
  field('narrow', 'FNarrow', 700),
  field('wide', 'FWide', 640),
];

const parts = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
let length = parts[0].length;
const offsets = [];
objects.forEach((body, index) => {
  offsets.push(length);
  const part = Buffer.concat([
    Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
    Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'),
    Buffer.from('\nendobj\n', 'latin1'),
  ]);
  parts.push(part);
  length += part.length;
});
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
parts.push(Buffer.from(xref, 'latin1'));

const pdf = Buffer.concat(parts);
writeFileSync(outputPath, pdf);
console.log(`wrote ${outputPath} (${pdf.length} bytes)`);
