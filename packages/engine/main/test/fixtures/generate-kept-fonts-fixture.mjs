// Deterministic generator for fixtures/kept_fonts_form.pdf (byte-stable: no dates, no
// randomness): a form whose text fields write with fonts a browser can't load as they are,
// a bare CFF font (/FontFile3 /Type1C) and a Type 1 font (/FontFile), both in /AcroForm /DR.
// Filling a field keeps its font, so the engine writes in it and serves a display program for
// it. The fonts come from the engine-runtime fork's checkout (packages/engine/runtime/runtime-src):
//   - testing/resources/fonts/foxit_fixed.cff: PDFium's test font (BSD-3-Clause);
//   - third_party/skia/resources/fonts/Roboto2-Regular.pfb: Skia's test cut of Roboto
//     (Apache-2.0), which has only the glyphs of "HELLO WORLD" and some punctuation, no space.
// Re-run after editing and commit both files:
//   node packages/engine/main/test/fixtures/generate-kept-fonts-fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeSource = resolve(here, '../../../runtime/runtime-src');
const outputPath = process.argv[2] ?? resolve(here, 'kept_fonts_form.pdf');

const cff = readFileSync(resolve(runtimeSource, 'testing/resources/fonts/foxit_fixed.cff'));
const type1 = readFileSync(
  resolve(runtimeSource, 'third_party/skia/resources/fonts/Roboto2-Regular.pfb'),
);

const objects = [];
function addObject(body) {
  objects.push(body);
  return objects.length; // 1-based object number
}
const stream = (dict, bytes) =>
  Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${bytes.length} >>\nstream\n`, 'latin1'),
    bytes,
    Buffer.from('\nendstream', 'latin1'),
  ]);

const catalogNumber = 1;
const pagesNumber = 2;
const pageNumber = 3;
objects.push(null, null, null); // catalog, pages and page, written last

function fieldFont(baseFont, fileKey, file, fileSubtype) {
  const fileNumber = addObject(stream(fileSubtype ? `/Subtype /${fileSubtype}` : '', file));
  const descriptorNumber = addObject(
    `<< /Type /FontDescriptor /FontName /${baseFont} /Flags 32 /FontBBox [0 -250 1000 900] ` +
      `/ItalicAngle 0 /Ascent 900 /Descent -250 /CapHeight 700 /StemV 80 ` +
      `/${fileKey} ${fileNumber} 0 R >>`,
  );
  return addObject(
    `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding ` +
      `/FontDescriptor ${descriptorNumber} 0 R >>`,
  );
}

const cffFont = fieldFont('FoxitFixed', 'FontFile3', cff, 'Type1C');
const type1Font = fieldFont('Roboto2-Regular', 'FontFile', type1, null);

function textField(name, rect, da, value) {
  return addObject(
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /P ${pageNumber} 0 R ` +
      `/Rect [${rect.join(' ')}] /F 4 /DA (${da}) /V (${value}) /MK << /BC [0 0 0] >> >>`,
  );
}

const fields = [
  textField('fixed', [72, 680, 400, 710], '/FCff 14 Tf 0 g', 'Fixed 123'),
  textField('hello', [72, 620, 400, 660], '/FT1 24 Tf 0 g', 'HELLO,WORLD!'),
];

objects[catalogNumber - 1] =
  `<< /Type /Catalog /Pages ${pagesNumber} 0 R /AcroForm << /Fields [${fields
    .map((n) => `${n} 0 R`)
    .join(' ')}] /NeedAppearances true /DR << /Font << /FCff ${cffFont} 0 R ` +
  `/FT1 ${type1Font} 0 R >> >> >> >>`;
objects[pagesNumber - 1] = `<< /Type /Pages /Kids [${pageNumber} 0 R] /Count 1 >>`;
objects[pageNumber - 1] =
  `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 612 792] ` +
  `/Annots [${fields.map((n) => `${n} 0 R`).join(' ')}] >>`;

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
xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNumber} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
parts.push(Buffer.from(xref, 'latin1'));

const pdf = Buffer.concat(parts);
writeFileSync(outputPath, pdf);
console.log(`wrote ${outputPath} (${pdf.length} bytes)`);
