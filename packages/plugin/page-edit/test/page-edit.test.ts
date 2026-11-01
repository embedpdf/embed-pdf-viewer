import { describe, expect, it, vi } from 'vitest';
import {
  DocumentsToken,
  toPageRef,
  type DocumentHandle,
  type DocumentsCapability,
  type PageInfo,
  type PageRef,
} from '@embedpdf/core';
import { createTestContext, type TestPage } from '@embedpdf/core/testing';
import {
  EngineError,
  EngineErrorCode,
  type Change,
  type ChangeOp,
  type ChangeResult,
} from '@embedpdf/engine-core/runtime';

import { createPageEditController } from '../src/controller';
import { initialPageEditModel } from '../src/model';

/**
 * The controller turns page edits into changes on the document's queue, with
 * three bits of its own: the relative `rotateBy` turned into the engine's
 * absolute rotation (one op per result, from the rotation the pages have once
 * the changes on their way apply), positions with their pages fixed, and
 * refusals before anything starts. It also keeps the page selection.
 */

const NEW_PAGES = [toPageRef(101), toPageRef(102)];

/** An answer to a change: one item per op, as the engine answers. */
function answerOf(change: Change): ChangeResult {
  const ops = 'ops' in change ? change.ops : [];
  const meta = { affectedPages: [], cacheDelta: null, opId: 'op', undoable: true };
  return {
    items: ops.map((op) => ({
      type: op.type,
      ...(op.type === 'pages.insert' || op.type === 'pages.insertBlank' || op.type === 'pages.copy'
        ? { insertedPages: NEW_PAGES }
        : {}),
      meta,
    })) as unknown as ChangeResult['items'],
    meta,
  };
}

/** A test context whose document answers changes at once, or holds them while `hold` is set. */
function harness(
  options: {
    pages?: readonly TestPage[];
    allows?: (permission: string) => boolean;
    otherDocument?: { pages: readonly PageInfo[]; handle: Partial<DocumentHandle> };
  } = {},
) {
  const held: { change: Change; resolve: () => void }[] = [];
  const control = { hold: false };
  const apply = vi.fn((change: Change) =>
    control.hold
      ? new Promise<ChangeResult>((resolve) =>
          held.push({ change, resolve: () => resolve(answerOf(change)) }),
        )
      : Promise.resolve(answerOf(change)),
  );
  const extract = vi.fn(async (_pages: PageRef[]): Promise<Uint8Array> => new Uint8Array([9]));
  const allows = vi.fn(options.allows ?? (() => true));
  // The session's names for new objects, as the engine reserves them.
  const pool = NEW_PAGES.map((page) => page.objectNumber).concat([103, 104]);
  const ctx = createTestContext({
    id: 'page-edit',
    state: initialPageEditModel(),
    pages: options.pages ?? [],
    doc: {
      security: { allows },
      apply,
      pages: { extract },
      objectNumbers: {
        take: () => pool.shift() ?? null,
        get held() {
          return pool.length;
        },
        reserve: vi.fn(async () => {}),
        onLost: () => () => {},
      },
    } as unknown as Partial<DocumentHandle>,
  });
  if (options.otherDocument) {
    const { pages, handle } = options.otherDocument;
    const documents = ctx.get(DocumentsToken);
    ctx.capabilities.set(DocumentsToken, {
      ...documents,
      listPages: (documentId?: string) =>
        documentId === 'other' ? pages : documents.listPages(documentId),
    } as DocumentsCapability);
    const documentHandle = ctx.documentHandle.bind(ctx);
    ctx.documentHandle = (documentId?: string) =>
      documentId === 'other' ? (handle as DocumentHandle) : documentHandle(documentId);
  }
  const pageEdit = ctx.connect(createPageEditController(ctx));
  /** Every change sent, its ops. */
  const sent = (): ChangeOp[][] =>
    apply.mock.calls.map(([change]) => ('ops' in change ? [...change.ops] : []));
  const last = (): ChangeOp[] => sent().at(-1) ?? [];
  return { ctx, pageEdit, apply, sent, last, held, control, extract, allows };
}

/** Three pages in display order, distinct sizes so defaults are observable. */
const THREE_PAGES: TestPage[] = [
  { ref: toPageRef(10), rotation: 0, size: { width: 100, height: 200 } },
  { ref: toPageRef(20), rotation: 90, size: { width: 300, height: 400 } },
  { ref: toPageRef(30), rotation: 0, size: { width: 500, height: 600 } },
];

