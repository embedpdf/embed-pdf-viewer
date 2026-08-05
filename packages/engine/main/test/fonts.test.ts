import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import { createLocalEngine, type LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const annotationsPdfPath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);
const robotoPath = resolve(here, 'fixtures', 'Roboto-Regular.ttf');

/** A page known to exist and be editable in annotations.pdf (see the mutation
 *  conformance fixture, which authors on the same page). */
const PAGE = 3;
const RECT = { left: 50, bottom: 250, right: 350, top: 320 };

let annotationsPdf: Uint8Array;
let roboto: Uint8Array;

beforeAll(async () => {
  annotationsPdf = new Uint8Array(await readFile(annotationsPdfPath));
  roboto = new Uint8Array(await readFile(robotoPath));
});

/** Resolve to the rejection reason, or fail if the promise resolves. */
async function rejection(p: PromiseLike<unknown>): Promise<{ code?: string }> {
  try {
    await p;
    throw new Error('expected promise to reject, but it resolved');
  } catch (err) {
    return err as { code?: string };
  }
}

const latin1 = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('engine.fonts (local engine)', () => {
  let engine: LocalEngine;

  afterEach(async () => {
    await engine.destroy();
  });

  test('fonts service is present on the local engine', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    expect(engine.fonts).toBeDefined();
    expect(engine.fonts.list()).toEqual([]);
  });

  test('register() returns a handle and list() reflects it', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const handle = await engine.fonts.register({
      key: 'roboto',
      familyName: 'Roboto',
      data: roboto,
    });
    expect(handle.key).toBe('roboto');
    expect(engine.fonts.list().map((f) => f.key)).toEqual(['roboto']);
  });

  test('register() is idempotent by key', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const a = await engine.fonts.register({ key: 'roboto', familyName: 'Roboto', data: roboto });
    const b = await engine.fonts.register({ key: 'roboto', familyName: 'Roboto', data: roboto });
    expect(b).toEqual(a);
    expect(engine.fonts.list()).toHaveLength(1);
  });

  test('register() rejects unloadable font bytes', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const err = await rejection(
      engine.fonts.register({ key: 'junk', data: new Uint8Array([1, 2, 3, 4]) }),
    );
    expect(err.code).toBe(EngineErrorCode.InvalidArg);
    expect(engine.fonts.list()).toEqual([]);
  });

  test('addFallback() rejects an unregistered key', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const err = await rejection(engine.fonts.addFallback('never-registered'));
    expect(err.code).toBe(EngineErrorCode.InvalidArg);
  });

  test('FreeText authored with a registered font embeds a glyph SUBSET on download', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    await engine.fonts.register({ key: 'roboto', familyName: 'Roboto', data: roboto });

    const doc = await engine.open({ kind: 'bytes', id: 'fonts-subset', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'roboto', // ← the registered key, not a standard font
      fontSize: 18,
      textAlign: 'left',
      contents: 'Hello',
      rect: RECT,
    });
    expect(created.created.subtype).toBe('free-text');

    const saved = await doc.download();
    const text = latin1(saved);

    // The registered font reached the embedded appearance...
    expect(text).toContain('FontFile2');
    expect(text).toContain('Roboto');
    // ...as a SUBSET, not the whole 305 KB face. A full embed would dwarf this.
    expect(saved.byteLength).toBeLessThan(roboto.byteLength / 2);

    await doc.close();
  });

  test('FreeText with an unregistered fontFamily key fails loud', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'fonts-missing', bytes: annotationsPdf });
    const err = await rejection(
      doc.page(PAGE).annotations.create({
        subtype: 'free-text',
        intent: 'free-text',
        fontFamily: 'not-registered',
        fontSize: 18,
        textAlign: 'left',
        contents: 'Hello',
        rect: RECT,
      }),
    );
    expect(err.code).toBe(EngineErrorCode.InvalidArg);
    await doc.close();
  });

  test('standard fonts still work unchanged (no embedded face)', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const doc = await engine.open({ kind: 'bytes', id: 'fonts-standard', bytes: annotationsPdf });
    const created = await doc.page(PAGE).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      fontFamily: 'helvetica',
      fontSize: 18,
      textAlign: 'left',
      contents: 'Hello',
      rect: RECT,
    });
    expect(created.created.subtype).toBe('free-text');
    const saved = await doc.download();
    // A standard font is never embedded; the doc stays tiny.
    expect(saved.byteLength).toBeLessThan(roboto.byteLength / 2);
    await doc.close();
  });

  test('addFallback() accepts a registered font (chain config succeeds)', async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const handle = await engine.fonts.register({
      key: 'roboto',
      familyName: 'Roboto',
      data: roboto,
    });
    await expect(engine.fonts.addFallback(handle)).resolves.toBeUndefined();
    await expect(engine.fonts.clearFallbacks()).resolves.toBeUndefined();
  });
});
