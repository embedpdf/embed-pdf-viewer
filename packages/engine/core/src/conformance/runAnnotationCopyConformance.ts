import { creatables, iconRect, PNG_1X1 } from './creatables';
import { UUID_V7 } from './names';
import { isPermissionRefusal } from './refusals';
import type { AnnotationResourceConformanceOptions } from './runAnnotationResourceConformance';
import type { ConformanceTestRunner } from './runMetadataConformance';
import { BANDS_PDF } from './stampFixtures';
import type { Annotation } from '../annotation/kinds';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { PageHandle } from '../engine/PageHandle';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { toPageRef, type PageRef } from '../identity/PageRef';
import { planAnnotationCopies } from '../transfer/annotationCopy';
import { DEFAULT_BUNDLE_LIMITS } from '../transfer/bundleLimits';

/**
 * `doc.annotations.copy` on both engines: a copy reads back as the copy rule
 * says (`planAnnotationCopies`, what a viewer shows before the engine
 * answers), for every kind a create makes. A stamp places the drawing its
 * source places and an attachment gets its file, with no download. Links
 * between copies stay and others are left out. A copy is a change: one fact
 * per copy as one transaction, undone and redone with `doc.apply({ undoOf })`,
 * and refused before anything is written, past the bundle limits too.
 */
