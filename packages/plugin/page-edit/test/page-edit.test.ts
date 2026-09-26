import { describe, expect, it, vi } from 'vitest';
import { toPageRef, type PageRef } from '@embedpdf/core';

import { createPageEditController } from '../src/controller';

/**
 * The controller is a thin, ref-addressed forwarder to the engine handle with
 * two bits of real logic: the relative `rotateBy` gesture → the engine's
 * absolute wire (grouped by the resulting rotation), and placement → index.
 */

type Page = {
  ref: PageRef;
  rotation: 0 | 90 | 180 | 270;
  index?: number;
  size?: { width: number; height: number };
};

/** Minimal PluginContext double: just `doc` + `document()`. The verbs are spies. */
function makeCtx(opts: { pages?: Page[]; allows?: boolean; noDoc?: boolean } = {}) {
  const rotate = vi.fn(async (pages: PageRef[], rotation: number) => ({ pages, rotation }));
  const move = vi.fn(async (pages: PageRef[], destIndex: number) => ({ pages, destIndex }));
  const del = vi.fn(async (pages: PageRef[]) => ({ pages }));
  const insert = vi.fn(async (bytes: unknown, destIndex?: number) => ({ bytes, destIndex }));
  const insertBlank = vi.fn(async (spec: unknown, destIndex?: number) => ({ spec, destIndex }));
  const allows = vi.fn(() => opts.allows ?? true);
  const doc = opts.noDoc
    ? null
    : { security: { allows }, pages: { rotate, move, delete: del, insert, insertBlank } };
  const ctx = {
    doc,
    document: () => ({ pages: opts.pages ?? [] }),
    documentHandle: () => null,
  } as unknown as Parameters<typeof createPageEditController>[0];
  return { cap: createPageEditController(ctx), rotate, move, del, insert, insertBlank, allows };
}

/** Three pages in display order, distinct sizes so defaults are observable. */
const THREE_PAGES: Page[] = [
  { ref: toPageRef(10), rotation: 0, index: 0, size: { width: 100, height: 200 } },
  { ref: toPageRef(20), rotation: 90, index: 1, size: { width: 300, height: 400 } },
  { ref: toPageRef(30), rotation: 0, index: 2, size: { width: 500, height: 600 } },
];

