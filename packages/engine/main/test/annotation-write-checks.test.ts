/**
 * The engine checks every annotation write where it runs, before its first native write: a value
 * its kind's schema refuses, and a rect that isn't four finite numbers, reject with `InvalidArg`
 * and leave the document as it was. A viewer predicts writes without these checks
 * (`annotationOfDraft`, `applyAnnotationPatch`), so the engine's door is where they hold.
 */
import { readFile } from 'node:fs/promises';

import {
  EngineError,
  EngineErrorCode,
  type AnnotationDraft,
  type AnnotationPatch,
  type LocalDocumentHandle,
  type LocalEngine,
  type LocalPageHandle,
} from '@embedpdf/engine-core/runtime';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createLocalEngine } from '../src/index';

const box = { x: 100, y: 100, width: 120, height: 80 };

/** What a write rejected with: its code and the field it names. */
async function refusalOf(write: Promise<unknown>) {
  const error = await write.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!EngineError.is(error)) throw new Error(`expected an EngineError, got ${String(error)}`);
  return { code: error.code, field: (error.details as { field?: string } | undefined)?.field };
}

describe('the engine refuses a write its checks refuse', () => {
  let engine: LocalEngine;
  let doc: LocalDocumentHandle;
  let page: LocalPageHandle;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    doc = await engine.open(
      {
        kind: 'bytes',
        id: 'write-checks',
        bytes: new Uint8Array(
          await readFile(new URL('./fixtures/hello_world.pdf', import.meta.url)),
        ),
      },
      { scope: ['*'] },
    );
    page = doc.page((await doc.pages.list()).pages[0]!.ref);
  });

  afterAll(async () => {
    await doc?.close();
    await engine?.destroy();
  });

  test('a draft whose values its kind refuses, naming the field, and nothing is created', async () => {
    const before = (await page.annotations.list()).annotations.length;
    const draft = { subtype: 'square', box, color: 'red' } as unknown as AnnotationDraft;
    expect(await refusalOf(page.annotations.create(draft))).toEqual({
      code: EngineErrorCode.InvalidArg,
      field: 'color',
    });
    expect((await page.annotations.list()).annotations).toHaveLength(before);
  });

  test.each([Infinity, -Infinity, NaN])(
    'a rect with %s in it, on create and on update',
    async (edge) => {
      const rect = { x: edge, y: 100, width: 20, height: 20 };
      const note = { subtype: 'text', rect } as unknown as AnnotationDraft;
      expect((await refusalOf(page.annotations.create(note))).code).toBe(
        EngineErrorCode.InvalidArg,
      );
      const placed = { subtype: 'square', rect } as unknown as AnnotationDraft;
      expect(await refusalOf(page.annotations.create(placed))).toEqual({
        code: EngineErrorCode.InvalidArg,
        field: 'rect',
      });

      const { annotation } = await page.annotations.create({ subtype: 'square', box });
      const moved = { subtype: 'square', rect } as unknown as AnnotationPatch;
      expect(await refusalOf(page.annotations.update(annotation.ref, moved))).toEqual({
        code: EngineErrorCode.InvalidArg,
        field: 'rect',
      });
      const listed = (await page.annotations.list()).annotations;
      const read = listed.find(
        (each) => JSON.stringify(each.ref) === JSON.stringify(annotation.ref),
      );
      expect(read?.rect).toEqual(annotation.rect);
    },
  );
});
