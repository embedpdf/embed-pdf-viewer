import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Engine } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

/** A one-page PDF (612 x 792) whose catalog /OpenAction is `dest`. */
function pdfWithOpenDestination(dest: string): Uint8Array {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /OpenAction ${dest} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (c) => c.charCodeAt(0));
}

describe('/XYZ destinations', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function openDestination(dest: string) {
    const doc = await engine.open({ kind: 'bytes', bytes: pdfWithOpenDestination(dest) });
    try {
      return (await doc.actions.get()).openDestination;
    } finally {
      await doc.close();
    }
  }

  test('a short array keeps the parameters it has', async () => {
    expect(await openDestination('[3 0 R /XYZ 10 700]')).toMatchObject({
      kind: 'xyz',
      x: 10,
      y: 92,
      zoom: null,
    });
  });

  test('a 0 zoom reads as null, which means the same', async () => {
    expect(await openDestination('[3 0 R /XYZ 10 700 0]')).toMatchObject({
      kind: 'xyz',
      x: 10,
      y: 92,
      zoom: null,
    });
  });

  test('null parameters read as null', async () => {
    expect(await openDestination('[3 0 R /XYZ null null null]')).toMatchObject({
      kind: 'xyz',
      x: null,
      y: null,
      zoom: null,
    });
  });

  test('a zoom keeps its value', async () => {
    expect(await openDestination('[3 0 R /XYZ 0 792 1.5]')).toMatchObject({
      kind: 'xyz',
      x: 0,
      y: 0,
      zoom: 1.5,
    });
  });
});
