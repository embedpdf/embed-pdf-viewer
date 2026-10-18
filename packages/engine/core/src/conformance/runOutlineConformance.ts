import { pdfOf } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type {
  DocumentOutline,
  OutlineItem,
  OutlineItemDraft,
  OutlineItemPatch,
} from '../dto/DocumentOutline';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { DocumentEvent } from '../events/DocumentEvent';
import { toOutlineItemRef, type OutlineItemRef } from '../identity/OutlineItemRef';
import { toPageRef } from '../identity/PageRef';
import type { OutlineOrder } from '../mutation/OutlineMutationResults';
import { outlineItemAfter, outlineItemOfDraft } from '../outline/predict';

/**
 * Two pages of 300 × 300 and an outline, five items showing when it opens:
 *
 * - A (6), open: to page 3 at (20, 280) in the file; its child A1 (10) fits page 4.
 * - B (7): red and bold, a URI action.
 * - C (8), closed: the named destination `chapter-two` (page 4, `/FitH` 250);
 *   its child C1 (11) goes nowhere.
 * - D (9): a JavaScript action.
 */
export const OUTLINE_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R /Names << /Dests 12 0 R >> >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>',
  '<< /Type /Outlines /First 6 0 R /Last 9 0 R /Count 5 >>',
  '<< /Title (A) /Parent 5 0 R /Next 7 0 R /First 10 0 R /Last 10 0 R /Count 1 ' +
    '/Dest [3 0 R /XYZ 20 280 null] >>',
  '<< /Title (B) /Parent 5 0 R /Prev 6 0 R /Next 8 0 R /C [1 0 0] /F 2 ' +
    '/A << /S /URI /URI (https://example.com/) >> >>',
  '<< /Title (C) /Parent 5 0 R /Prev 7 0 R /Next 9 0 R /First 11 0 R /Last 11 0 R ' +
    '/Count -1 /Dest (chapter-two) >>',
  '<< /Title (D) /Parent 5 0 R /Prev 8 0 R /A << /S /JavaScript /JS (app.alert\\(1\\)) >> >>',
  '<< /Title (A1) /Parent 6 0 R /Dest [4 0 R /Fit] >>',
  '<< /Title (C1) /Parent 8 0 R >>',
  '<< /Names [(chapter-two) [4 0 R /FitH 250]] >>',
]);

/**
 * An outline a write never made: One (4) and Two (5), whose `/Next` comes
 * back to One, and after One a direct item no one can name.
 */
export const BROKEN_OUTLINE_FIXTURE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R >>',
  '<< /Type /Pages /Kids [6 0 R] /Count 1 >>',
  '<< /Type /Outlines /First 4 0 R /Last 5 0 R /Count 2 >>',
  '<< /Title (One) /Parent 3 0 R /Next 5 0 R /First << /Title (Direct) >> >>',
  '<< /Title (Two) /Parent 3 0 R /Prev 4 0 R /Next 4 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>',
]);

const A = toOutlineItemRef(6);
const B = toOutlineItemRef(7);
const C = toOutlineItemRef(8);
const D = toOutlineItemRef(9);
const A1 = toOutlineItemRef(10);
const C1 = toOutlineItemRef(11);
const FIRST_PAGE = toPageRef(3);
const SECOND_PAGE = toPageRef(4);

export interface OutlineConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open `bytes`, one of the fixtures here, fresh for each call, with write access. */
  open: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
  /** Open `bytes` with the rights to open and read it only (`doc.open`, `doc.render`). */
  openReadOnly: (engine: Engine, bytes: Uint8Array) => Promise<DocumentHandle>;
}

const titles = (outline: DocumentOutline) => outline.items.map((item) => item.title);
const numberOf = (ref: OutlineItemRef | null) => ref?.objectNumber ?? null;
const childrenOf = (outline: DocumentOutline, parent: OutlineItemRef | null) =>
  outline.items
    .filter((item) => numberOf(item.parent) === numberOf(parent))
    .map((item) => item.title);
const itemOf = (outline: DocumentOutline, ref: OutlineItemRef): OutlineItem | undefined =>
  outline.items.find((item) => item.ref.objectNumber === ref.objectNumber);
/** The children a write's orders give `parent`, by object number. */
const orderOf = (orders: readonly OutlineOrder[], parent: OutlineItemRef | null) =>
  orders
    .find((order) => numberOf(order.parent) === numberOf(parent))
    ?.children.map((ref) => ref.objectNumber);

