import { describe, expect, it, vi } from 'vitest';
import { toPageRef, type DocumentHandle, type PageRef } from '@embedpdf/core';
import { createTestContext, type TestPage } from '@embedpdf/core/testing';

import { createPageEditController } from '../src/controller';

/**
 * The controller is a thin, ref-addressed forwarder to the engine handle with
 * two bits of real logic: the relative `rotateBy` gesture → the engine's
 * absolute wire (grouped by the resulting rotation), and placement → index.
 */

/** A test context whose document handle's page verbs are spies. */
function harness(options: { pages?: readonly TestPage[]; allows?: boolean } = {}) {
  const rotate = vi.fn(async (pages: PageRef[], rotation: number) => ({ pages, rotation }));
  const move = vi.fn(async (pages: PageRef[], toIndex: number) => ({ pages, toIndex }));
  const deletePages = vi.fn(async (pages: PageRef[]) => ({ pages }));
  const insert = vi.fn(async (bytes: unknown, toIndex?: number) => ({ bytes, toIndex }));
  const insertBlank = vi.fn(async (spec: unknown, toIndex?: number) => ({ spec, toIndex }));
  const extract = vi.fn(async (_pages: PageRef[]) => new Uint8Array([9]));
  const allows = vi.fn(() => options.allows ?? true);
  const ctx = createTestContext<void>({
    id: 'page-edit',
    pages: options.pages ?? [],
    doc: {
      security: { allows },
      pages: { rotate, move, delete: deletePages, insert, insertBlank, extract },
    } as unknown as Partial<DocumentHandle>,
  });
  const pageEdit = ctx.connect(createPageEditController(ctx));
  return { pageEdit, rotate, move, deletePages, insert, insertBlank, extract, allows };
}

/** Three pages in display order, distinct sizes so defaults are observable. */
const THREE_PAGES: TestPage[] = [
  { ref: toPageRef(10), rotation: 0, size: { width: 100, height: 200 } },
  { ref: toPageRef(20), rotation: 90, size: { width: 300, height: 400 } },
  { ref: toPageRef(30), rotation: 0, size: { width: 500, height: 600 } },
];