const aborted = () => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};

describe('PageEditCapability', () => {
  describe('rotateBy', () => {
    it('adds the delta to each page’s rotation, wrapping past 360 and below 0', async () => {
      const { pageEdit, last } = harness({ pages: [{ ref: toPageRef(7), rotation: 270 }] });
      await pageEdit.rotateBy([toPageRef(7)], 90);
      expect(last()).toEqual([{ type: 'pages.rotate', pages: [toPageRef(7)], rotation: 0 }]);
      await pageEdit.rotateBy([toPageRef(7)], -90);
      expect(last()).toEqual([{ type: 'pages.rotate', pages: [toPageRef(7)], rotation: 180 }]);
    });

    it('is one change, with one op per rotation the pages end up with', async () => {
      const { ctx, pageEdit, sent, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.rotateBy([toPageRef(10), toPageRef(20), toPageRef(30)], 90);
      expect(sent()).toEqual([
        [
          { type: 'pages.rotate', pages: [toPageRef(10), toPageRef(30)], rotation: 90 },
          { type: 'pages.rotate', pages: [toPageRef(20)], rotation: 180 },
        ],
      ]);
      // Undoing it turns each page back to the rotation it had.
      const [change] = ctx.changes.pending();
      expect(change!.label).toEqual({ key: 'pages.rotate', count: 3 });
      expect(change!.undo).toEqual([
        { type: 'pages.rotate', pages: [toPageRef(10), toPageRef(30)], rotation: 0 },
        { type: 'pages.rotate', pages: [toPageRef(20)], rotation: 90 },
      ]);
    });

    it('turns from the rotation the changes on their way give a page: two quarter turns are a half', () => {
      const { pageEdit, sent, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.rotateBy([toPageRef(10)], 90);
      void pageEdit.rotateBy([toPageRef(10)], 90);
      void pageEdit.setRotation([toPageRef(20)], 270);
      void pageEdit.rotateBy([toPageRef(20)], -90);
      expect(sent().map((ops) => ops.map((op) => 'rotation' in op && op.rotation))).toEqual([
        [90],
        [180],
        [270],
        [180],
      ]);
    });

    it('takes a page index as well as a ref', async () => {
      const { pageEdit, last } = harness({ pages: THREE_PAGES });
      await pageEdit.rotateBy([1], 90);
      expect(last()).toEqual([{ type: 'pages.rotate', pages: [toPageRef(20)], rotation: 180 }]);
    });

    it('rejects a page the document does not have, and an empty page list', async () => {
      const { pageEdit, apply } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.rotateBy([toPageRef(99)], 90)).rejects.toMatchObject({
        code: 'not-found',
      });
      await expect(pageEdit.rotateBy([7], 90)).rejects.toMatchObject({ code: 'not-found' });
      await expect(pageEdit.rotateBy([], 90)).rejects.toMatchObject({ code: 'invalid-input' });
      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe('setRotation, reorder and delete', () => {
    it('setRotation gives every page the same rotation', async () => {
      const { pageEdit, last } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.setRotation([toPageRef(10), 2], 180)).resolves.toBeUndefined();
      expect(last()).toEqual([
        { type: 'pages.rotate', pages: [toPageRef(10), toPageRef(30)], rotation: 180 },
      ]);
    });

    it('reorder hands the engine the position, its page fixed when called', async () => {
      const { pageEdit, last } = harness({ pages: THREE_PAGES });
      const reorder = (pages: PageRef[], position: unknown) => [
        { type: 'pages.reorder', pages, position },
      ];
      await pageEdit.reorder([toPageRef(20), toPageRef(30)], 'start');
      expect(last()).toEqual(reorder([toPageRef(20), toPageRef(30)], 'start'));
      await pageEdit.reorder([toPageRef(10)], { after: toPageRef(20) });
      expect(last()).toEqual(reorder([toPageRef(10)], { after: toPageRef(20) }));
      await pageEdit.reorder([0], { before: toPageRef(30) });
      expect(last()).toEqual(reorder([toPageRef(10)], { before: toPageRef(30) }));
      await pageEdit.reorder([toPageRef(10)], 'end');
      expect(last()).toEqual(reorder([toPageRef(10)], 'end'));
    });

    it('reorder rejects a position page the document does not have', async () => {
      const { pageEdit, apply } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.reorder([0], { after: toPageRef(99) })).rejects.toMatchObject({
        code: 'not-found',
      });
      expect(apply).not.toHaveBeenCalled();
    });

    it('delete stages the pages, and refuses deleting every page', async () => {
      const { ctx, pageEdit, sent, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.delete([toPageRef(30), 0]);
      expect(ctx.changes.pending()[0]!.label).toEqual({ key: 'pages.delete', count: 2 });
      // The pages go at once: the one page left is all the user sees.
      expect(ctx.document()!.pages.map((page) => page.ref)).toEqual([toPageRef(20)]);
      await expect(pageEdit.delete([0])).rejects.toMatchObject({ code: 'invalid-input' });
      expect(sent()).toEqual([[{ type: 'pages.delete', pages: [toPageRef(30), toPageRef(10)] }]]);
    });

    it('a delete shows at once, and undoing it shows the pages back where they were', () => {
      const { ctx, pageEdit, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      const before = ctx.document()!.pages;
      void pageEdit.delete([toPageRef(30), toPageRef(10)]);
      expect(ctx.changes.pending()[0]!.undo).toEqual([
        {
          type: 'pages.restore',
          pages: [
            { page: before[0], after: null },
            { page: before[2], after: toPageRef(20) },
          ],
        },
      ]);
    });

    it('a move shows at once, and undoing it puts each page back after the page it followed', () => {
      const { ctx, pageEdit, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.reorder([toPageRef(10), toPageRef(20)], 'end');
      expect(ctx.document()!.pages.map((page) => page.ref)).toEqual([
        toPageRef(30),
        toPageRef(10),
        toPageRef(20),
      ]);
      expect(ctx.changes.pending()[0]!.undo).toEqual([
        { type: 'pages.reorder', pages: [toPageRef(10)], position: 'start' },
        { type: 'pages.reorder', pages: [toPageRef(20)], position: { after: toPageRef(10) } },
      ]);
    });

    it('a turn shows at once, and an index names the page as the user sees the pages', () => {
      const { ctx, pageEdit, last, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.reorder([toPageRef(30)], 'start');
      void pageEdit.rotateBy([0], 90);
      expect(last()).toEqual([{ type: 'pages.rotate', pages: [toPageRef(30)], rotation: 90 }]);
      expect(ctx.getPage(toPageRef(30))!.rotation).toBe(90);
    });

    it('rejects with the engine’s reason when the engine refuses the change', async () => {
      const { pageEdit, apply } = harness({ pages: THREE_PAGES });
      apply.mockImplementationOnce(() =>
        Promise.reject(new EngineError(EngineErrorCode.NotFound, 'no such page')),
      );
      await expect(pageEdit.delete([0])).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('inserts resolve the new pages', () => {
    const blank = (
      size: { width: number; height: number },
      count: number,
      position: unknown,
      objectNumbers = [101],
    ) => [{ type: 'pages.insertBlank', spec: { size, count }, position, objectNumbers }];

    it('insertBlank appends by default, sized like the last page', async () => {
      const { pageEdit, last } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.insertBlank()).resolves.toEqual({ pages: NEW_PAGES });
      expect(last()).toEqual(blank({ width: 500, height: 600 }, 1, 'end'));
    });

    it('insertBlank sizes a blank page in an empty document as Letter', async () => {
      const { pageEdit, last } = harness({ pages: [] });
      await pageEdit.insertBlank();
      expect(last()).toEqual(blank({ width: 612, height: 792 }, 1, 'end'));
    });

    it('insertBlank { after } and { before } go next to the page and match its size', async () => {
      const { pageEdit, last } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({ position: { after: toPageRef(20) } });
      expect(last()).toEqual(blank({ width: 300, height: 400 }, 1, { after: toPageRef(20) }));
      await pageEdit.insertBlank({ position: { before: toPageRef(10) } });
      expect(last()).toEqual(
        blank({ width: 100, height: 200 }, 1, { before: toPageRef(10) }, [102]),
      );
    });

    it("insertBlank 'start' goes first, sized like the first page", async () => {
      const { pageEdit, last } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({ position: 'start' });
      expect(last()).toEqual(blank({ width: 100, height: 200 }, 1, 'start'));
    });

    it('insertBlank takes an explicit size and count, and counts them in its label', async () => {
      const { ctx, pageEdit, last, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.insertBlank({
        size: { width: 612, height: 792 },
        count: 3,
        position: { after: toPageRef(10) },
      });
      expect(last()).toEqual(
        blank({ width: 612, height: 792 }, 3, { after: toPageRef(10) }, [101, 102, 103]),
      );
      expect(ctx.changes.pending()[0]!.label).toEqual({ key: 'pages.insertBlank', count: 3 });
    });

    it('a blank insert shows its pages at once, named from the pool, and undoing it deletes them', () => {
      const { ctx, pageEdit, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.insertBlank({ position: { after: toPageRef(10) } });
      expect(ctx.document()!.pages.map((page) => page.ref.objectNumber)).toEqual([10, 101, 20, 30]);
      expect(ctx.getPage(toPageRef(101))!.size).toEqual({ width: 100, height: 200 });
      expect(ctx.document()!.pendingPages.get(101)).toEqual({ look: 'blank' });
      expect(ctx.changes.pending()[0]!.undo).toEqual([
        { type: 'pages.delete', pages: [toPageRef(101)] },
      ]);
    });

    it('insertBlank rejects a position page the document does not have', async () => {
      const { pageEdit, apply } = harness({ pages: THREE_PAGES });
      await expect(
        pageEdit.insertBlank({ position: { after: toPageRef(99) } }),
      ).rejects.toMatchObject({ code: 'not-found' });
      expect(apply).not.toHaveBeenCalled();
    });

    it('insertFromBytes appends by default and goes next to a page the position names', async () => {
      const { ctx, pageEdit, last, control } = harness({ pages: THREE_PAGES });
      const bytes = new Uint8Array([1, 2, 3]);
      await expect(pageEdit.insertFromBytes(bytes)).resolves.toEqual({ pages: NEW_PAGES });
      expect(last()).toEqual([{ type: 'pages.insert', source: bytes, position: 'end' }]);
      control.hold = true;
      void pageEdit.insertFromBytes(bytes.buffer, { position: { after: toPageRef(20) } });
      expect(last()).toEqual([
        { type: 'pages.insert', source: bytes, position: { after: toPageRef(20) } },
      ]);
      // How many pages a PDF holds isn't known before the engine reads it.
      expect(ctx.changes.pending()[0]!.label).toEqual({ key: 'pages.insert' });
    });

    it('duplicate copies the pages right after the last of them, shown at once as they show', async () => {
      const { ctx, pageEdit, extract, sent, control } = harness({ pages: THREE_PAGES });
      control.hold = true;
      void pageEdit.rotateBy([toPageRef(10)], 90);
      void pageEdit.duplicate([toPageRef(10), 1]);
      // One change after the rotate, named from the pool: the copies show turned, pending.
      expect(sent()[1]).toEqual([
        {
          type: 'pages.copy',
          pages: [toPageRef(10), toPageRef(20)],
          position: { after: toPageRef(20) },
          objectNumbers: [101, 102],
        },
      ]);
      expect(ctx.document()!.pages.map((page) => page.ref.objectNumber)).toEqual([
        10, 20, 101, 102, 30,
      ]);
      expect(ctx.getPage(toPageRef(101))!.rotation).toBe(90);
      expect(ctx.document()!.pendingPages.get(102)).toEqual({ look: 'copy', of: toPageRef(20) });
      expect(ctx.changes.pending()[1]!.undo).toEqual([
        { type: 'pages.delete', pages: [toPageRef(101), toPageRef(102)] },
      ]);
      // Nothing leaves the document.
      expect(extract).not.toHaveBeenCalled();
    });

    it('insertFromDocument copies pages of another open document, by ref or index', async () => {
      const otherExtract = vi.fn(async (_pages: PageRef[]) => new Uint8Array([7]));
      const otherPages = [
        { ref: toPageRef(500), index: 0 },
        { ref: toPageRef(501), index: 1 },
      ] as unknown as PageInfo[];
      const { pageEdit, last } = harness({
        pages: THREE_PAGES,
        otherDocument: {
          pages: otherPages,
          handle: { pages: { extract: otherExtract } } as unknown as Partial<DocumentHandle>,
        },
      });
      await expect(
        pageEdit.insertFromDocument('other', [1, toPageRef(500)], { position: 'start' }),
      ).resolves.toEqual({ pages: NEW_PAGES });
      expect(otherExtract).toHaveBeenCalledWith([toPageRef(501), toPageRef(500)]);
      // Two pages come in: named first, so undoing the insert shows at once.
      expect(last()).toEqual([
        {
          type: 'pages.insert',
          source: new Uint8Array([7]),
          position: 'start',
          objectNumbers: [101, 102],
        },
      ]);
      await expect(pageEdit.insertFromDocument('other', [5])).rejects.toMatchObject({
        code: 'not-found',
      });
      await expect(pageEdit.insertFromDocument('closed', [0])).rejects.toMatchObject({
        code: 'not-found',
      });
    });

    it('extract resolves the new PDF’s bytes and changes nothing', async () => {
      const { pageEdit, extract, apply } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.extract([2])).resolves.toEqual(new Uint8Array([9]));
      expect(extract).toHaveBeenCalledWith([toPageRef(30)]);
      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe('the selection', () => {
    it('selects pages by ref or index, each once, in the order given', () => {
      const { pageEdit } = harness({ pages: THREE_PAGES });
      expect(pageEdit.getSelected()).toEqual([]);
      pageEdit.select([toPageRef(30), 0, toPageRef(30)]);
      expect(pageEdit.getSelected()).toEqual([toPageRef(30), toPageRef(10)]);
      pageEdit.select([]);
      expect(pageEdit.getSelected()).toEqual([]);
    });

    it('leaves out pages the document does not have, and is the same list until it changes', () => {
      const { pageEdit } = harness({ pages: THREE_PAGES });
      pageEdit.select([toPageRef(99), 7, 1]);
      const selection = pageEdit.getSelected();
      expect(selection).toEqual([toPageRef(20)]);
      expect(pageEdit.getSelected()).toBe(selection);
      pageEdit.select([1]);
      expect(pageEdit.getSelected()).toBe(selection);
    });
  });

  describe('permissions', () => {
    it('canEdit reads doc.pages.assemble and canExtract reads doc.download', () => {
      const { pageEdit } = harness({ allows: (permission) => permission === 'doc.download' });
      expect(pageEdit.canEdit()).toBe(false);
      expect(pageEdit.canExtract()).toBe(true);
    });

    it('refuses an edit without doc.pages.assemble, naming the permission, before anything is staged', async () => {
      const { ctx, pageEdit, apply } = harness({
        pages: THREE_PAGES,
        allows: (permission) => permission !== 'doc.pages.assemble',
      });
      await expect(pageEdit.rotateBy([0], 90)).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'doc.pages.assemble',
      });
      await expect(pageEdit.insertBlank()).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'doc.pages.assemble',
      });
      expect(apply).not.toHaveBeenCalled();
      expect(ctx.changes.hasPending()).toBe(false);
    });

    it('refuses extract without doc.download; duplicate needs only doc.pages.assemble', async () => {
      const { pageEdit, extract } = harness({
        pages: THREE_PAGES,
        allows: (permission) => permission !== 'doc.download',
      });
      await expect(pageEdit.extract([0])).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'doc.download',
      });
      await expect(pageEdit.duplicate([0])).resolves.toEqual({ pages: NEW_PAGES });
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    it('an edit whose signal fired before it was called stages nothing', async () => {
      const { pageEdit, apply, extract } = harness({ pages: THREE_PAGES });
      const signal = aborted();
      await expect(pageEdit.setRotation([0], 90, { signal })).rejects.toMatchObject({
        code: 'operation-cancelled',
      });
      await expect(pageEdit.insertBlank({ signal })).rejects.toMatchObject({
        code: 'operation-cancelled',
      });
      await expect(pageEdit.extract([0], { signal })).rejects.toMatchObject({
        code: 'operation-cancelled',
      });
      expect(apply).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    });

    it('a signal that fires while the engine works rejects at once', async () => {
      const { pageEdit, extract } = harness({ pages: THREE_PAGES });
      extract.mockImplementationOnce(() => new Promise<Uint8Array>(() => {}));
      const controller = new AbortController();
      const extracted = pageEdit.extract([0], { signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve));
      controller.abort();
      await expect(extracted).rejects.toMatchObject({ code: 'operation-cancelled' });
    });
  });

  it('sends edits in the order they were called, each its own change', () => {
    const { pageEdit, sent, control } = harness({ pages: THREE_PAGES });
    control.hold = true;
    void pageEdit.setRotation([toPageRef(10)], 90);
    void pageEdit.delete([toPageRef(30)]);
    void pageEdit.reorder([toPageRef(20)], 'start');
    expect(sent().map((ops) => ops.map((op) => op.type))).toEqual([
      ['pages.rotate'],
      ['pages.delete'],
      ['pages.reorder'],
    ]);
  });
});