/**
 * The document's outline (`doc.outline`), the same on every engine:
 *
 * - A read lists every item depth first, with its parent, its target read the
 *   way a link's is (in page space, a named destination resolved), its `/A`
 *   tree, its colour and style, and whether it opens.
 * - Writes name items by object number and places by neighbour; moves keep
 *   subtrees and numbers; deletes take the items under an item with it, and
 *   an undo brings the same items back.
 * - Each write publishes its `outline.*` event; without `doc.outline.modify`
 *   every write is refused and reading still works.
 * - A broken outline reads what it can and says `incomplete`.
 */
export function runOutlineConformance(
  runner: ConformanceTestRunner,
  opts: OutlineConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`outline conformance: ${opts.label}`, () => {
    let engine: Engine;

    beforeAll(async () => {
      engine = await opts.makeEngine();
    });

    afterAll(async () => {
      if (engine) await engine.destroy();
    });

    const withOutline = async (
      body: (doc: DocumentHandle) => Promise<void>,
      bytes = OUTLINE_FIXTURE_PDF,
    ) => {
      const doc = await opts.open(engine, bytes.slice());
      try {
        await body(doc);
      } finally {
        await doc.close();
      }
    };

    test('reads every item depth first, with its target, its look and whether it opens', async () => {
      await withOutline(async (doc) => {
        const outline = await doc.outline.get();
        expect(outline.incomplete).toBe(false);
        expect(titles(outline)).toEqual(['A', 'A1', 'B', 'C', 'C1', 'D']);
        expect(itemOf(outline, A)).toMatchObject({
          parent: null,
          open: true,
          color: null,
          bold: false,
          italic: false,
          action: null,
          target: {
            kind: 'goto',
            destination: { kind: 'xyz', page: FIRST_PAGE, x: 20, y: 20 },
          },
        });
        expect(itemOf(outline, A1)).toMatchObject({
          parent: A,
          open: false,
          target: { kind: 'goto', destination: { kind: 'fit', page: SECOND_PAGE } },
        });
        expect(itemOf(outline, B)).toMatchObject({
          color: '#ff0000',
          bold: true,
          target: { kind: 'uri', uri: 'https://example.com/' },
          action: { incomplete: false, root: { type: 'uri', uri: 'https://example.com/' } },
        });
        // A named destination, resolved, measured from the page's top.
        expect(itemOf(outline, C)).toMatchObject({
          open: false,
          target: { kind: 'goto', destination: { kind: 'fitH', page: SECOND_PAGE, y: 50 } },
        });
        expect(itemOf(outline, C1)).toMatchObject({ parent: C, target: null, action: null });
        expect(itemOf(outline, D)).toMatchObject({
          target: { kind: 'javascript' },
          action: { root: { type: 'javascript', script: 'app.alert(1)' } },
        });
      });
    });

    test('a document without an outline reads an empty one', async () => {
      const bytes = pdfOf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>',
      ]);
      await withOutline(async (doc) => {
        expect(await doc.outline.get()).toEqual({ items: [], incomplete: false });
        // The first item makes the outline.
        await doc.outline.create({ title: 'First' });
        expect(titles(await doc.outline.get())).toEqual(['First']);
      }, bytes);
    });

    test('a create goes to its place, under its parent, at the number it names', async () => {
      await withOutline(async (doc) => {
        await doc.objectNumbers.reserve(1);
        const number = doc.objectNumbers.take()!;
        const first = await doc.outline.create(
          { title: 'A0', target: { kind: 'goto', destination: { kind: 'fit', page: FIRST_PAGE } } },
          { parent: A, position: 'start', objectNumber: number },
        );
        expect(first.item).toMatchObject({ ref: toOutlineItemRef(number), parent: A, title: 'A0' });
        expect(first.order).toEqual({ parent: A, children: [toOutlineItemRef(number), A1] });
        const after = await doc.outline.create(
          { title: 'B2', color: '#00ff00' },
          { position: { after: B } },
        );
        expect(after.order.parent).toBeNull();
        expect(after.order.children.map((ref) => ref.objectNumber)).toEqual([
          6,
          7,
          after.item.ref.objectNumber,
          8,
          9,
        ]);
        const outline = await doc.outline.get();
        expect(titles(outline)).toEqual(['A', 'A0', 'A1', 'B', 'B2', 'C', 'C1', 'D']);
        expect(itemOf(outline, after.item.ref)).toMatchObject({ color: '#00ff00', target: null });
      });
    });

    test('an update writes the fields it names and leaves the others', async () => {
      await withOutline(async (doc) => {
        const renamed = await doc.outline.update(B, { title: 'Bee', italic: true });
        expect(renamed.item).toMatchObject({
          title: 'Bee',
          italic: true,
          bold: true,
          color: '#ff0000',
          target: { kind: 'uri' },
        });
        const cleared = await doc.outline.update(B, { color: null, target: null, bold: false });
        expect(cleared.item).toMatchObject({
          color: null,
          target: null,
          bold: false,
          italic: true,
        });
        const retargeted = await doc.outline.update(C1, {
          target: { kind: 'goto', destination: { kind: 'xyz', page: SECOND_PAGE, x: 10, y: 40 } },
        });
        expect(retargeted.item.target).toMatchObject({
          kind: 'goto',
          destination: { kind: 'xyz', page: SECOND_PAGE, x: 10, y: 40 },
        });
        expect(retargeted.item.action).toMatchObject({ root: { type: 'goto' } });
      });
    });

    test('open takes effect on an item with children; a leaf has no open state', async () => {
      await withOutline(async (doc) => {
        expect((await doc.outline.update(C, { open: true })).item.open).toBe(true);
        expect((await doc.outline.update(A, { open: false })).item.open).toBe(false);
        expect((await doc.outline.update(D, { open: true })).item.open).toBe(false);
      });
    });

    test('a write answers what the prediction rules say it leaves', async () => {
      await withOutline(async (doc) => {
        const drafts: OutlineItemDraft[] = [
          { title: 'Plain' },
          {
            title: 'To a spot',
            target: {
              kind: 'goto',
              destination: { kind: 'xyz', page: SECOND_PAGE, x: 10, y: 40, zoom: null },
            },
            color: '#00AAFF',
            bold: true,
          },
          {
            title: 'To a site',
            target: { kind: 'uri', uri: 'https://example.com/' },
            italic: true,
          },
          { title: 'Next', target: { kind: 'named', name: 'NextPage' } },
          {
            title: 'Fit',
            target: { kind: 'goto', destination: { kind: 'fit', page: FIRST_PAGE } },
          },
        ];
        for (const draft of drafts) {
          const { item } = await doc.outline.create(draft, { parent: C });
          expect(item).toEqual(outlineItemOfDraft(item.ref, C, draft));
        }
        const before = itemOf(await doc.outline.get(), B)!;
        const patches: OutlineItemPatch[] = [
          { title: 'Bee', italic: true },
          { color: '#ABCDEF' },
          { color: null, target: null, bold: false },
          { target: { kind: 'named', name: 'LastPage' } },
          { open: true },
        ];
        let current = before;
        for (const patch of patches) {
          const { item } = await doc.outline.update(B, patch);
          expect(item).toEqual(outlineItemAfter(current, patch, false));
          current = item;
        }
        const parent = itemOf(await doc.outline.get(), C)!;
        const { item: opened } = await doc.outline.update(C, { open: true });
        expect(opened).toEqual(outlineItemAfter(parent, { open: true }, true));
      });
    });

    test('a move takes items together with the items under them, and names both parents', async () => {
      await withOutline(async (doc) => {
        const moved = await doc.outline.move([C, D], A, { after: A1 });
        expect(moved.meta.changed).toEqual([C, D]);
        expect(orderOf(moved.orders, null)).toEqual([6, 7]);
        expect(orderOf(moved.orders, A)).toEqual([10, 8, 9]);
        const outline = await doc.outline.get();
        expect(titles(outline)).toEqual(['A', 'A1', 'C', 'C1', 'D', 'B']);
        expect(itemOf(outline, C)).toMatchObject({ parent: A, open: false });
        expect(itemOf(outline, C1)).toMatchObject({ parent: C });
        // Back to the top, first.
        await doc.outline.move([C], null, 'start');
        expect(childrenOf(await doc.outline.get(), null)).toEqual(['C', 'A', 'B']);
      });
    });

    test('a move or a create that can not be made is refused', async () => {
      await withOutline(async (doc) => {
        const invalid = { code: EngineErrorCode.InvalidArg };
        const notFound = { code: EngineErrorCode.NotFound };
        await expect(doc.outline.move([A], A1, 'end')).rejects.toMatchObject(invalid);
        await expect(doc.outline.move([A], A, 'end')).rejects.toMatchObject(invalid);
        await expect(doc.outline.move([A, B], null, { after: B })).rejects.toMatchObject(invalid);
        await expect(doc.outline.move([A, A], null, 'end')).rejects.toMatchObject(invalid);
        await expect(doc.outline.move([A, A1], null, 'end')).rejects.toMatchObject(invalid);
        await expect(doc.outline.move([A], null, { after: C1 })).rejects.toMatchObject(notFound);
        await expect(doc.outline.move([toOutlineItemRef(99)], null, 'end')).rejects.toMatchObject(
          notFound,
        );
        await expect(
          doc.outline.create({ title: 'x' }, { parent: toOutlineItemRef(3) }),
        ).rejects.toMatchObject(notFound);
        expect(titles(await doc.outline.get())).toEqual(['A', 'A1', 'B', 'C', 'C1', 'D']);
      });
    });

    test('a delete takes the items under the item, and an undo brings the same ones back', async () => {
      await withOutline(async (doc) => {
        const before = await doc.outline.get();
        const deleted = await doc.outline.delete(C);
        expect(deleted.meta.changed).toEqual([C, C1]);
        expect(titles(await doc.outline.get())).toEqual(['A', 'A1', 'B', 'D']);
        const undo = await doc.apply({ undoOf: deleted.meta.opId });
        expect(undo.items.map((item) => item.type)).toEqual(['outline.restore']);
        expect(await doc.outline.get()).toEqual(before);
      });
    });

    test('expect refuses a change whose assumption does not hold', async () => {
      await withOutline(async (doc) => {
        await expect(
          doc.apply({
            ops: [
              {
                type: 'outline.update',
                ref: B,
                patch: { title: 'Bee' },
                expect: { title: 'Not B' },
              },
            ],
          }),
        ).rejects.toMatchObject({ code: EngineErrorCode.ChangeConflict });
        expect(itemOf(await doc.outline.get(), B)?.title).toBe('B');
      });
    });

    test('each write publishes its outline event, with its result', async () => {
      await withOutline(async (doc) => {
        const events: DocumentEvent[] = [];
        const stop = doc.events.subscribe((event) => events.push(event));
        let created: OutlineItemRef;
        try {
          created = (await doc.outline.create({ title: 'New' }, { parent: C })).item.ref;
          await doc.outline.update(created, { title: 'Newer' });
          await doc.outline.move([created], null, 'end');
          await doc.outline.delete(created);
        } finally {
          stop();
        }
        const outline = events.filter((event) => event.type.startsWith('outline.'));
        expect(outline.map((event) => event.type)).toEqual([
          'outline.created',
          'outline.updated',
          'outline.moved',
          'outline.deleted',
        ]);
        expect(outline[0]).toMatchObject({ item: { title: 'New', parent: C } });
        expect(outline[1]).toMatchObject({ item: { title: 'Newer' } });
        expect(outline[2]).toMatchObject({ meta: { changed: [created] } });
        expect(outline[3]).toMatchObject({ deleted: [created] });
      });
    });

    test('without doc.outline.modify every write is refused; reading still works', async () => {
      const doc = await opts.openReadOnly(engine, OUTLINE_FIXTURE_PDF.slice());
      try {
        expect(titles(await doc.outline.get())).toEqual(['A', 'A1', 'B', 'C', 'C1', 'D']);
        const denied = { code: EngineErrorCode.Forbidden };
        await expect(doc.outline.create({ title: 'x' })).rejects.toMatchObject(denied);
        await expect(doc.outline.update(A, { title: 'x' })).rejects.toMatchObject(denied);
        await expect(doc.outline.move([A], null, 'end')).rejects.toMatchObject(denied);
        await expect(doc.outline.delete(A)).rejects.toMatchObject(denied);
      } finally {
        await doc.close();
      }
    });

    test('an item whose page is gone keeps its place and goes nowhere it can be followed', async () => {
      await withOutline(async (doc) => {
        await doc.pages.delete([FIRST_PAGE]);
        const outline = await doc.outline.get();
        expect(titles(outline)).toEqual(['A', 'A1', 'B', 'C', 'C1', 'D']);
        expect(itemOf(outline, A)?.target).toEqual({ kind: 'unsupported' });
      });
    });

    test('a broken outline reads what it can and says incomplete', async () => {
      await withOutline(async (doc) => {
        const outline = await doc.outline.get();
        expect(outline.incomplete).toBe(true);
        expect(titles(outline)).toEqual(['One', 'Two']);
        // What can be named can still be written.
        await doc.outline.update(toOutlineItemRef(5), { title: 'Second' });
        expect(titles(await doc.outline.get())).toEqual(['One', 'Second']);
      }, BROKEN_OUTLINE_FIXTURE_PDF);
    });
  });
}