describe('PageEditCapability', () => {
  describe('rotateBy — relative gesture → absolute engine calls', () => {
    it('adds the delta to each page’s current rotation, wrapping past 360 and below 0', async () => {
      const { pageEdit, rotate } = harness({ pages: [{ ref: toPageRef(7), rotation: 270 }] });
      await pageEdit.rotateBy([toPageRef(7)], 90);
      expect(rotate).toHaveBeenLastCalledWith([toPageRef(7)], 0);
      await pageEdit.rotateBy([toPageRef(7)], -90);
      expect(rotate).toHaveBeenLastCalledWith([toPageRef(7)], 180);
    });

    it('groups pages by their resulting rotation and resolves with the last group’s result', async () => {
      const { pageEdit, rotate } = harness({ pages: THREE_PAGES });
      const result = await pageEdit.rotateBy([toPageRef(10), toPageRef(20), toPageRef(30)], 90);
      expect(rotate).toHaveBeenCalledTimes(2);
      expect(rotate).toHaveBeenNthCalledWith(1, [toPageRef(10), toPageRef(30)], 90);
      expect(rotate).toHaveBeenNthCalledWith(2, [toPageRef(20)], 180);
      expect(result).toEqual({ pages: [toPageRef(20)], rotation: 180 });
    });

    it('rejects a ref the registry does not know, and an empty page list', async () => {
      const { pageEdit, rotate } = harness({ pages: [] });
      await expect(pageEdit.rotateBy([toPageRef(99)], 90)).rejects.toMatchObject({
        code: 'not-found',
      });
      await expect(pageEdit.rotateBy([], 90)).rejects.toMatchObject({ code: 'invalid-input' });
      expect(rotate).not.toHaveBeenCalled();
    });
  });

  describe('passthroughs (ref-addressed, 1:1 with the engine)', () => {
    it('setRotation forwards the absolute value unchanged', async () => {
      const { pageEdit, rotate } = harness();
      await pageEdit.setRotation([toPageRef(1), toPageRef(2)], 180);
      expect(rotate).toHaveBeenCalledWith([toPageRef(1), toPageRef(2)], 180);
    });

    it('move resolves the placement to the engine index', async () => {
      const { pageEdit, move } = harness({ pages: THREE_PAGES });
      await pageEdit.move([toPageRef(20), toPageRef(30)], { index: 0 });
      expect(move).toHaveBeenLastCalledWith([toPageRef(20), toPageRef(30)], 0);
      await pageEdit.move([toPageRef(10)], { after: toPageRef(20) });
      expect(move).toHaveBeenLastCalledWith([toPageRef(10)], 2);
      await pageEdit.move([toPageRef(10)], 'end');
      expect(move).toHaveBeenLastCalledWith([toPageRef(10)], 3);
    });

    it('delete forwards refs', async () => {
      const { pageEdit, deletePages } = harness();
      await pageEdit.delete([toPageRef(5)]);
      expect(deletePages).toHaveBeenCalledWith([toPageRef(5)]);
    });

    it('duplicate inserts the extracted pages right after the last of them by default', async () => {
      const { pageEdit, extract, insert } = harness({ pages: THREE_PAGES });
      await pageEdit.duplicate([toPageRef(10), toPageRef(20)]);
      expect(extract).toHaveBeenCalledWith([toPageRef(10), toPageRef(20)]);
      expect(insert).toHaveBeenCalledWith(new Uint8Array([9]), 2);
    });
  });

  describe('canEdit — wildcard-aware gate via security.allows', () => {
    it('reflects allows(doc.pages.assemble)', () => {
      const granted = harness({ allows: true });
      expect(granted.pageEdit.canEdit()).toBe(true);
      expect(granted.allows).toHaveBeenCalledWith('doc.pages.assemble');
      expect(harness({ allows: false }).pageEdit.canEdit()).toBe(false);
    });
  });

  describe('insertBlank — placement + neighbour-size derivation → explicit engine wire', () => {
    it('appends by default, sized like the last page', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank();
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 500, height: 600 }, count: undefined },
        undefined,
      );
    });

    it('sizes a blank page in an empty document as Letter', async () => {
      const { pageEdit, insertBlank } = harness({ pages: [] });
      await pageEdit.insertBlank();
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 612, height: 792 }, count: undefined },
        undefined,
      );
    });

    it('{ after } lands after the anchor and matches its size; { before } at the anchor index', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({ placement: { after: toPageRef(20) } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        2,
      );
      await pageEdit.insertBlank({ placement: { before: toPageRef(10) } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        0,
      );
    });

    it('{ index } is forwarded verbatim, sized like the predecessor (clamped at 0)', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({ placement: { index: 2 } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        2,
      );
      await pageEdit.insertBlank({ placement: { index: 0 } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        0,
      );
    });

    it('an explicit size and count always win', async () => {
      const { pageEdit, insertBlank } = harness({ pages: THREE_PAGES });
      await pageEdit.insertBlank({
        size: { width: 612, height: 792 },
        count: 3,
        placement: { after: toPageRef(10) },
      });
      expect(insertBlank).toHaveBeenCalledWith({ size: { width: 612, height: 792 }, count: 3 }, 1);
    });

    it('rejects when the placement anchor is not in the registry', async () => {
      const { pageEdit } = harness({ pages: THREE_PAGES });
      await expect(
        pageEdit.insertBlank({ placement: { after: toPageRef(99) } }),
      ).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('insertFromBytes — passthrough with placement resolution', () => {
    it('appends by default and resolves a ref placement to the engine index', async () => {
      const { pageEdit, insert } = harness({ pages: THREE_PAGES });
      const bytes = new Uint8Array([1, 2, 3]);
      await pageEdit.insertFromBytes(bytes);
      expect(insert).toHaveBeenLastCalledWith(bytes, undefined);
      await pageEdit.insertFromBytes(bytes, { placement: { after: toPageRef(20) } });
      expect(insert).toHaveBeenLastCalledWith(bytes, 2);
    });
  });

  it('runs mutations one at a time, in submission order', async () => {
    const order: string[] = [];
    let release!: () => void;
    const { pageEdit, rotate, deletePages } = harness({ pages: THREE_PAGES });
    rotate.mockImplementationOnce(async (pages, rotation) => {
      order.push('rotate:start');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push('rotate:end');
      return { pages, rotation };
    });
    deletePages.mockImplementationOnce(async (pages) => {
      order.push('delete');
      return { pages };
    });
    const rotated = pageEdit.setRotation([toPageRef(10)], 90);
    const deleted = pageEdit.delete([toPageRef(30)]);
    await new Promise((resolve) => setTimeout(resolve));
    expect(order).toEqual(['rotate:start']);
    release();
    await Promise.all([rotated, deleted]);
    expect(order).toEqual(['rotate:start', 'rotate:end', 'delete']);
  });
});
