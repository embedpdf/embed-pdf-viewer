/**
 * `download({ mode: 'incremental', mergeLastUpdate: true })` folds the save
 * into the file's last update section: one section after any number of
 * saves, the bytes before it unchanged, every object of the old section that
 * is still in use carried over (newer wins). Anything it cannot prove — no
 * update yet, a signed last section, a broken chain — is a plain append.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Engine } from '@embedpdf/engine-core/runtime';
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';
import { mergeIntoLastUpdate } from '../../services/src/features/save/internal/mergeLastUpdate';
import { createLocalEngine } from '../src/index';
import { append, bytesOf, latin1, pdf } from './helpers/miniPdf';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFile(resolve(here, 'fixtures', name));

const BASE = {
  1: '<< /Type /Catalog /Pages 2 0 R >>',
  2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
};

const count = (bytes: Uint8Array, word: string) => latin1(bytes).split(word).length - 1;
const startxrefs = (bytes: Uint8Array) =>
  [...latin1(bytes).matchAll(/startxref\s+(\d+)/g)].map((m) => Number(m[1]));
const sameStart = (a: Uint8Array, b: Uint8Array, n: number) =>
  Buffer.compare(a.subarray(0, n), b.subarray(0, n)) === 0;

/** Where the revision of `bytes` that ends with its first %%EOF ends (the base revision). */
const baseEnd = (bytes: Uint8Array) => latin1(bytes).indexOf('%%EOF') + 6;

/** Append an update whose objects sit in an object stream and whose xref is a Flate/PNG-predicted xref stream. */
function appendXrefStream(
  base: Uint8Array,
  loose: Record<number, string>,
  packed: Record<number, string>,
  stmNum: number,
  xrefNum: number,
  trailerExtra: string,
  hybrid: 'none' | 'inner' = 'none',
): Uint8Array {
  let text = latin1(base);
  const prev = startxrefs(base).at(-1)!;
  const rows: [number, number, number, number][] = [];
  for (const [n, body] of Object.entries(loose)) {
    rows.push([Number(n), 1, text.length, 0]);
    text += `${n} 0 obj\n${body}\nendobj\n`;
  }
  let header = '';
  let data = '';
  Object.entries(packed).forEach(([n, body], i) => {
    header += `${n} ${data.length} `;
    data += body + '\n';
    rows.push([Number(n), 2, stmNum, i]);
  });
  const objstm = header + data;
  rows.push([stmNum, 1, text.length, 0]);
  text += `${stmNum} 0 obj\n<< /Type /ObjStm /N ${Object.keys(packed).length} /First ${header.length} /Length ${objstm.length} >>\nstream\n${objstm}\nendstream\nendobj\n`;
  const xrefAt = text.length;
  rows.push([xrefNum, 1, xrefAt, 0]);
  rows.sort((a, b) => a[0] - b[0]);
  const size = Math.max(...rows.map((r) => r[0])) + 1;
  // PNG Up predictor, 1+4+2 columns.
  const raw: number[] = [];
  let prevRow = [0, 0, 0, 0, 0, 0, 0];
  const index: number[] = [];
  for (const [n, t, f2, f3] of rows) {
    if (index.length && index[index.length - 2] + index[index.length - 1] === n)
      index[index.length - 1]++;
    else index.push(n, 1);
    const row = [
      t,
      (f2 >>> 24) & 255,
      (f2 >>> 16) & 255,
      (f2 >>> 8) & 255,
      f2 & 255,
      (f3 >>> 8) & 255,
      f3 & 255,
    ];
    raw.push(2, ...row.map((v, i) => (v - prevRow[i] + 256) & 255));
    prevRow = row;
  }
  const z = latin1(deflateSync(Buffer.from(raw)));
  if (hybrid === 'inner') {
    // A classic table for the loose objects plus /XRefStm for the packed ones.
    const stmAt = xrefAt;
    text += `${xrefNum} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Index [${index.join(' ')}] /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${z.length} >>\nstream\n${z}\nendstream\nendobj\n`;
    const tableAt = text.length;
    const looseRows = rows.filter((r) => r[1] === 1 && r[0] !== xrefNum);
    text += 'xref\n';
    for (const [n, , off] of looseRows)
      text += `${n} 1\n${String(off).padStart(10, '0')} 00000 n \n`;
    text += `trailer\n<< /Root 1 0 R /Size ${size} /Prev ${prev} /XRefStm ${stmAt} ${trailerExtra} >>\nstartxref\n${tableAt}\n%%EOF\n`;
    return bytesOf(text);
  }
  text += `${xrefNum} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Index [${index.join(' ')}] /Root 1 0 R /Prev ${prev} ${trailerExtra} /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${z.length} >>\nstream\n${z}\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`;
  return bytesOf(text);
}