describe('PageEditCapability', () => {
  describe('rotateBy — relative gesture → absolute engine calls', () => {
    it('adds the delta to each page’s current rotation, wrapping past 360 and below 0', async () => {
      const { cap, rotate } = makeCtx({ pages: [{ ref: toPageRef(7), rotation: 270 }] });
      await cap.rotateBy([toPageRef(7)], 90);
      expect(rotate).toHaveBeenLastCalledWith([toPageRef(7)], 0);
      await cap.rotateBy([toPageRef(7)], -90);
      expect(rotate).toHaveBeenLastCalledWith([toPageRef(7)], 180);
    });

    it('groups pages by their resulting rotation — one engine call per value', async () => {
      const { cap, rotate } = makeCtx({ pages: THREE_PAGES });
      await cap.rotateBy([toPageRef(10), toPageRef(20), toPageRef(30)], 90);
      expect(rotate).toHaveBeenCalledTimes(2);
      expect(rotate).toHaveBeenCalledWith([toPageRef(10), toPageRef(30)], 90);
      expect(rotate).toHaveBeenCalledWith([toPageRef(20)], 180);
    });

    it('rejects a ref the registry does not know', async () => {
      const { cap, rotate } = makeCtx({ pages: [] });
      await expect(cap.rotateBy([toPageRef(99)], 90)).rejects.toMatchObject({ code: 'not-found' });
      expect(rotate).not.toHaveBeenCalled();
    });
  });

  describe('passthroughs (ref-addressed, 1:1 with the engine)', () => {
    it('setRotation forwards the absolute value unchanged', async () => {
      const { cap, rotate } = makeCtx();
      await cap.setRotation([toPageRef(1), toPageRef(2)], 180);
      expect(rotate).toHaveBeenCalledWith([toPageRef(1), toPageRef(2)], 180);
    });

    it('move resolves the placement to the engine index', async () => {
      const { cap, move } = makeCtx({ pages: THREE_PAGES });
      await cap.move([toPageRef(20), toPageRef(30)], { index: 0 });
      expect(move).toHaveBeenLastCalledWith([toPageRef(20), toPageRef(30)], 0);
      await cap.move([toPageRef(10)], { after: toPageRef(20) });
      expect(move).toHaveBeenLastCalledWith([toPageRef(10)], 2);
      await cap.move([toPageRef(10)], 'end');
      expect(move).toHaveBeenLastCalledWith([toPageRef(10)], 3);
    });

    it('delete forwards refs', async () => {
      const { cap, del } = makeCtx();
      await cap.delete([toPageRef(5)]);
      expect(del).toHaveBeenCalledWith([toPageRef(5)]);
    });
  });

  describe('canEdit — wildcard-aware gate via security.allows', () => {
    it('reflects allows(doc.pages.assemble)', () => {
      const granted = makeCtx({ allows: true });
      expect(granted.cap.canEdit()).toBe(true);
      expect(granted.allows).toHaveBeenCalledWith('doc.pages.assemble');
      expect(makeCtx({ allows: false }).cap.canEdit()).toBe(false);
    });

    it('is false when no document is bound', () => {
      expect(makeCtx({ noDoc: true }).cap.canEdit()).toBe(false);
    });
  });

  describe('insertBlank — placement + neighbour-size derivation → explicit engine wire', () => {
    it('appends by default, sized like the last page', async () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      await cap.insertBlank();
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 500, height: 600 }, count: undefined },
        undefined,
      );
    });

    it('{ after } lands after the anchor and matches ITS size; { before } at the anchor index', async () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      await cap.insertBlank({ placement: { after: toPageRef(20) } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        2,
      );
      await cap.insertBlank({ placement: { before: toPageRef(10) } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        0,
      );
    });

    it('{ index } is forwarded verbatim, sized like the predecessor (clamped at 0)', async () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      await cap.insertBlank({ placement: { index: 2 } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        2,
      );
      await cap.insertBlank({ placement: { index: 0 } });
      expect(insertBlank).toHaveBeenLastCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        0,
      );
    });

    it('an explicit size and count always win', async () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      await cap.insertBlank({
        size: { width: 612, height: 792 },
        count: 3,
        placement: { after: toPageRef(10) },
      });
      expect(insertBlank).toHaveBeenCalledWith({ size: { width: 612, height: 792 }, count: 3 }, 1);
    });

    it('rejects when the placement anchor is not in the registry', async () => {
      const { cap } = makeCtx({ pages: THREE_PAGES });
      await expect(cap.insertBlank({ placement: { after: toPageRef(99) } })).rejects.toMatchObject({
        code: 'not-found',
      });
    });
  });

  describe('insertFromBytes — passthrough with placement resolution', () => {
    it('appends by default and resolves a ref placement to the engine index', async () => {
      const { cap, insert } = makeCtx({ pages: THREE_PAGES });
      const bytes = new Uint8Array([1, 2, 3]);
      await cap.insertFromBytes(bytes);
      expect(insert).toHaveBeenLastCalledWith(bytes, undefined);
      await cap.insertFromBytes(bytes, { placement: { after: toPageRef(20) } });
      expect(insert).toHaveBeenLastCalledWith(bytes, 2);
    });
  });

  it('rejects a mutation when no document is bound', async () => {
    const { cap } = makeCtx({ noDoc: true });
    await expect(cap.rotateBy([toPageRef(1)], 90)).rejects.toMatchObject({ code: 'not-ready' });
    await expect(cap.delete([toPageRef(1)])).rejects.toMatchObject({ code: 'not-ready' });
    await expect(cap.insertBlank()).rejects.toMatchObject({ code: 'not-ready' });
    await expect(cap.insertFromBytes(new Uint8Array([1]))).rejects.toMatchObject({
      code: 'not-ready',
    });
  });
});
