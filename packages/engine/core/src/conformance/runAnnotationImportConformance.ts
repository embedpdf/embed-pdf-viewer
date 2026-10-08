import { creatables, iconRect, PNG_1X1 } from './creatables';
import { UUID_V7 } from './names';
import type {
  AnnotationResourceConformanceOptions,
  AnnotationResourceFixture,
} from './runAnnotationResourceConformance';
import { isPermissionRefusal } from './refusals';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PDF } from './stampFixtures';
import type { Annotation } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Change } from '../mutation/Change';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodePageKey, toPageRef, type PageRef } from '../identity/PageRef';
import type { AnnotationBundle } from '../transfer/AnnotationBundle';
import { resourceIdOf } from '../transfer/bundle';
import type { AnnotationImportResult } from '../transfer/annotationImport';

/**
 * `doc.annotations.import` on both engines, in `stamp` mode: a bundle comes
 * back as the export had it, one fact per annotation as one transaction,
 * what can't be carried left out and reported, pages mapped, and a refusal
 * before anything is written. An import is a change: undone and redone with
 * `doc.apply({ undoOf })`, answered again on a retry, and a restoring
 * import's undo takes the import's rights.
 */
export function runAnnotationImportConformance(
  runner: ConformanceTestRunner,
  opts: AnnotationResourceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation import conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    /** Two fresh copies of a fixture: where a bundle comes from, and where it goes. */
    const twoCopies = async (
      fixture: AnnotationResourceFixture,
      run: (source: DocumentHandle, target: DocumentHandle, page: PageRef) => Promise<void>,
    ): Promise<void> => {
      const source = await opts.open(engine, fixture);
      const target = await opts.open(engine, fixture);
      try {
        const { pages } = await source.pages.list();
        await run(source, target, toPageRef(pages[0]!.ref.objectNumber));
      } finally {
        await source.close();
        await target.close();
      }
    };

    const box = (x: number): PageBox => ({ x, y: 300, width: 40, height: 30 });
    const create = async (
      page: PageHandle,
      draft: Parameters<PageHandle['annotations']['create']>[0],
      resources?: Parameters<PageHandle['annotations']['create']>[1],
    ) => (await page.annotations.create(draft, resources)).annotation as Annotation;

    test('imports every kind a create makes, as the export has it', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        for (const { data, resources } of creatables()) await create(page, data, { resources });
        await create(
          page,
          { subtype: 'stamp', box: box(20) },
          { resources: { appearance: BANDS_PDF } },
        );
        await create(
          page,
          { subtype: 'stamp', box: box(80), opacity: 0.5 },
          { resources: { appearance: BANDS_PDF } },
        );
        const note = await create(page, {
          subtype: 'text',
          rect: iconRect(box(140).x, box(140).y),
          contents: 'Check',
        });
        await create(page, { subtype: 'popup', rect: box(200), parent: note.ref, open: true });
        await create(page, {
          subtype: 'text',
          rect: iconRect(box(140).x, box(140).y),
          reply: { to: note.ref },
        });
        await create(page, {
          subtype: 'link',
          rect: box(260),
          target: { kind: 'goto', destination: { kind: 'fit', page: pageRef } },
        });

        const bundle = await source.annotations.export();
        const result = await target.annotations.import(bundle, { attribution: 'stamp' });
        expect(result.dropped).toEqual([]);
        expect(result.annotations).toHaveLength(bundle.items.length);
        expect(result.refMap.map((pair) => annotationKey(pair.from))).toEqual(
          bundle.items.map((item) => annotationKey(item.data.ref)),
        );

        // Copies, so each has a fresh name.
        const names = new Set(bundle.items.map((item) => item.data.nm));
        for (const annotation of result.annotations) {
          expect(annotation.nm).toMatch(UUID_V7);
          expect(names.has(annotation.nm)).toBe(false);
        }
        // Exported again, the target gives the same file, apart from the new
        // refs and names and the attribution the import stamped: the same
        // data, and each drawing and file under the same id.
        const again = await target.annotations.export();
        expect(comparable(again, result)).toEqual(comparable(bundle));
        expect(Object.keys(again.resources).sort()).toEqual(Object.keys(bundle.resources).sort());
        expect(result.annotations).toEqual(again.items.map((item) => item.data));
      });
    });

    test('emits one annotations.created per annotation, as one transaction', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        await create(page, { subtype: 'square', box: box(20) });
        await create(page, { subtype: 'circle', box: box(80) });
        const bundle = await source.annotations.export();

        const events: DocumentEvent[] = [];
        target.events.subscribe((event) => events.push(event));
        const result = await target.annotations.import(bundle, {
          attribution: 'stamp',
          opId: 'import-1',
        });
        const created = events.filter((event) => event.type === 'annotations.created');
        expect(created).toHaveLength(2);
        created.forEach((event, index) => {
          if (event.type !== 'annotations.created') return;
          expect(event.annotation).toEqual(result.annotations[index]);
          expect(event.page).toEqual(pageRef);
          expect(event.origin.tx).toEqual({ id: 'import-1', index, count: 2 });
        });
      });
    });

    test('a restore leaves out a name the page has, and what points at it, then names on a repeat', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        const taken = await create(page, {
          subtype: 'text',
          rect: iconRect(box(20).x, box(20).y),
          nm: 'taken',
        });
        const reply = await create(page, {
          subtype: 'text',
          rect: iconRect(box(20).x, box(20).y),
          reply: { to: taken.ref },
        });
        const free = await create(page, { subtype: 'square', box: box(80), nm: 'free' });
        // Named by the engine, as every create is.
        const circle = await create(page, { subtype: 'circle', box: box(140) });
        await create(target.page(pageRef), { subtype: 'square', box: box(200), nm: 'taken' });
        const bundle = await source.annotations.export();

        const first = await target.annotations.import(bundle, { attribution: 'restore' });
        expect(first.dropped).toEqual([
          { ref: taken.ref, reason: 'name-conflict' },
          { ref: reply.ref, reason: 'parent-dropped' },
        ]);
        expect(first.refMap.map((pair) => annotationKey(pair.from))).toEqual(
          [free, circle].map((annotation) => annotationKey(annotation.ref)),
        );
        expect(first.annotations.map((annotation) => annotation.nm)).toEqual(['free', circle.nm]);

        // Every name is recognized again.
        const second = await target.annotations.import(bundle, { attribution: 'restore' });
        expect(second.dropped.map((drop) => drop.reason)).toEqual([
          'name-conflict',
          'parent-dropped',
          'name-conflict',
          'name-conflict',
        ]);
        expect(second.annotations).toEqual([]);
      });
    });

    test('a stamp makes copies: each gets a fresh name, so a name the page has is no conflict', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        const taken = await create(page, {
          subtype: 'text',
          rect: iconRect(box(20).x, box(20).y),
          nm: 'taken',
        });
        await create(page, {
          subtype: 'text',
          rect: iconRect(box(20).x, box(20).y),
          reply: { to: taken.ref },
        });
        await create(target.page(pageRef), { subtype: 'square', box: box(200), nm: 'taken' });
        const bundle = await source.annotations.export();

        for (let copy = 0; copy < 2; copy++) {
          const result = await target.annotations.import(bundle, { attribution: 'stamp' });
          expect(result.dropped).toEqual([]);
          const [note, reply] = result.annotations;
          expect(note!.nm).toMatch(UUID_V7);
          expect(reply!.nm).toMatch(UUID_V7);
          expect(note!.nm === 'taken').toBe(false);
          expect(reply!.reply?.to).toEqual(note!.ref);
        }
      });
    });

    test('puts each page where the options say', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        await create(source.page(pageRef), { subtype: 'square', box: box(20) });
        const bundle = await source.annotations.export();
        await target.pages.insertBlank({ size: { width: 300, height: 300 } }, 'start');
        const { pages } = await target.pages.list();
        const blank = toPageRef(pages[0]!.ref.objectNumber);

        const pageOf = (result: AnnotationImportResult) => result.annotations[0]!.ref.page;
        const same = await target.annotations.import(bundle, { attribution: 'stamp' });
        expect(pageOf(same)).toEqual(pageRef);
        const byPosition = await target.annotations.import(bundle, {
          attribution: 'stamp',
          pages: 'by-position',
        });
        expect(pageOf(byPosition)).toEqual(blank);
        const listed = await target.annotations.import(bundle, {
          attribution: 'stamp',
          pages: [{ from: pageRef, to: blank }],
        });
        expect(pageOf(listed)).toEqual(blank);
        expect((await target.annotations.list({ pages: [blank] })).annotations).toHaveLength(2);
      });
    });

    test('refuses before writing anything: an unmapped page, a tampered or oversized resource', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        const stamp = await create(
          page,
          { subtype: 'stamp', box: box(20) },
          { resources: { appearance: PNG_1X1 } },
        );
        await source.pages.insertBlank({ size: { width: 300, height: 300 } }, { after: pageRef });
        const { pages } = await source.pages.list();
        const second = toPageRef(pages[1]!.ref.objectNumber);
        await create(source.page(second), { subtype: 'square', box: box(20) });
        const bundle = await source.annotations.export();

        const events: DocumentEvent[] = [];
        target.events.subscribe((event) => events.push(event));
        const refused = (
          candidate: AnnotationBundle,
          options: Parameters<DocumentHandle['annotations']['import']>[1],
        ) => target.annotations.import(candidate, { attribution: 'stamp', ...options });

        // The second page is not in the target.
        await expect(refused(bundle, {})).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
          details: { pages: [encodePageKey(second)] },
        });

        const stampOnly = (bytes: Uint8Array, id: `sha256-${string}`): AnnotationBundle => ({
          ...bundle,
          pages: bundle.pages.slice(0, 1),
          items: [{ data: stamp, resources: { appearance: id } }],
          resources: { [id]: bytes },
        });
        const tampered = stampOnly(PNG_1X1, await resourceIdOf(BANDS_PDF));
        await expect(refused(tampered, {})).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });

        // A PNG whose header says 10 000 × 10 000: refused from the header.
        const huge = PNG_1X1.slice();
        new DataView(huge.buffer).setUint32(16, 10_000);
        new DataView(huge.buffer).setUint32(20, 10_000);
        await expect(refused(stampOnly(huge, await resourceIdOf(huge)), {})).rejects.toMatchObject({
          code: EngineErrorCode.PayloadTooLarge,
          details: { limit: 'imagePixels' },
        });

        expect((await target.annotations.list({ pages: [pageRef] })).annotations).toEqual([]);
        expect(events).toEqual([]);
      });
    });

    /** The page's annotations as the target reads them. */
    const listed = async (doc: DocumentHandle, pageRef: PageRef) =>
      (await doc.annotations.list({ pages: [pageRef] })).annotations as Annotation[];
    const keysOf = (annotations: readonly { ref: AnnotationRef }[]) =>
      annotations.map((annotation) => annotationKey(annotation.ref)).sort();

    /** A thread (a note, its popup, a reply), a square and a stamp, exported. */
    const threadBundle = async (source: DocumentHandle, pageRef: PageRef) => {
      const page = source.page(pageRef);
      const note = await create(page, {
        subtype: 'text',
        rect: iconRect(box(20).x, box(20).y),
        contents: 'Check',
      });
      await create(page, { subtype: 'popup', rect: box(80), parent: note.ref });
      await create(page, {
        subtype: 'text',
        rect: iconRect(box(20).x, box(20).y),
        reply: { to: note.ref },
      });
      await create(page, { subtype: 'square', box: box(140) });
      await create(
        page,
        { subtype: 'stamp', box: box(200) },
        { resources: { appearance: PNG_1X1 } },
      );
      return source.annotations.export();
    };

    for (const attribution of ['stamp', 'restore'] as const) {
      test(`an import (${attribution}) is undone and redone: the same refs and attribution`, async () => {
        await twoCopies('authoring', async (source, target, pageRef) => {
          const bundle = await threadBundle(source, pageRef);
          const before = keysOf(await listed(target, pageRef));
          const imported = await target.annotations.import(bundle, { attribution });
          expect(imported.meta.undoable).toBe(true);
          expect(imported.annotations).toHaveLength(5);

          // The thread goes as one, the square and the stamp each alone.
          const undo = await target.apply({ undoOf: imported.meta.opId });
          expect(undo.items.map((item) => item.type)).toEqual([
            'annotations.delete',
            'annotations.delete',
            'annotations.delete',
          ]);
          expect(keysOf(await listed(target, pageRef))).toEqual(before);

          // The undo's undo brings back the same annotations, as the import wrote them.
          await target.apply({ undoOf: undo.meta.opId });
          const back = await listed(target, pageRef);
          const byKey = new Map(
            back.map((annotation) => [annotationKey(annotation.ref), annotation]),
          );
          for (const annotation of imported.annotations) {
            const again = byKey.get(annotationKey(annotation.ref));
            expect(again).toMatchObject({
              nm: annotation.nm,
              userId: annotation.userId,
              createdBy: annotation.createdBy,
              author: annotation.author,
              rect: annotation.rect,
            });
          }
        });
      });
    }

    test('an imported annotation changed since stays; the rest of the import goes', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        const page = source.page(pageRef);
        await create(page, { subtype: 'square', box: box(20) });
        await create(page, { subtype: 'circle', box: box(80) });
        const bundle = await source.annotations.export();
        const imported = await target.annotations.import(bundle, { attribution: 'stamp' });
        const [square, circle] = imported.annotations;
        await target.page(pageRef).annotations.update(square!.ref, { color: '#00aa00' });

        const undo = await target.apply({ undoOf: imported.meta.opId });
        expect(undo.items.map((item) => item.type).sort()).toEqual([
          'annotations.delete',
          'skipped',
        ]);
        const left = keysOf(await listed(target, pageRef));
        expect(left.includes(annotationKey(square!.ref))).toBe(true);
        expect(left.includes(annotationKey(circle!.ref))).toBe(false);
      });
    });

    test('a retry under the same opId answers again and writes nothing more', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        await create(source.page(pageRef), { subtype: 'square', box: box(20) });
        const bundle = await source.annotations.export();
        const first = await target.annotations.import(bundle, {
          attribution: 'stamp',
          opId: 'import-retry',
        });
        const again = await target.annotations.import(bundle, {
          attribution: 'stamp',
          opId: 'import-retry',
        });
        expect(keysOf(again.annotations)).toEqual(keysOf(first.annotations));
        const squares = (await listed(target, pageRef)).filter((a) => a.subtype === 'square');
        expect(squares).toHaveLength(1);
      });
    });

    test("doc.apply takes no import: restoring attribution stays the import verb's", async () => {
      await twoCopies('authoring', async (source, target) => {
        const bundle = await source.annotations.export();
        // No op of `doc.apply` is an import: a caller can only force one in.
        const change = { ops: [{ type: 'annotations.import', bundle, attribution: 'restore' }] };
        await expect(target.apply(change as unknown as Change)).rejects.toMatchObject({
          code: EngineErrorCode.InvalidArg,
        });
      });
    });

    test('a final write ends undo for an import before it', async () => {
      await twoCopies('authoring', async (source, target, pageRef) => {
        await create(source.page(pageRef), { subtype: 'square', box: box(20) });
        const bundle = await source.annotations.export();
        const imported = await target.annotations.import(bundle, { attribution: 'stamp' });
        await target.page(pageRef).annotations.flatten([imported.annotations[0]!.ref]);
        await expect(target.apply({ undoOf: imported.meta.opId })).rejects.toMatchObject({
          code: EngineErrorCode.UndoUnavailable,
        });
      });
    });

    test("undoing a restoring import takes the import's rights, not the per-annotation ones", async () => {
      if (!opts.openScoped) return;
      // May delete only its own annotations, and may import.
      const scope = [
        'doc.open',
        'doc.render',
        'doc.download',
        'doc.annotate.modify',
        'doc.annotate.import',
        'annotations:delete:self',
      ];
      const source = await opts.open(engine, 'authoring');
      const target = await opts.openScoped(engine, 'authoring', scope);
      try {
        const { pages } = await source.pages.list();
        const pageRef = toPageRef(pages[0]!.ref.objectNumber);
        await create(source.page(pageRef), { subtype: 'square', box: box(20) });
        const bundle = await source.annotations.export();
        const imported = await target.annotations.import(bundle, { attribution: 'restore' });
        const [square] = imported.annotations;

        // The square isn't the session's own: a delete is refused.
        const refused = await target
          .page(pageRef)
          .annotations.delete(square!.ref)
          .then(
            () => null,
            (error: unknown) => error,
          );
        expect(isPermissionRefusal(refused)).toBe(true);

        // The import's undo and its redo take what the import took.
        const undo = await target.apply({ undoOf: imported.meta.opId });
        const key = annotationKey(square!.ref);
        expect(keysOf(await listed(target, pageRef)).includes(key)).toBe(false);
        await target.apply({ undoOf: undo.meta.opId });
        expect(keysOf(await listed(target, pageRef)).includes(key)).toBe(true);
      } finally {
        await source.close();
        await target.close();
      }
    });
  });
}