describe('mergeIntoLastUpdate', () => {
  let runtime: PdfRuntimeModule;
  beforeAll(async () => {
    runtime = await createPdfRuntime({ prefer: 'wasm' });
  });

  /** PDFium opens it and reads `/Title` from the Info dictionary. */
  function title(bytes: Uint8Array): string {
    const { fn, mem } = runtime;
    const buffer = mem.alloc(bytes.length);
    mem.writeBytes(buffer, bytes);
    const doc = fn.FPDF_LoadMemDocument64(buffer, bytes.length, '');
    try {
      expect(doc).toBeTruthy();
      expect(fn.FPDF_GetPageCount(doc)).toBe(1);
      const out = mem.alloc(512);
      const len = Math.min(512, Number(fn.FPDF_GetMetaText(doc, 'Title', out, 512)));
      const text = new TextDecoder('utf-16le').decode(mem.readBytes(out, len)).replace(/\0+$/, '');
      mem.free(out);
      return text;
    } finally {
      fn.FPDF_CloseDocument(doc);
      mem.free(buffer);
    }
  }

  const base = pdf(BASE);

  test('a table update: one section, prefix kept, newer wins, unused old objects dropped', () => {
    const v1 = append(
      base,
      { 4: '<< /Title (A) /Keywords 5 0 R >>', 5: '(kw)', 6: '(kept)' },
      '/Info 4 0 R',
    );
    // Object 6 is in use by the catalog in the save; 5 no longer is.
    const saved = append(
      v1,
      { 4: '<< /Title (B) >>', 1: '<< /Type /Catalog /Pages 2 0 R /X 6 0 R >>' },
      '/Info 4 0 R',
    );
    const merged = mergeIntoLastUpdate(v1, saved);
    expect(merged).not.toBe(saved);
    expect(sameStart(merged, base, base.length)).toBe(true);
    expect(count(merged, '%%EOF')).toBe(2);
    expect(latin1(merged)).toMatch(new RegExp(`/Prev ${startxrefs(base)[0]}\\b`));
    expect(latin1(merged)).toContain('(kept)');
    expect(latin1(merged).slice(base.length)).not.toContain('(kw)');
    expect(title(merged)).toBe('B');

    // A chain: every later save merges into the same one section.
    const again = mergeIntoLastUpdate(
      merged,
      append(merged, { 4: '<< /Title (C) >>' }, '/Info 4 0 R'),
    );
    expect(count(again, '%%EOF')).toBe(2);
    expect(sameStart(again, base, base.length)).toBe(true);
    expect(title(again)).toBe('C');
  });

  test('a file without an update gets a plain append', () => {
    const saved = append(base, { 4: '<< /Title (A) >>' }, '/Info 4 0 R');
    expect(mergeIntoLastUpdate(base, saved)).toBe(saved);
  });

  test('a signed last section is never rewritten', () => {
    const v1 = append(base, { 4: '<< /Type /Sig /ByteRange [0 1 2 3] /Contents <00> >>' });
    const saved = append(v1, { 5: '<< /Title (A) >>' }, '/Info 5 0 R');
    expect(mergeIntoLastUpdate(v1, saved)).toBe(saved);
  });

  test('a broken chain is a plain append', () => {
    const v1 = latin1(append(base, { 4: '<< /Title (A) >>' }, '/Info 4 0 R')).replace(
      /\/Prev \d+/,
      '/Prev 3',
    );
    const broken = bytesOf(v1);
    const saved = append(broken, { 4: '<< /Title (B) >>' }, '/Info 4 0 R');
    expect(mergeIntoLastUpdate(broken, saved)).toBe(saved);
  });

  test('a trailing comment line after the last section goes away with it', () => {
    const v1 = append(base, { 4: '<< /Title (A) >>' }, '/Info 4 0 R');
    const marked = bytesOf(`${latin1(v1)}%APP-NOTE section=${base.length}\n`);
    const merged = mergeIntoLastUpdate(
      marked,
      append(marked, { 4: '<< /Title (B) >>' }, '/Info 4 0 R'),
    );
    expect(latin1(merged)).not.toContain('%APP-NOTE');
    expect(count(merged, '%%EOF')).toBe(2);
    expect(title(merged)).toBe('B');
  });

  test('an xref stream with an object stream: packed objects stay packed, the section stays a stream', () => {
    const v1 = appendXrefStream(
      base,
      { 4: '<< /Title (A) /K 7 0 R >>' },
      { 7: '(packed)', 8: '(dead)' },
      9,
      10,
      '/Info 4 0 R',
    );
    expect(title(v1)).toBe('A');
    const saved = append(
      v1,
      { 11: '(new)', 4: '<< /Title (B) /K 7 0 R /N 11 0 R >>' },
      '/Info 4 0 R',
    );
    const merged = mergeIntoLastUpdate(v1, saved);
    expect(merged).not.toBe(saved);
    expect(sameStart(merged, base, base.length)).toBe(true);
    expect(count(merged, '%%EOF')).toBe(2);
    expect(latin1(merged).slice(base.length)).toContain('/Type /XRef');
    expect(latin1(merged).slice(base.length)).not.toMatch(/(^|\n)xref\n/);
    expect(latin1(merged)).toContain('(packed)');
    expect(title(merged)).toBe('B');
  });

  test('hybrid: an /XRefStm inside the section is carried over', () => {
    const v1 = appendXrefStream(
      base,
      { 4: '<< /Title (A) /K 7 0 R >>' },
      { 7: '(packed)' },
      9,
      10,
      '/Info 4 0 R',
      'inner',
    );
    expect(title(v1)).toBe('A');
    const merged = mergeIntoLastUpdate(
      v1,
      append(v1, { 4: '<< /Title (B) /K 7 0 R >>' }, '/Info 4 0 R'),
    );
    expect(count(merged, '%%EOF')).toBe(2);
    expect(latin1(merged).slice(base.length)).toMatch(/\/XRefStm \d+/);
    expect(title(merged)).toBe('B');
  });

  test("hybrid: an /XRefStm before the section (Word's pattern) stays where it is", () => {
    // The base revision holds the xref stream; the last update is a table pointing back at it.
    const withStm = appendXrefStream(base, {}, { 7: '(packed)' }, 9, 10, '');
    const stmAt = startxrefs(withStm).at(-1)!;
    const prefixLen = withStm.length;
    const v1Text =
      latin1(withStm) +
      `4 0 obj\n<< /Title (A) /K 7 0 R >>\nendobj\n` +
      `xref\n4 1\n${String(prefixLen).padStart(10, '0')} 00000 n \ntrailer\n<< /Root 1 0 R /Size 11 /Info 4 0 R /Prev ${stmAt} /XRefStm ${stmAt} >>\nstartxref\n${prefixLen + `4 0 obj\n<< /Title (A) /K 7 0 R >>\nendobj\n`.length}\n%%EOF\n`;
    const v1 = bytesOf(v1Text);
    expect(title(v1)).toBe('A');
    const merged = mergeIntoLastUpdate(
      v1,
      append(v1, { 4: '<< /Title (B) /K 7 0 R >>' }, '/Info 4 0 R'),
    );
    expect(merged.length).toBeLessThan(v1.length + 200);
    expect(sameStart(merged, withStm, withStm.length)).toBe(true);
    expect(latin1(merged).slice(prefixLen)).toContain(`/XRefStm ${stmAt}`);
    expect(title(merged)).toBe('B');
  });
});

