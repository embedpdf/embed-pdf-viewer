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
      expect(moved).toMatchObject({ subtype: 'square', box: box(60) });
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
  test("a widget is form design: annotation rights alone can't change or move it", async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const bytes = new Uint8Array(
        await readFile(new URL('./fixtures/listbox_form.pdf', import.meta.url)),
      );
      const open = (id: string, scope: string[]) =>
        engine.open({ kind: 'bytes', id, bytes }, { scope, identity: { userId: 'bob' } });

      const commenter = await open('widget-commenter', [
        'doc.open',
        'doc.annotate.modify',
        'doc.forms.read',
      ]);
      const page: PageRef = (await commenter.pages.list()).pages[0]!.ref;
      const annotations = commenter.page(page).annotations;
      const before = await commenter.forms.list();
      const widget = before.widgets[0]!;
      expect(widget).toBeDefined();
      expect(commenter.security.allowsAnnotation('update', widget)).toBe(false);

      // A widget's place and look are the form's: never an annotation update.
      const asAnnotation = await refusal(
        annotations.update(widget.ref, { subtype: 'widget', interiorColor: '#ffd500' }),
      );
      expect(EngineError.is(asAnnotation, EngineErrorCode.InvalidArg)).toBe(true);
      const updated = await refusal(
        commenter.forms.updateWidget(widget.ref, { interiorColor: '#ffd500' }),
      );
      expect(EngineError.is(updated, EngineErrorCode.Forbidden)).toBe(true);
      expect((updated as EngineError).details).toMatchObject({ required: 'doc.forms.modify' });
      // Its stacking order is the form's too.
      const asAnnotationOrder = await refusal(annotations.reorder([widget.ref], 'start'));
      expect(EngineError.is(asAnnotationOrder, EngineErrorCode.InvalidArg)).toBe(true);
      const reordered = await refusal(commenter.forms.reorderWidgets([widget.ref], 'start'));
      expect(EngineError.is(reordered, EngineErrorCode.Forbidden)).toBe(true);
      expect(await commenter.forms.list()).toEqual(before);

      const designer = await open('widget-designer', [
        'doc.open',
        'doc.annotate.modify',
        'doc.forms.modify',
      ]);
      expect(designer.security.allowsAnnotation('update', widget)).toBe(true);
      const designed = await designer.forms.updateWidget(widget.ref, { interiorColor: '#ffd500' });
      expect(designed.widget).toMatchObject({ interiorColor: '#ffd500' });

      // A widget has no group of its own: its field's group is the field's.
      const grouped = await refusal(
        designer.forms.updateWidget(widget.ref, { groupId: 'legal' } as never),
      );
      expect(EngineError.is(grouped, EngineErrorCode.InvalidArg)).toBe(true);
    } finally {
      await engine.destroy();
    }
  });
});
