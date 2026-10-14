import { UUID_V7 } from './names';
import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { PageBox } from '../geometry/pageSpace';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { toPageRef, type PageRef } from '../identity/PageRef';

/**
 * Two pages and a form. The first page holds a merged text field and widget
 * (object 5, `merged`), the second nothing.
 */
export const OBJECT_NUMBER_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /DA (/Helv 0 Tf 0 g) ' +
    '/DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Annots [5 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>',
  '<< /Type /Annot /Subtype /Widget /FT /Tx /T (merged) /Rect [10 10 110 30] /P 3 0 R >>',
]);

const MERGED_FIELD = 5;

export interface ObjectNumberConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open {@link OBJECT_NUMBER_FIXTURE_PDF}, fresh for each call, with write access. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

const box = (x: number): PageBox => ({ x, y: 120, width: 40, height: 30 });

/**
 * Names at birth, and the order and ids of writes:
 *
 * - A create that names an object number from the document's pool makes its
 *   object at exactly that number, so its ref is known before the engine
 *   answers; what the engine makes for itself lands elsewhere.
 * - A number the session doesn't hold is refused `not-held`; one a call uses
 *   twice is `taken`. A refused call changes nothing.
 * - Writes made without waiting apply in the order they were made: a page
 *   named at birth takes an annotation at once.
 * - Every event of a write carries its `opId` as `origin.tx`.
 */