describe('download({ mergeLastUpdate })', () => {
  let engine: Engine;
  let opened = 0;
  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine?.destroy();
  });
  const open = (bytes: Uint8Array, password?: string) =>
    engine.open(
      { kind: 'bytes', id: `merge-${++opened}`, bytes },
      { scope: ['*'], ...(password ? { password } : {}) },
    );

  async function edit(bytes: Uint8Array, title: string, password?: string): Promise<Uint8Array> {
    const doc = await open(bytes, password);
    await doc.metadata.update({ title });
    const saved = await doc.download({ mode: 'incremental', mergeLastUpdate: true });
    await doc.close();
    return saved;
  }

  test('repeated saves keep one update section and the original bytes', async () => {
    const original = pdf(BASE);
    const first = await edit(original, 'one');
    // The original had no update: the first save appends.
    expect(sameStart(first, original, original.length)).toBe(true);
    expect(count(first, '%%EOF')).toBe(2);
    let current = first;
    for (const title of ['two', 'three', 'four']) {
      current = await edit(current, title);
      expect(count(current, '%%EOF')).toBe(2);
      expect(sameStart(current, original, original.length)).toBe(true);
    }
    const doc = await open(current);
    await expect(doc.metadata.get()).resolves.toMatchObject({ title: 'four' });
    await doc.close();
  });

  test('without the option the save appends', async () => {
    const once = await edit(pdf(BASE), 'one');
    const doc = await open(once);
    await doc.metadata.update({ title: 'two' });
    expect(count(await doc.download({ mode: 'incremental' }), '%%EOF')).toBe(3);
    await doc.close();
  });

  test('an encrypted file keeps opening with its password', async () => {
    const encrypted = new Uint8Array(await fixture('encrypted.pdf'));
    const password = '1234';
    const first = await edit(encrypted, 'one', password);
    const second = await edit(first, 'two', password);
    const third = await edit(second, 'three', password);
    expect(count(third, '%%EOF')).toBe(count(first, '%%EOF'));
    expect(sameStart(third, encrypted, encrypted.length)).toBe(true);
    const doc = await open(third, password);
    await expect(doc.metadata.get()).resolves.toMatchObject({ title: 'three' });
    await doc.close();
  });
});