/**
 * A bundle as two engines or two documents can agree on it: each ref as the
 * source had it (`result.refMap` maps the target's back), and without the
 * attribution an import stamps, the attached file's dates included.
 */
function comparable(bundle: AnnotationBundle, result?: AnnotationImportResult) {
  const back = new Map(
    (result?.refMap ?? []).map((pair) => [annotationKey(pair.to), pair.from] as const),
  );
  const source = (ref: AnnotationRef | null | undefined) =>
    ref ? (back.get(annotationKey(ref)) ?? ref) : ref;
  return bundle.items.map(({ data, resources }) => {
    const {
      author: _author,
      createdAt: _createdAt,
      modifiedAt: _modifiedAt,
      userId: _userId,
      createdBy: _createdBy,
      modifiedBy: _modifiedBy,
      nm: _nm,
      ...rest
    } = data as Annotation & Record<string, unknown>;
    const fields = rest as Record<string, unknown>;
    // An attached file is dated when it is written, as the stamp dates the annotation.
    if (data.subtype === 'file-attachment' && data.file) {
      const { createdAt: _fileCreatedAt, modifiedAt: _fileModifiedAt, ...file } = data.file;
      fields.file = file;
    }
    return {
      data: {
        ...fields,
        ref: source(data.ref),
        popup: source(data.popup),
        ...(data.reply ? { reply: { ...data.reply, to: source(data.reply.to) } } : {}),
        ...(data.subtype === 'popup' ? { parent: source(data.parent) } : {}),
      },
      resources,
    };
  });
}