export function runAnnotationCopyConformance(
  runner: ConformanceTestRunner,
  options: AnnotationResourceConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`annotation copy conformance: ${options.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await options.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    /**
     * A fresh copy of a fixture, its first page, and a blank page of another
     * size right after it.
     */
    const withDocument = async (
      run: (doc: DocumentHandle, page: PageRef, other: PageRef) => Promise<void>,
      fixture: Parameters<AnnotationResourceConformanceOptions['open']>[1] = 'authoring',
    ): Promise<void> => {
      const doc = await options.open(engine, fixture);
      try {
        const { pages } = await doc.pages.list();
        const page = toPageRef(pages[0]!.ref.objectNumber);
        const { insertedPages } = await doc.pages.insertBlank(
          { size: { width: 300, height: 500 } },
          { after: page },
        );
        await run(doc, page, insertedPages[0]!);
      } finally {
        await doc.close();
      }
    };

    const box = (x: number): PageBox => ({ x, y: 300, width: 40, height: 30 });
    const create = async (
      page: PageHandle,
      draft: Parameters<PageHandle['annotations']['create']>[0],
      resources?: Parameters<PageHandle['annotations']['create']>[1],
    ) => (await page.annotations.create(draft, resources)).annotation as Annotation;
    const listed = async (doc: DocumentHandle, page: PageRef) =>
      (await doc.page(page).annotations.list()).annotations as Annotation[];
    const keysOf = (annotations: readonly Annotation[]) =>
      annotations.map((annotation) => annotationKey(annotation.ref));
    const OFFSET = { x: 12, y: 18 };

    test('a copy of every kind a create makes reads back as the copy rule says, moved', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        for (const { data, resources } of creatables()) {
          const source = await create(page, data, resources ? { resources } : undefined);
          const result = await doc.annotations.copy([source.ref], { offset: OFFSET });
          // Each check names the kind, so a failure says which one.
          const kind = source.subtype;
          expect({ kind, dropped: result.dropped }).toEqual({ kind, dropped: [] });
          const [copy] = result.annotations;
          const [planned] = planAnnotationCopies([source], { offset: OFFSET }).copies;
          const differs = differences(carried(copy!), carried(planned!.data));
          expect({ kind, differs }).toEqual({ kind, differs: [] });

          // New, and the session's: its own ref, a fresh name, stamped as a create is.
          expect(annotationKey(copy!.ref) === annotationKey(source.ref)).toBe(false);
          expect(result.refMap).toEqual([{ from: source.ref, to: copy!.ref }]);
          expect(copy!.nm).toMatch(UUID_V7);
          expect(copy!.nm === source.nm).toBe(false);
          expect(copy!.author).toEqual(source.author);
          expect(keysOf(await listed(doc, pageRef))).toContain(annotationKey(copy!.ref));
        }
      });
    });

    test('a copy keeps its flags: a locked annotation’s copy is locked', async () => {
      await withDocument(async (doc, pageRef) => {
        const locked = await create(doc.page(pageRef), {
          subtype: 'square',
          box: box(20),
          locked: true,
          print: false,
        });
        const { annotations } = await doc.annotations.copy([locked.ref], { offset: OFFSET });
        expect(annotations[0]).toMatchObject({ locked: true, print: false });
      });
    });

    test('a copied stamp places the drawing its source places', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        const stamp = await create(
          page,
          { subtype: 'stamp', box: box(20), opacity: 0.5 },
          { resources: { appearance: BANDS_PDF } },
        );
        const { annotations } = await doc.annotations.copy([stamp.ref], { offset: OFFSET });
        const [copy] = annotations;
        expect(copy).toMatchObject({ subtype: 'stamp', opacity: 0.5 });

        // One drawing for both: an export names it once.
        const bundle = await doc.annotations.export({ refs: [stamp.ref, copy!.ref] });
        expect(Object.keys(bundle.resources)).toHaveLength(1);
        expect(bundle.items.map((item) => item.resources.appearance)).toEqual([
          Object.keys(bundle.resources)[0],
          Object.keys(bundle.resources)[0],
        ]);
        const [ofSource, ofCopy] = await Promise.all([
          page.annotations.downloadResource(stamp.ref, 'appearance'),
          page.annotations.downloadResource(copy!.ref, 'appearance'),
        ]);
        expect(Array.from(ofCopy)).toEqual(Array.from(ofSource));
      });
    });

    test('a stamp another app made is copied too', async () => {
      await withDocument(async (doc, pageRef) => {
        const stamps = (await listed(doc, pageRef)).filter((each) => each.subtype === 'stamp');
        expect(stamps.length > 0).toBe(true);
        const result = await doc.annotations.copy(
          stamps.map((stamp) => stamp.ref),
          { offset: OFFSET },
        );
        expect(result.dropped).toEqual([]);
        expect(result.annotations).toHaveLength(stamps.length);
        result.annotations.forEach((copy, at) => {
          const [planned] = planAnnotationCopies([stamps[at]!], { offset: OFFSET }).copies;
          expect(differences(geometryOf(copy), geometryOf(planned!.data))).toEqual([]);
        });
        const drawing = await doc
          .page(pageRef)
          .annotations.downloadResource(result.annotations[0]!.ref, 'appearance');
        expect(drawing.byteLength > 0).toBe(true);
      }, 'acrobat-stamps');
    });

    test('a copied attachment gets its source’s file, name and dates', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        const bytes = new TextEncoder().encode('attached, then copied');
        const source = await create(
          page,
          {
            subtype: 'file-attachment',
            rect: iconRect(40, 40),
            file: { name: 'note.txt', mimeType: 'text/plain', description: 'A note' },
          },
          { resources: { file: bytes } },
        );
        const { annotations } = await doc.annotations.copy([source.ref], { offset: OFFSET });
        const [copy] = annotations;
        expect(copy!.subtype === 'file-attachment' && copy.file).toEqual(
          source.subtype === 'file-attachment' && source.file,
        );
        const copied = await page.annotations.downloadResource(copy!.ref, 'file');
        expect(Array.from(copied)).toEqual(Array.from(bytes));
      });
    });

    test('links between copies stay: a group is a group of its own, a member alone stands alone', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        const first = await create(page, { subtype: 'square', box: box(20) });
        const second = await create(page, {
          subtype: 'circle',
          box: box(80),
          reply: { to: first.ref, type: 'group' },
        });
        const note = await create(page, { subtype: 'text', rect: iconRect(140, 300) });
        const popup = await create(page, {
          subtype: 'popup',
          rect: box(200),
          parent: note.ref,
          open: true,
        });
        const answer = await create(page, {
          subtype: 'text',
          rect: iconRect(140, 300),
          reply: { to: note.ref },
        });

        const whole = await doc.annotations.copy([first.ref, second.ref, note.ref, popup.ref]);
        expect(whole.dropped).toEqual([]);
        const [firstCopy, secondCopy, noteCopy, popupCopy] = whole.annotations;
        expect(firstCopy!.reply ?? null).toBeNull();
        expect(secondCopy!.reply).toEqual({ to: firstCopy!.ref, type: 'group' });
        expect(popupCopy!.subtype === 'popup' && popupCopy.parent).toEqual(noteCopy!.ref);
        expect(noteCopy!.popup).toEqual(popupCopy!.ref);
        // The note's reply wasn't named: it stays with the original alone.
        const replies = (await listed(doc, pageRef)).filter((each) => each.reply?.type === 'reply');
        expect(keysOf(replies)).toEqual([annotationKey(answer.ref)]);

        // A member, and a reply, each copied without what it points at.
        const alone = await doc.annotations.copy([second.ref, answer.ref]);
        expect(alone.dropped).toEqual([]);
        expect(alone.annotations.map((copy) => copy.reply ?? null)).toEqual([null, null]);
        // A popup shows an annotation: without it, there is none to show.
        const orphan = await doc.annotations.copy([popup.ref]);
        expect(orphan.annotations).toEqual([]);
        expect(orphan.dropped).toEqual([{ ref: popup.ref, reason: 'parent-missing' }]);
        expect(orphan.meta.undoable).toBe(false);
      });
    });

    test('onto another page: the same spot from that page’s top-left', async () => {
      await withDocument(async (doc, pageRef, other) => {
        const square = await create(doc.page(pageRef), { subtype: 'square', box: box(20) });
        const before = keysOf(await listed(doc, other));
        const { annotations } = await doc.annotations.copy([square.ref], { page: other });
        const [copy] = annotations;
        expect(copy!.ref.page).toEqual(other);
        expect(differences(geometryOf(copy!), geometryOf(square))).toEqual([]);
        expect(keysOf(await listed(doc, other))).toEqual([...before, annotationKey(copy!.ref)]);
      });
    });

    test('an annotation named twice is copied twice, under the object numbers given', async () => {
      await withDocument(async (doc, pageRef) => {
        const square = await create(doc.page(pageRef), { subtype: 'square', box: box(20) });
        await doc.objectNumbers.reserve(2);
        const numbers = [doc.objectNumbers.take()!, doc.objectNumbers.take()!];
        const result = await doc.annotations.copy([square.ref, square.ref], {
          offset: OFFSET,
          objectNumbers: numbers,
        });
        expect(result.refMap.map((pair) => annotationKey(pair.from))).toEqual([
          annotationKey(square.ref),
          annotationKey(square.ref),
        ]);
        expect(
          result.annotations.map(
            (copy) => copy.ref.kind === 'objectNumber' && copy.ref.objectNumber,
          ),
        ).toEqual(numbers);
        expect(new Set(result.annotations.map((copy) => copy.nm)).size).toBe(2);
      });
    });

    test('emits one annotations.created per copy, as one transaction', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        const refs = [
          (await create(page, { subtype: 'square', box: box(20) })).ref,
          (await create(page, { subtype: 'circle', box: box(80) })).ref,
        ];
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));
        const result = await doc.annotations.copy(refs, { offset: OFFSET, opId: 'copy-1' });
        expect(result.meta).toMatchObject({ opId: 'copy-1', undoable: true });
        expect(events.map((event) => event.type)).toEqual([
          'annotations.created',
          'annotations.created',
        ]);
        events.forEach((event, index) => {
          expect('origin' in event && event.origin.transaction).toEqual({
            id: 'copy-1',
            index,
            count: 2,
          });
          expect(event.type === 'annotations.created' && event.annotation).toEqual(
            result.annotations[index],
          );
        });
      });
    });

    test('is undone and redone: the same refs, and a copy changed since stays', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        const refs = [
          (await create(page, { subtype: 'square', box: box(20) })).ref,
          (await create(page, { subtype: 'circle', box: box(80) })).ref,
        ];
        const before = keysOf(await listed(doc, pageRef));
        const copied = await doc.annotations.copy(refs, { offset: OFFSET });
        const after = await listed(doc, pageRef);

        const undo = await doc.apply({ undoOf: copied.meta.opId });
        expect(keysOf(await listed(doc, pageRef))).toEqual(before);
        await doc.apply({ undoOf: undo.meta.opId });
        expect(await listed(doc, pageRef)).toEqual(after);

        // Someone changes one copy: an undo takes the other and leaves that one.
        const [changed, untouched] = copied.annotations;
        await page.annotations.update(changed!.ref, { subtype: 'square', color: '#16a34a' });
        const partial = await doc.apply({ undoOf: copied.meta.opId });
        expect(partial.items.some((item) => item.type === 'skipped')).toBe(true);
        const left = keysOf(await listed(doc, pageRef));
        expect(left).toContain(annotationKey(changed!.ref));
        expect(left.includes(annotationKey(untouched!.ref))).toBe(false);
      });
    });

    test('refuses before anything is written, and says what it left out', async () => {
      await withDocument(async (doc, pageRef) => {
        const page = doc.page(pageRef);
        const square = await create(page, { subtype: 'square', box: box(20) });
        const before = await listed(doc, pageRef);
        const missing: AnnotationRef = { kind: 'objectNumber', page: pageRef, objectNumber: 9999 };
        await expect(doc.annotations.copy([square.ref, missing])).rejects.toMatchObject({
          code: EngineErrorCode.NotFound,
        });
        await expect(
          doc.annotations.copy([square.ref], { page: toPageRef(9999) }),
        ).rejects.toMatchObject({ code: EngineErrorCode.NotFound });
        await expect(
          doc.annotations.copy([square.ref], { objectNumbers: [] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        expect(await listed(doc, pageRef)).toEqual(before);

        // A form field's box is the form's: left out, and the square still copied.
        await doc.forms.create({
          kind: 'text',
          name: 'city',
          widgets: [{ page: pageRef, rect: { x: 20, y: 400, width: 120, height: 24 } }],
        });
        const widget = (await doc.forms.list()).widgets[0]!;
        const mixed = await doc.annotations.copy([widget.ref, square.ref], { offset: OFFSET });
        expect(mixed.dropped).toEqual([{ ref: widget.ref, reason: 'widget' }]);
        expect(mixed.refMap.map((pair) => annotationKey(pair.from))).toEqual([
          annotationKey(square.ref),
        ]);
      });
    });

    test('a copy of more annotations than a bundle holds is refused, and writes nothing', async () => {
      await withDocument(async (doc, pageRef) => {
        const square = await create(doc.page(pageRef), { subtype: 'square', box: box(20) });
        const before = await listed(doc, pageRef);
        const max = DEFAULT_BUNDLE_LIMITS.items;
        const refs = Array.from({ length: max + 1 }, () => square.ref);
        await expect(doc.annotations.copy(refs)).rejects.toMatchObject({
          code: EngineErrorCode.PayloadTooLarge,
          details: { limit: 'items', max, value: max + 1 },
        });
        expect(await listed(doc, pageRef)).toEqual(before);
      });
    });

    test('a session without doc.download copies a stamp; one that may not read annotations copies nothing', async () => {
      if (!options.openScoped) return;
      const writer = await options.openScoped(engine, 'authoring', [
        'doc.open',
        'doc.render',
        'doc.annotate.modify',
      ]);
      try {
        const { pages } = await writer.pages.list();
        const pageRef = toPageRef(pages[0]!.ref.objectNumber);
        const page = writer.page(pageRef);
        const stamp = await create(
          page,
          { subtype: 'stamp', box: box(20) },
          { resources: { appearance: PNG_1X1 } },
        );
        // It may not take the drawing out of the engine...
        const refused = await page.annotations.downloadResource(stamp.ref, 'appearance').then(
          () => null,
          (error: unknown) => error,
        );
        expect(isPermissionRefusal(refused)).toBe(true);
        // ...and needs not: the copy places it inside.
        const result = await writer.annotations.copy([stamp.ref], { offset: OFFSET });
        expect(result.dropped).toEqual([]);
        expect(result.annotations[0]).toMatchObject({ subtype: 'stamp' });
      } finally {
        await writer.close();
      }

      const reader = await options.openScoped(engine, 'authoring', ['doc.open', 'doc.render']);
      try {
        const { pages } = await reader.pages.list();
        const ref: AnnotationRef = {
          kind: 'objectNumber',
          page: toPageRef(pages[0]!.ref.objectNumber),
          objectNumber: 1,
        };
        const refused = await reader.annotations.copy([ref]).then(
          () => null,
          (error: unknown) => error,
        );
        expect(isPermissionRefusal(refused)).toBe(true);
      } finally {
        await reader.close();
      }
    });
  });
}

/** What the engine alone gives an annotation: its identity, its attribution and its links. */
const ENGINE_GIVEN = new Set([
  'ref',
  'nm',
  'author',
  'createdAt',
  'modifiedAt',
  'userId',
  'createdBy',
  'modifiedBy',
  'importedBy',
  'groupId',
  'reply',
  'popup',
]);

/**
 * Where `left` and `right` differ, as paths. Numbers are the same within a
 * hundredth of a point, which a round trip through the file keeps.
 */
function differences(left: unknown, right: unknown, path = ''): string[] {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) <= 0.01 ? [] : [`${path}: ${left} is not ${right}`];
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return left === right
      ? []
      : [`${path}: ${JSON.stringify(left)} is not ${JSON.stringify(right)}`];
  }
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names].flatMap((name) =>
    differences(
      (left as Record<string, unknown>)[name],
      (right as Record<string, unknown>)[name],
      path ? `${path}.${name}` : name,
    ),
  );
}

/** An annotation's own data: what a copy carries, apart from what the engine gives it. */
function carried(annotation: Annotation): unknown {
  return Object.fromEntries(Object.entries(annotation).filter(([name]) => !ENGINE_GIVEN.has(name)));
}

/** Where an annotation is: its `rect` and, for a kind with one, its `box`. */
function geometryOf(annotation: Annotation): unknown {
  const { rect, box } = annotation as Annotation & { box?: unknown };
  return { rect, box };
}
