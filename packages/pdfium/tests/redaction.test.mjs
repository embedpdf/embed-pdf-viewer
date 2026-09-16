import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import createPdfium from '../src/vendor/pdfium.js';

// An override allows the same regression to be checked against the previous WASM.
const wasmBinary = await readFile(
  process.env.PDFIUM_TEST_WASM ?? new URL('../src/vendor/pdfium.wasm', import.meta.url),
);
const pdfium = await createPdfium({ wasmBinary });
pdfium._PDFiumExt_Init();

const vertical = await readFile(new URL('./fixtures/vertical_text.pdf', import.meta.url));
after(() => pdfium._FPDF_DestroyLibrary());

function makePdf(operator, matrix = '1 0 0 1 20 50') {
  const stream = `BT /F1 12 Tf ${matrix} Tm ${operator} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let data = '%PDF-1.7\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(data.length);
    data += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = data.length;
  data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  data += offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('');
  data += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
}

function withPage(bytes, callback) {
  const ptr = pdfium._malloc(bytes.length);
  pdfium.HEAPU8.set(bytes, ptr);
  const doc = pdfium._FPDF_LoadMemDocument(ptr, bytes.length, 0);
  assert.ok(doc, 'load PDF');
  const page = pdfium._FPDF_LoadPage(doc, 0);
  try {
    assert.ok(page, 'load page');
    return callback(doc, page);
  } finally {
    if (page) pdfium._FPDF_ClosePage(page);
    pdfium._FPDF_CloseDocument(doc);
    pdfium._free(ptr);
  }
}

function readText(page) {
  const textPage = pdfium._FPDFText_LoadPage(page);
  const buffer = pdfium._malloc(32);
  try {
    const chars = [];
    const boxes = [];
    for (let i = 0; i < pdfium._FPDFText_CountChars(textPage); i++) {
      chars.push(String.fromCodePoint(pdfium._FPDFText_GetUnicode(textPage, i)));
      assert.ok(
        pdfium._FPDFText_GetCharBox(textPage, i, buffer, buffer + 8, buffer + 16, buffer + 24),
      );
      boxes.push(Array.from(pdfium.HEAPF64.subarray(buffer / 8, buffer / 8 + 4)));
    }
    return { text: chars.join(''), boxes };
  } finally {
    pdfium._free(buffer);
    pdfium._FPDFText_ClosePage(textPage);
  }
}

function quadForTerm(snapshot, term) {
  const start = snapshot.text.indexOf(term);
  assert.ok(start >= 0, `find ${term} before redaction`);
  const boxes = snapshot.boxes.slice(start, start + term.length);
  const left = Math.min(...boxes.map((box) => box[0]));
  const right = Math.max(...boxes.map((box) => box[1]));
  const bottom = Math.min(...boxes.map((box) => box[2]));
  const top = Math.max(...boxes.map((box) => box[3]));
  return [left, top, right, top, left, bottom, right, bottom];
}

function save(doc) {
  const writer = pdfium._PDFiumExt_OpenFileWriter();
  let ptr = 0;
  try {
    assert.ok(pdfium._PDFiumExt_SaveAsCopy(doc, writer));
    const length = pdfium._PDFiumExt_GetFileWriterSize(writer);
    ptr = pdfium._malloc(length);
    assert.equal(pdfium._PDFiumExt_GetFileWriterData(writer, ptr, length), length);
    return pdfium.HEAPU8.slice(ptr, ptr + length);
  } finally {
    pdfium._free(ptr);
    pdfium._PDFiumExt_CloseFileWriter(writer);
  }
}

function assertPositions(before, after, term) {
  const oldStart = before.text.indexOf(term);
  const newStart = after.text.indexOf(term);
  assert.ok(oldStart >= 0 && newStart >= 0, `preserve ${term}: ${after.text}`);
  for (let i = 0; i < term.length; i++) {
    for (let axis = 0; axis < 4; axis++) {
      assert.ok(
        Math.abs(before.boxes[oldStart + i][axis] - after.boxes[newStart + i][axis]) < 0.05,
        `preserve position of ${term}[${i}], axis ${axis}`,
      );
    }
  }
}

function checkRedaction(bytes, targets, kept, { blackBoxes = false, noHit = false } = {}) {
  let before;
  const saved = withPage(bytes, (doc, page) => {
    before = readText(page);
    const quads = noHit
      ? [[350, 390, 390, 390, 350, 350, 390, 350]]
      : targets.map((term) => quadForTerm(before, term));
    const ptr = pdfium._malloc(quads.length * 32);
    try {
      pdfium.HEAPF32.set(quads.flat(), ptr / 4);
      assert.equal(
        !!pdfium._EPDFText_RedactInQuads(page, ptr, quads.length, 1, blackBoxes ? 1 : 0),
        !noHit,
      );
      assert.ok(pdfium._FPDFPage_GenerateContent(page));
      return save(doc);
    } finally {
      pdfium._free(ptr);
    }
  });
  withPage(saved, (_doc, page) => {
    const after = readText(page);
    const expected = targets.reduce((text, target) => text.replace(target, ''), before.text);
    assert.equal(
      after.text.replace(/\s/g, ''),
      expected.replace(/\s/g, ''),
      'keep only untargeted text',
    );
    for (const target of targets) {
      assert.ok(!after.text.includes(target), `remove ${target}: ${after.text}`);
    }
    for (const term of kept) assertPositions(before, after, term);
    if (noHit) assert.equal(after.text, before.text);
    if (blackBoxes) {
      const count = pdfium._FPDFPage_CountObjects(page);
      let paths = 0;
      for (let i = 0; i < count; i++) {
        if (pdfium._FPDFPageObj_GetType(pdfium._FPDFPage_GetObject(page, i)) === 2) paths++;
      }
      assert.equal(paths, targets.length, 'preserve black overlays');
    }
  });
}

for (const [name, operator] of [
  ['Tj', '(SECRET1 keep this SECRET2 tail) Tj'],
  ['TJ', '[(SECRET1) -150 ( keep this ) 35 (SECRET2 tail)] TJ'],
]) {
  for (const [rotation, matrix] of [
    [0, '1 0 0 1 20 50'],
    [90, '0 1 -1 0 100 20'],
    [180, '-1 0 0 -1 350 100'],
    [270, '0 -1 1 0 100 350'],
  ]) {
    test(`${name}: multiple regions at ${rotation} degrees survive save/reload`, () => {
      checkRedaction(makePdf(operator, matrix), ['SECRET1', 'SECRET2'], ['keep this', 'tail']);
    });
  }
}

test('region order and black overlays do not affect removal', () => {
  checkRedaction(
    makePdf('(SECRET1 keep this SECRET2 tail) Tj'),
    ['SECRET2', 'SECRET1'],
    ['keep this', 'tail'],
    { blackBoxes: true },
  );
});

test('a single leading region preserves remaining text', () => {
  checkRedaction(
    makePdf('(SECRET1 keep this SECRET2 tail) Tj'),
    ['SECRET1'],
    ['keep this', 'SECRET2 tail'],
  );
});

test('a single interior region preserves both neighbors', () => {
  checkRedaction(makePdf('(prefix SECRET1 tail) Tj'), ['SECRET1'], ['prefix', 'tail']);
});

test('a region covering all text removes the complete object', () => {
  checkRedaction(makePdf('(SECRET1) Tj'), ['SECRET1'], []);
});

test('vertical text: leading removal preserves remaining glyph positions', () => {
  checkRedaction(vertical, ['H'], ['ello', 'World']);
});
test('vertical text: interior removal preserves the tail', () => {
  checkRedaction(vertical, ['ll'], ['He', 'o', 'World']);
});
test('a region outside vertical text leaves it unchanged', () => {
  checkRedaction(vertical, [], ['Hello', 'World'], { noHit: true });
});