export function runObjectNumberConformance(
  runner: ConformanceTestRunner,
  opts: ObjectNumberConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`object number conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDocument = async (
      body: (doc: DocumentHandle, pages: readonly PageRef[]) => Promise<void>,
    ) => {
      const doc = await opts.open(engine);
      try {
        const { pages } = await doc.pages.list();
        await body(
          doc,
          pages.map((page) => toPageRef(page.ref.objectNumber)),
        );
      } finally {
        await doc.close();
      }
    };

    const take = async (doc: DocumentHandle, count: number): Promise<number[]> => {
      await doc.objectNumbers.reserve(count);
      return Array.from({ length: count }, () => doc.objectNumbers.take()!);
    };

    const refAt = (page: PageRef, objectNumber: number): AnnotationRef => ({
      kind: 'objectNumber',
      page,
      objectNumber,
    });

    test('the pool hands out numbers, each once', async () => {
      await withDocument(async (doc) => {
        await doc.objectNumbers.reserve(100);
        expect(doc.objectNumbers.held >= 100).toBe(true);
        const numbers = Array.from({ length: 100 }, () => doc.objectNumbers.take());
        expect(numbers.every((number) => Number.isInteger(number) && number! > 0)).toBe(true);
        expect(new Set(numbers).size).toBe(100);
      });
    });

    test('a create at a number lands at it; one without a number lands elsewhere', async () => {
      await withDocument(async (doc, [page]) => {
        const [first, second] = await take(doc, 2);
        const square = await doc
          .page(page!)
          .annotations.create({ subtype: 'square', box: box(20) }, { objectNumber: first });
        expect(square.annotation.ref).toEqual(refAt(page!, first!));
        const free = await doc.page(page!).annotations.create({ subtype: 'circle', box: box(80) });
        const freeNumber =
          free.annotation.ref.kind === 'objectNumber' ? free.annotation.ref.objectNumber : null;
        expect([first, second].includes(freeNumber!)).toBe(false);
        const circle = await doc
          .page(page!)
          .annotations.create({ subtype: 'circle', box: box(140) }, { objectNumber: second });
        expect(circle.annotation.ref).toEqual(refAt(page!, second!));
        const { annotations } = await doc.page(page!).annotations.list();
        const listed = annotations.map((annotation) => annotationKey(annotation.ref));
        for (const number of [first, second]) {
          expect(listed).toContain(annotationKey(refAt(page!, number!)));
        }
      });
    });

    test('a number the session does not hold is not-held; one a call uses twice is taken', async () => {
      await withDocument(async (doc, [page]) => {
        const [used, twice] = await take(doc, 2);
        await doc
          .page(page!)
          .annotations.create({ subtype: 'square', box: box(20) }, { objectNumber: used });
        const before = await doc.pages.list();

        // Spent by the create above.
        await expect(
          doc
            .page(page!)
            .annotations.create({ subtype: 'square', box: box(80) }, { objectNumber: used }),
        ).rejects.toMatchObject({
          code: EngineErrorCode.ObjectNumberUnavailable,
          details: { objectNumber: used, reason: 'not-held' },
        });
        // Never handed out.
        await expect(
          doc
            .page(page!)
            .annotations.create({ subtype: 'square', box: box(80) }, { objectNumber: 7_999_999 }),
        ).rejects.toMatchObject({
          code: EngineErrorCode.ObjectNumberUnavailable,
          details: { objectNumber: 7_999_999, reason: 'not-held' },
        });
        await expect(
          doc.pages.insertBlank({ size: { width: 200, height: 200 }, count: 2 }, undefined, {
            objectNumbers: [twice!, twice!],
          }),
        ).rejects.toMatchObject({
          code: EngineErrorCode.ObjectNumberUnavailable,
          details: { objectNumber: twice, reason: 'taken' },
        });

        expect(await doc.pages.list()).toEqual(before);
        // Refused calls spent nothing: the number still makes a page.
        const inserted = await doc.pages.insertBlank(
          { size: { width: 200, height: 200 } },
          undefined,
          { objectNumbers: [twice!] },
        );
        expect(inserted.insertedPages).toEqual([toPageRef(twice!)]);
      });
    });

    test('a page named at birth takes an annotation at once, in call order', async () => {
      await withDocument(async (doc) => {
        const [pageNumber, annotationNumber] = await take(doc, 2);
        const page = toPageRef(pageNumber!);
        const inserting = doc.pages.insertBlank({ size: { width: 200, height: 200 } }, undefined, {
          objectNumbers: [pageNumber!],
        });
        // Not waiting for the page: the create comes after it.
        const creating = doc
          .page(page)
          .annotations.create(
            { subtype: 'square', box: box(20) },
            { objectNumber: annotationNumber },
          );
        const [inserted, created] = await Promise.all([inserting, creating]);
        expect(inserted.insertedPages).toEqual([page]);
        expect(created.annotation.ref).toEqual(refAt(page, annotationNumber!));
        expect(created.annotation.nm).toMatch(UUID_V7);
      });
    });

    test('writes made without waiting apply in the order they were made', async () => {
      await withDocument(async (doc, [page]) => {
        const [number] = await take(doc, 1);
        const ref = refAt(page!, number!);
        const events: string[] = [];
        doc.events.subscribe((event) => events.push(event.type));
        const annotations = doc.page(page!).annotations;
        const writes = [
          annotations.create({ subtype: 'square', box: box(20) }, { objectNumber: number }),
          annotations.update(ref, { contents: 'first' }),
          annotations.update(ref, { contents: 'second' }),
        ];
        await Promise.all(writes);
        expect(events).toEqual([
          'annotations.created',
          'annotations.updated',
          'annotations.updated',
        ]);
        const { annotations: now } = await annotations.list();
        expect(
          now.find(
            (annotation) =>
              annotation.ref.kind === 'objectNumber' && annotation.ref.objectNumber === number,
          )?.contents,
        ).toBe('second');
      });
    });

    test('a field and its widgets at numbers; a merged field splits to a number', async () => {
      await withDocument(async (doc, [first, second]) => {
        const [field, left, right, widget, split] = await take(doc, 5);
        const created = await doc.forms.create(
          {
            family: 'text',
            name: 'billing.name',
            widgets: [
              { page: second!, rect: box(20) },
              { page: second!, rect: box(80) },
            ],
          },
          { objectNumber: field, widgetObjectNumbers: [left!, right!] },
        );
        expect(created.field.ref).toEqual({ kind: 'objectNumber', objectNumber: field });
        expect(created.field.widgets.map((w) => w.objectNumber)).toEqual([left, right]);
        // Widgets are annotation rows of the form: named like any other annotation.
        for (const number of [left, right]) {
          const read = created.widgets.find(
            (w) => w.ref.kind === 'objectNumber' && w.ref.objectNumber === number,
          );
          expect(read?.nm).toMatch(UUID_V7);
          expect(read?.page).toEqual(second);
        }

        const added = await doc.forms.addWidget(
          { kind: 'objectNumber', objectNumber: MERGED_FIELD },
          { page: first!, rect: box(140) },
          { objectNumber: widget, splitObjectNumber: split },
        );
        expect(added.field.ref).toEqual({ kind: 'objectNumber', objectNumber: MERGED_FIELD });
        expect(added.field.widgets.map((w) => w.objectNumber).sort((a, b) => a - b)).toEqual(
          [split!, widget!].sort((a, b) => a - b),
        );
      });
    });

    test("every event of a write carries the write's opId", async () => {
      await withDocument(async (doc, [page]) => {
        const events: DocumentEvent[] = [];
        doc.events.subscribe((event) => events.push(event));
        const created = await doc
          .page(page!)
          .annotations.create({ subtype: 'square', box: box(20) }, { opId: 'op-create' });
        await doc.page(page!).annotations.update(created.annotation.ref, { contents: 'x' });
        await doc.pages.insertBlank({ size: { width: 200, height: 200 } }, undefined, {
          opId: 'op-insert',
        });
        const [create, update, insert] = events.map((event) =>
          event.type === 'stream.desynced' ? null : event.origin.tx,
        );
        expect(events).toHaveLength(3);
        expect(create).toEqual({ id: 'op-create', index: 0, count: 1 });
        // Without an opId, the engine names the write.
        expect(update).toMatchObject({ index: 0, count: 1 });
        expect(typeof update!.id === 'string' && update!.id.length > 0).toBe(true);
        expect(insert).toEqual({ id: 'op-insert', index: 0, count: 1 });
      });
    });

    test('an opId no header could carry is refused, and nothing is written', async () => {
      await withDocument(async (doc, [page]) => {
        const before = await doc.page(page!).annotations.list();
        for (const opId of ['', 'has space', 'é', 'x'.repeat(256)]) {
          await expect(
            doc.page(page!).annotations.create({ subtype: 'square', box: box(20) }, { opId }),
          ).rejects.toMatchObject({
            code: EngineErrorCode.InvalidArg,
            details: { field: 'opId' },
          });
        }
        expect(await doc.page(page!).annotations.list()).toEqual(before);
      });
    });
  });
}
