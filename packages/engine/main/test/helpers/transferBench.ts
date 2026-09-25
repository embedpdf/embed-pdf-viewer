/**
 * Documents and annotations for the annotation transfer benchmarks (E8),
 * shared by the local and the cloud engine's bench tests.
 */
import { performance } from 'node:perf_hooks';
import { crc32, deflateSync } from 'node:zlib';
import { toPageRef, type PageRef } from '@embedpdf/engine-core/runtime';
import { creatables } from '@embedpdf/engine-core/conformance';
import type { createLocalEngine } from '../../src/index';
import { pdf, type Objects } from './miniPdf';

export type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
export type Doc = Awaited<ReturnType<Engine['open']>>;

/** A document of `count` empty letter pages. */
export function pages(count: number): Uint8Array {
  const objects: Objects = {};
  const numbers = Array.from({ length: count }, (_, i) => 3 + i);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${numbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${count} >>`;
  for (const n of numbers) objects[n] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';
  return pdf(objects);
}

/** An RGB PNG: one color, or each pixel's from `color(x, y)`. */
export function png(
  width: number,
  height: number,
  color: [number, number, number] | ((x: number, y: number) => [number, number, number]),
): Uint8Array {
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(width * 3 + 1);
    for (let x = 0; x < width; x++)
      row.set(typeof color === 'function' ? color(x, y) : color, 1 + x * 3);
    return row;
  });
  const raw = Buffer.concat(rows);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

export async function timed<T>(rows: string[], label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  rows.push(`${label.padEnd(46)} ${(performance.now() - t0).toFixed(0).padStart(8)} ms`);
  return out;
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export async function pageRefs(doc: Doc): Promise<PageRef[]> {
  return (await doc.pages.list()).pages.map((entry) => toPageRef(entry.ref.pageObjectNumber));
}

/**
 * `count` mixed annotations over the pages: every kind a create makes in
 * turn, and every tenth a stamp of one of ten images, every twenty-fifth a
 * note with a reply.
 */
export async function fill(doc: Doc, count: number): Promise<void> {
  const refs = await pageRefs(doc);
  const kinds = creatables();
  const images = Array.from({ length: 10 }, (_, i) => png(64, 32, [i * 25, 120, 255 - i * 25]));
  for (let i = 0; i < count; i++) {
    const page = doc.page(refs[i % refs.length]!);
    const slot = Math.floor(i / refs.length);
    const left = 20 + (slot % 10) * 55;
    const bottom = 40 + Math.floor(slot / 10) * 60;
    const rect = { left, bottom, right: left + 50, top: bottom + 40 };
    if (i % 25 === 0) {
      const { created } = await page.annotations.create({
        subtype: 'text',
        rect,
        contents: `Note ${i}`,
      });
      await page.annotations.create({ subtype: 'text', rect, reply: { to: created.ref } });
      i++;
    } else if (i % 10 === 0) {
      await page.annotations.create(
        { subtype: 'stamp', rect },
        { appearance: images[Math.floor(i / 10) % 10]! },
      );
    } else {
      const { data, resources } = kinds[i % kinds.length]!;
      const shifted = JSON.parse(
        JSON.stringify(data).replaceAll(/"(x|left|right)":(\d+(\.\d+)?)/g, (_m, key, value) => {
          return `"${key}":${Number(value) - 40 + left}`;
        }),
      );
      await page.annotations.create({ ...shifted, rect }, resources);
    }
  }
}
