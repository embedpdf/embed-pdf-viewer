import type { ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { toPageRef, type PageRef } from '../identity/PageRef';

export interface PageCopyConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `CHANGE_FIXTURE_PDF` each time it is called, under `id`. */
  open: (engine: Engine, id: string) => Promise<DocumentHandle>;
}

/** The fixture's two pages: the first holds annotations and the field `name`, the second is empty. */
const FIRST = toPageRef(3);
const SECOND = toPageRef(4);

/**
 * `pages.copy` on every engine (`doc.pages.copy`):
 *
 *   1. A copy reads as its page does, under the number it was given, and
 *      brings the page's annotations, and its form field as a field of its
 *      own: a name the document uses gets the first free `name_2`.
 *   2. Undo takes the copy and its field away; redo brings both back under
 *      the same numbers; undo again takes them away again.
 *   3. A page named twice is copied twice.
 *   4. A page the document doesn't have, or a number the session doesn't
 *      hold, is refused, and nothing changes.
 */
export function runPageCopyConformance(
  runner: ConformanceTestRunner,
  opts: PageCopyConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`page copy conformance: ${opts.label}`, () => {
    let engine: Engine;
    let opened = 0;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withDocument = async (run: (doc: DocumentHandle) => Promise<void>): Promise<void> => {
      const doc = await opts.open(engine, `page-copy-${++opened}`);
      try {
        await run(doc);
      } finally {
        await doc.close();
      }
    };
    const take = async (doc: DocumentHandle, count: number): Promise<number[]> => {
      await doc.objectNumbers.reserve(count);
      return Array.from({ length: count }, () => doc.objectNumbers.take()!);
    };
    const orderOf = async (doc: DocumentHandle) =>
      (await doc.pages.list()).pages.map((page) => page.ref.objectNumber);
    /** The fields by name: their values, and the pages their widgets are on. */
    const fieldsOf = async (doc: DocumentHandle) => {
      const { fields } = await doc.forms.list();
      return Object.fromEntries(
        fields.map((field) => [
          field.name,
          {
            value: 'value' in field ? field.value : null,
            pages: field.widgets.map((widget) => widget.page?.objectNumber ?? null),
          },
        ]),
      );
    };
    const annotationCountOf = async (doc: DocumentHandle, page: PageRef) =>
      (await doc.page(page).annotations.list()).annotations.length;

    test('a copy reads as its page does and brings its annotations and its field, renamed', async () => {
      await withDocument(async (doc) => {
        const [copy] = await take(doc, 1);
        const before = await doc.pages.list();
        const result = await doc.pages.copy([FIRST], 'end', { objectNumbers: [copy!] });
        expect(result.insertedPages).toEqual([toPageRef(copy!)]);
        expect(await orderOf(doc)).toEqual([3, 4, copy]);

        const source = before.pages[0]!;
        const copied = result.layout.pages[2]!;
        expect({ ...copied, index: source.index, ref: source.ref }).toEqual(source);
        expect(await annotationCountOf(doc, toPageRef(copy!))).toBe(
          await annotationCountOf(doc, FIRST),
        );
        expect(await fieldsOf(doc)).toEqual({
          name: { value: 'Ann', pages: [3] },
          name_2: { value: 'Ann', pages: [copy] },
        });
      });
    });

    test('undo takes the copy and its field away, redo brings them back, undo again', async () => {
      await withDocument(async (doc) => {
        const [copy] = await take(doc, 1);
        const original = await fieldsOf(doc);
        const applied = await doc.apply({
          ops: [{ type: 'pages.copy', pages: [FIRST], objectNumbers: [copy!] }],
        });
        const copied = await fieldsOf(doc);

        const undo = await doc.apply({ undoOf: applied.meta.opId });
        expect(await orderOf(doc)).toEqual([3, 4]);
        expect(await fieldsOf(doc)).toEqual(original);

        const redo = await doc.apply({ undoOf: undo.meta.opId });
        expect(await orderOf(doc)).toEqual([3, 4, copy]);
        expect(await fieldsOf(doc)).toEqual(copied);
        expect(await annotationCountOf(doc, toPageRef(copy!))).toBe(
          await annotationCountOf(doc, FIRST),
        );

        await doc.apply({ undoOf: redo.meta.opId });
        expect(await orderOf(doc)).toEqual([3, 4]);
        expect(await fieldsOf(doc)).toEqual(original);
      });
    });

    test('a page named twice is copied twice, in the order given', async () => {
      await withDocument(async (doc) => {
        const numbers = await take(doc, 3);
        await doc.pages.copy([SECOND, FIRST, SECOND], { after: FIRST }, { objectNumbers: numbers });
        expect(await orderOf(doc)).toEqual([3, ...numbers, 4]);
      });
    });

    test('refused: a page the document does not have, or a number the session does not hold', async () => {
      await withDocument(async (doc) => {
        const [copy] = await take(doc, 1);
        await expect(
          doc.pages.copy([toPageRef(9_999)], 'end', { objectNumbers: [copy!] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.NotFound });
        await expect(
          doc.pages.copy([FIRST], 'end', { objectNumbers: [copy! + 1_000] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.ObjectNumberUnavailable });
        expect(await orderOf(doc)).toEqual([3, 4]);
        expect(Object.keys(await fieldsOf(doc))).toEqual(['name']);
      });
    });
  });
}
