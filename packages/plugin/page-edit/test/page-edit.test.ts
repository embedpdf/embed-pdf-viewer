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

import { createPageEditController } from '../src/controller';

/**
 * The controller forwards page edits to the engine handle with three bits of
 * its own: the relative `rotateBy` turned into the engine's absolute rotation
 * (grouped by the result), placements as positions with their pages fixed, and refusals
 * before anything starts.
 */

const NEW_PAGES = [toPageRef(101), toPageRef(102)];

/** A test context whose document handle's page verbs are spies. */
function harness(
  options: {
    pages?: readonly TestPage[];
    allows?: (permission: string) => boolean;
    otherDocument?: { pages: readonly PageInfo[]; handle: Partial<DocumentHandle> };
  } = {},
) {
  const rotate = vi.fn(async (_pages: PageRef[], _rotation: number) => ({}));
  const reorder = vi.fn(async (_pages: PageRef[], _position: unknown) => ({}));
  const deletePages = vi.fn(async (_pages: PageRef[]) => ({}));
  const insert = vi.fn(async (_bytes: unknown, _position?: unknown) => ({
    insertedPages: NEW_PAGES,
  }));
  const insertBlank = vi.fn(async (_spec: unknown, _position?: unknown) => ({
    insertedPages: NEW_PAGES,
  }));
  const extract = vi.fn(async (_pages: PageRef[]): Promise<Uint8Array> => new Uint8Array([9]));
  const allows = vi.fn(options.allows ?? (() => true));
  const ctx = createTestContext<void>({
    id: 'page-edit',
    pages: options.pages ?? [],
    doc: {
      security: { allows },
      pages: { rotate, reorder, delete: deletePages, insert, insertBlank, extract },
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
  return { ctx, pageEdit, rotate, reorder, deletePages, insert, insertBlank, extract, allows };
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
    it('adds the delta to each page’s current rotation, wrapping past 360 and below 0', async () => {
      const { pageEdit, rotate } = harness({ pages: [{ ref: toPageRef(7), rotation: 270 }] });
      await pageEdit.rotateBy([toPageRef(7)], 90);
      expect(rotate).toHaveBeenLastCalledWith([toPageRef(7)], 0);
      await pageEdit.rotateBy([toPageRef(7)], -90);
      expect(rotate).toHaveBeenLastCalledWith([toPageRef(7)], 180);
    });

    it('groups pages by their resulting rotation, one engine call each', async () => {
      const { pageEdit, rotate } = harness({ pages: THREE_PAGES });
      await expect(
        pageEdit.rotateBy([toPageRef(10), toPageRef(20), toPageRef(30)], 90),
      ).resolves.toBeUndefined();
      expect(rotate).toHaveBeenCalledTimes(2);
      expect(rotate).toHaveBeenNthCalledWith(1, [toPageRef(10), toPageRef(30)], 90);
      expect(rotate).toHaveBeenNthCalledWith(2, [toPageRef(20)], 180);
    });

    it('takes a page index as well as a ref', async () => {
      const { pageEdit, rotate } = harness({ pages: THREE_PAGES });
      await pageEdit.rotateBy([1], 90);
      expect(rotate).toHaveBeenCalledWith([toPageRef(20)], 180);
    });

    it('rejects a page the document does not have, and an empty page list', async () => {
      const { pageEdit, rotate } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.rotateBy([toPageRef(99)], 90)).rejects.toMatchObject({
        code: 'not-found',
      });
      await expect(pageEdit.rotateBy([7], 90)).rejects.toMatchObject({ code: 'not-found' });
      await expect(pageEdit.rotateBy([], 90)).rejects.toMatchObject({ code: 'invalid-input' });
      expect(rotate).not.toHaveBeenCalled();
    });
  });

  describe('setRotation, reorder and delete', () => {
    it('setRotation gives every page the same rotation', async () => {
      const { pageEdit, rotate } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.setRotation([toPageRef(10), 2], 180)).resolves.toBeUndefined();
      expect(rotate).toHaveBeenCalledWith([toPageRef(10), toPageRef(30)], 180);
    });

    it('reorder hands the engine the placement, its page fixed when called', async () => {
      const { pageEdit, reorder } = harness({ pages: THREE_PAGES });
      await pageEdit.reorder([toPageRef(20), toPageRef(30)], 'start');
      expect(reorder).toHaveBeenLastCalledWith([toPageRef(20), toPageRef(30)], 'start');
      await pageEdit.reorder([toPageRef(10)], { after: toPageRef(20) });
      expect(reorder).toHaveBeenLastCalledWith([toPageRef(10)], { after: toPageRef(20) });
      await pageEdit.reorder([0], { before: 2 });
      expect(reorder).toHaveBeenLastCalledWith([toPageRef(10)], { before: toPageRef(30) });
      await pageEdit.reorder([toPageRef(10)], 'end');
      expect(reorder).toHaveBeenLastCalledWith([toPageRef(10)], 'end');
    });

    it('reorder rejects a placement page the document does not have', async () => {
      const { pageEdit, reorder } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.reorder([0], { after: toPageRef(99) })).rejects.toMatchObject({
        code: 'not-found',
      });
      expect(reorder).not.toHaveBeenCalled();
    });

    it('delete forwards the pages, and refuses deleting every page', async () => {
      const { pageEdit, deletePages } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.delete([toPageRef(30)])).resolves.toBeUndefined();
      expect(deletePages).toHaveBeenCalledWith([toPageRef(30)]);
      await expect(pageEdit.delete([0, 1, 2])).rejects.toMatchObject({ code: 'invalid-input' });
      expect(deletePages).toHaveBeenCalledTimes(1);
    });
  });

  describe('inserts resolve the new pages', () => {
    it('insertBlank appends by default, sized like the last page', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.insertBlank()).resolves.toEqual({ pages: NEW_PAGES });
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 500, height: 600 }, count: undefined },
        'end',
      );
    });

    it('insertBlank sizes a blank page in an empty document as Letter', async () => {
      const { pageEdit, insertBlank } = harness({ pages: [] });
      await pageEdit.insertBlank();
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 612, height: 792 }, count: undefined },
        'end',
      );
    });

    it('insertBlank { after } and { before } go next to the page and match its size', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({ placement: { after: toPageRef(20) } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        { after: toPageRef(20) },
      );
      await pageEdit.insertBlank({ placement: { before: 0 } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        { before: toPageRef(10) },
      );
    });

    it("insertBlank 'start' goes first, sized like the first page", async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({ placement: 'start' });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        'start',
      );
    });

    it('insertBlank takes an explicit size and count', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({
        size: { width: 612, height: 792 },
        count: 3,
        placement: { after: toPageRef(10) },
      });
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 612, height: 792 }, count: 3 },
        { after: toPageRef(10) },
      );
    });

    it('insertBlank rejects a placement page the document does not have', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await expect(
        pageEdit.insertBlank({ placement: { after: toPageRef(99) } }),
      ).rejects.toMatchObject({ code: 'not-found' });
      expect(insertBlank).not.toHaveBeenCalled();
    });

    it('insertFromBytes appends by default and goes next to a page the placement names', async () => {
      const { pageEdit, insert } = harness({ pages: THREE_PAGES });
      const bytes = new Uint8Array([1, 2, 3]);
      await expect(pageEdit.insertFromBytes(bytes)).resolves.toEqual({ pages: NEW_PAGES });
      expect(insert).toHaveBeenLastCalledWith(bytes, 'end');
      await pageEdit.insertFromBytes(bytes, { placement: { after: 1 } });
      expect(insert).toHaveBeenLastCalledWith(bytes, { after: toPageRef(20) });
    });

    it('duplicate inserts copies right after the last of the pages', async () => {
      const { pageEdit, extract, insert } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.duplicate([toPageRef(10), 1])).resolves.toEqual({ pages: NEW_PAGES });
      expect(extract).toHaveBeenCalledWith([toPageRef(10), toPageRef(20)]);
      expect(insert).toHaveBeenCalledWith(new Uint8Array([9]), { after: toPageRef(20) });
    });

    it('insertFromDocument copies pages of another open document, by ref or index', async () => {
      const otherExtract = vi.fn(async (_pages: PageRef[]) => new Uint8Array([7]));
      const otherPages = [
        { ref: toPageRef(500), index: 0 },
        { ref: toPageRef(501), index: 1 },
      ] as unknown as PageInfo[];
      const { pageEdit, insert } = harness({
        pages: THREE_PAGES,
        otherDocument: {
          pages: otherPages,
          handle: { pages: { extract: otherExtract } } as unknown as Partial<DocumentHandle>,
        },
      });
      await expect(
        pageEdit.insertFromDocument('other', [1, toPageRef(500)], { placement: 'start' }),
      ).resolves.toEqual({ pages: NEW_PAGES });
      expect(otherExtract).toHaveBeenCalledWith([toPageRef(501), toPageRef(500)]);
      expect(insert).toHaveBeenCalledWith(new Uint8Array([7]), 'start');
      await expect(pageEdit.insertFromDocument('other', [5])).rejects.toMatchObject({
        code: 'not-found',
      });
      await expect(pageEdit.insertFromDocument('closed', [0])).rejects.toMatchObject({
        code: 'not-found',
      });
    });

    it('extract resolves the new PDF’s bytes', async () => {
      const { pageEdit, extract } = harness({ pages: THREE_PAGES });
      await expect(pageEdit.extract([2])).resolves.toEqual(new Uint8Array([9]));
      expect(extract).toHaveBeenCalledWith([toPageRef(30)]);
    });
  });

  describe('permissions', () => {
    it('canEdit reads doc.pages.assemble and canExtract reads doc.download', () => {
      const { pageEdit } = harness({ allows: (permission) => permission === 'doc.download' });
      expect(pageEdit.canEdit()).toBe(false);
      expect(pageEdit.canExtract()).toBe(true);
    });

    it('refuses an edit without doc.pages.assemble, naming the permission, before any engine call', async () => {
      const { pageEdit, rotate, insertBlank } = harness({
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
      expect(rotate).not.toHaveBeenCalled();
      expect(insertBlank).not.toHaveBeenCalled();
    });

    it('refuses extract and duplicate without doc.download', async () => {
      const { pageEdit, extract } = harness({
        pages: THREE_PAGES,
        allows: (permission) => permission !== 'doc.download',
      });
      await expect(pageEdit.extract([0])).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'doc.download',
      });
      await expect(pageEdit.duplicate([0])).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'doc.download',
      });
      expect(extract).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    it('an edit whose signal fired before it ran never reaches the engine', async () => {
      const { pageEdit, rotate, insertBlank, extract } = harness({ pages: THREE_PAGES });
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
      expect(rotate).not.toHaveBeenCalled();
      expect(insertBlank).not.toHaveBeenCalled();
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

  it('runs edits one at a time, in the order they were called', async () => {
    const order: string[] = [];
    let release!: () => void;
    const { ctx, pageEdit, rotate, deletePages } = harness({ pages: THREE_PAGES });
    rotate.mockImplementationOnce(async () => {
      order.push('rotate:start');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push('rotate:end');
      return {};
    });
    deletePages.mockImplementationOnce(async () => {
      order.push('delete');
      return {};
    });
    const rotated = pageEdit.setRotation([toPageRef(10)], 90);
    const deleted = pageEdit.delete([toPageRef(30)]);
    const settled = ctx.settle();
    await new Promise((resolve) => setTimeout(resolve));
    expect(order).toEqual(['rotate:start']);
    release();
    await Promise.all([rotated, deleted, settled]);
    expect(order).toEqual(['rotate:start', 'rotate:end', 'delete']);
  });
});
