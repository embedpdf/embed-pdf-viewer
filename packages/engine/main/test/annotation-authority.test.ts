/**
 * An update or a delete carries the caller's authority, and the worker
 * checks it against the annotations the write finds, inside the write: no
 * read before it, and a refusal changes nothing.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { EngineError, EngineErrorCode, type PageRef } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const FIXTURE = new URL('./fixtures/hello_world.pdf', import.meta.url);
const box = (x: number) => ({ x, y: 40, width: 40, height: 30 });

/** The refusal `write` ends in, or `null` when it goes through. */
const refusal = (write: Promise<unknown>) =>
  write.then(
    () => null,
    (error: unknown) => error,
  );

describe('annotation writes check the caller inside the write (local engine)', () => {
  test("a narrowed caller can't change or delete another person's annotation", async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const alice = await engine.open(
        { kind: 'bytes', id: 'authority-alice', bytes: new Uint8Array(await readFile(FIXTURE)) },
        { scope: ['*'], identity: { userId: 'alice' } },
      );
      const page: PageRef = (await alice.pages.list()).pages[0]!.ref;
      const { annotation } = await alice.page(page).annotations.create({
        subtype: 'square',
        box: box(20),
      });
      const bytes = await alice.download({ mode: 'incremental' });

      const bob = await engine.open(
        { kind: 'bytes', id: 'authority-bob', bytes },
        {
          scope: [
            'doc.open',
            'doc.annotate.modify',
            'annotations:update:self',
            'annotations:delete:self',
          ],
          identity: { userId: 'bob' },
        },
      );
      const annotations = bob.page(page).annotations;
      const before = await annotations.list();

      const updated = await refusal(annotations.update(annotation.ref, { box: box(60) }));
      expect(EngineError.is(updated, EngineErrorCode.Forbidden)).toBe(true);
      expect((updated as EngineError).details).toMatchObject({ required: 'annotations:update' });

      const deleted = await refusal(annotations.delete(annotation.ref));
      expect(EngineError.is(deleted, EngineErrorCode.Forbidden)).toBe(true);
      expect((deleted as EngineError).details).toMatchObject({
        required: 'annotations:delete',
        refs: [annotation.ref],
      });

      expect(await annotations.list()).toEqual(before);
    } finally {
      await engine.destroy();
    }
  });

  test('a narrowed caller changes and deletes their own, and needs a grant to move it to a group', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const bob = await engine.open(
        { kind: 'bytes', id: 'authority-own', bytes: new Uint8Array(await readFile(FIXTURE)) },
        {
          scope: [
            'doc.open',
            'doc.annotate.modify',
            'annotations:update:self',
            'annotations:delete:self',
          ],
          identity: { userId: 'bob', displayName: 'Bob' },
        },
      );
      const page: PageRef = (await bob.pages.list()).pages[0]!.ref;
      const annotations = bob.page(page).annotations;
      const { annotation } = await annotations.create({ subtype: 'square', box: box(20) });

      const { annotation: moved } = await annotations.update(annotation.ref, { box: box(60) });
      expect(moved.box).toMatchObject(box(60));
      expect(moved.modifiedBy).toBe('bob');

      const regrouped = await refusal(annotations.update(annotation.ref, { groupId: 'legal' }));
      expect(EngineError.is(regrouped, EngineErrorCode.Forbidden)).toBe(true);
      expect((regrouped as EngineError).details).toMatchObject({
        required: 'annotations:set-group:group=legal',
      });

      await annotations.delete(annotation.ref);
      expect((await annotations.list()).annotations).toEqual([]);
    } finally {
      await engine.destroy();
    }
  });
});
