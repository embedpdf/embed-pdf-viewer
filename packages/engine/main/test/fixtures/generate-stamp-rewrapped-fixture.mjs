// Deterministic generator for fixtures/stamp-rewrapped-acrobat.pdf (byte-stable: no dates, no
// randomness): two stamps as EmbedPDF writes them, after Acrobat edited them. Acrobat keeps our
// wrapper as its artwork and puts its own forms around it, as its saves show:
//   A: turned 30 degrees, set to 60% in Acrobat: `/R0 gs /MWFOForm Do` over a transparency
//      group, a plain form, a group and a plain form that only draw our wrapper.
//   B: set to 100% in Acrobat: no /CA, one plain form that only draws our wrapper.
//   C: our 35% layer over our wrapper, with /CA dropped by another tool: the page shows 35%,
//      which the data no longer describes.
// Re-run after editing and commit both files:
//   node packages/engine/main/test/fixtures/generate-stamp-rewrapped-fixture.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2] ?? resolve(here, 'stamp-rewrapped-acrobat.pdf');

const num = (value, digits = 4) => String(Number(value.toFixed(digits)));
const rect = (r) => `[${r.map((v) => num(v)).join(' ')}]`;

// The drawing: 200 x 100, opaque where it paints, fit `contain` into a 300 x 120 box.
const DRAWING = [
  '0.1 0.5 0.2 rg 0 0 200 100 re f',
  '1 1 1 rg 8 8 184 84 re f',
  '0.1 0.5 0.2 rg BT /F1 28 Tf 22 38 Td (REWRAPPED) Tj ET',
].join('\n');
const BOX_W = 300;
const BOX_H = 120;
const WRAPPER_CONTENT = 'q 1.2 0 0 1.2 30 0 cm /EPDFWRAP Do Q';

// Stamp A turns 30 degrees about the origin; the turned box moves back to start there.
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const TURNED_W = BOX_W * COS + BOX_H * SIN;
const TURNED_H = BOX_W * SIN + BOX_H * COS;
const A_MATRIX = [COS, SIN, -SIN, COS, BOX_H * SIN, 0];
const A_UNROTATED = [100, 465, 400, 585];
const A_CENTER = [250, 525];
const A_RECT = [
  A_CENTER[0] - TURNED_W / 2,
  A_CENTER[1] - TURNED_H / 2,
  A_CENTER[0] + TURNED_W / 2,
  A_CENTER[1] + TURNED_H / 2,
];
const B_RECT = [150, 200, 450, 320];
const C_RECT = [150, 40, 450, 160];

const objects = [];
const add = (body) => objects.push(body) && objects.length;
const set = (n, body) => {
  objects[n - 1] = body;
};
const stream = (dict, data) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;
const form = (bbox, extra, resources, data) =>
  stream(`/Type /XObject /Subtype /Form /BBox ${bbox} ${extra}/Resources << ${resources} >>`, data);
const GROUP = '/Group << /S /Transparency >> ';

const catalog = add('');
const pages = add('');
const page = add('');
const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
const content = add(
  stream('', 'BT /F1 12 Tf 72 740 Td (EmbedPDF stamps, as other tools saved them) Tj ET'),
);

function drawing() {
  return add(form('[0 0 200 100]', '', `/Font << /F1 ${font} 0 R >>`, DRAWING));
}

function wrapper(drawingRef, matrix) {
  const matrixEntry = matrix ? `/Matrix [${matrix.map((v) => num(v, 6)).join(' ')}] ` : '';
  return add(
    form(
      `[0 0 ${BOX_W} ${BOX_H}]`,
      `${matrixEntry}${GROUP}/EPDFOrigContentRect [0 0 200 100] `,
      `/XObject << /EPDFWRAP ${drawingRef} 0 R >>`,
      WRAPPER_CONTENT,
    ),
  );
}

// A form that only draws `inner`: what Acrobat puts around its artwork.
function drawOnly(inner, bbox, group) {
  return add(
    form(bbox, group ? GROUP : '', `/ProcSet [/PDF] /XObject << /Form ${inner} 0 R >>`, '/Form Do'),
  );
}

const aBox = `[0 0 ${num(TURNED_W)} ${num(TURNED_H)}]`;
let aForm = wrapper(drawing(), A_MATRIX);
for (const group of [false, true, false, true]) aForm = drawOnly(aForm, aBox, group);
const aLayer = add(
  form(
    aBox,
    '/Matrix [1 0 0 1 0 0] ',
    '/ExtGState << /R0 << /AIS false /CA 0.6 /Type /ExtGState /ca 0.6 >> >> ' +
      `/ProcSet [/PDF] /XObject << /MWFOForm ${aForm} 0 R >>`,
    '/R0 gs\n/MWFOForm Do\n',
  ),
);
const aAnnot = add(
  `<< /Type /Annot /Subtype /Stamp /Rect ${rect(A_RECT)} /CA 0.6 /F 4 /Name /EPDFRewrapped ` +
    `/NM (rewrapped-a) /T (EmbedPDF test) /P ${page} 0 R /AP << /N ${aLayer} 0 R >> ` +
    `/EMBD_Metadata << /AppearanceFit (contain) /Rotation 30 /SchemaVersion 1 ` +
    `/UnrotatedRect ${rect(A_UNROTATED)} >> >>`,
);

const bForm = drawOnly(wrapper(drawing(), null), `[0 0 ${BOX_W} ${BOX_H}]`, false);
const bAnnot = add(
  `<< /Type /Annot /Subtype /Stamp /Rect ${rect(B_RECT)} /F 4 /Name /EPDFRewrapped ` +
    `/NM (rewrapped-b) /T (EmbedPDF test) /P ${page} 0 R /AP << /N ${bForm} 0 R >> ` +
    `/EMBD_Metadata << /AppearanceFit (contain) /SchemaVersion 1 >> >>`,
);

const cWrapper = wrapper(drawing(), null);
const cLayer = add(
  form(
    `[0 0 ${BOX_W} ${BOX_H}]`,
    '',
    '/ExtGState << /R0 << /AIS false /CA 0.35 /Type /ExtGState /ca 0.35 >> >> ' +
      `/XObject << /MWFOForm ${cWrapper} 0 R >>`,
    '/R0 gs\n/MWFOForm Do\n',
  ),
);
const cAnnot = add(
  `<< /Type /Annot /Subtype /Stamp /Rect ${rect(C_RECT)} /F 4 /Name /EPDFRewrapped ` +
    `/NM (rewrapped-c) /T (EmbedPDF test) /P ${page} 0 R /AP << /N ${cLayer} 0 R >> ` +
    `/EMBD_Metadata << /AppearanceFit (contain) /SchemaVersion 1 >> >>`,
);

set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
set(
  page,
  `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R ` +
    `/Resources << /Font << /F1 ${font} 0 R >> >> /Annots [${aAnnot} 0 R ${bAnnot} 0 R ${cAnnot} 0 R] >>`,
);

let pdf = '%PDF-1.7\n';
const offsets = objects.map((body, index) => {
  const offset = pdf.length;
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  return offset;
});
const xref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

writeFileSync(outputPath, pdf, 'latin1');
console.log(`wrote ${outputPath}`);
