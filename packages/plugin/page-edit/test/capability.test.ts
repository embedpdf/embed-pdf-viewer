import { describe, expect, it, vi } from 'vitest';
import { createPageEditCapability } from '../src/capability';

/**
 * The capability is a thin, PON-addressed forwarder to the engine handle, with
 * ONE bit of real logic: turning the relative `rotateBy` gesture into the
 * engine's absolute wire. These tests pin that arithmetic and the passthroughs.
 */

type Page = {
  pageObjectNumber: number;
  rotation: 0 | 90 | 180 | 270;
  index?: number;
  size?: { width: number; height: number };
};

/** Minimal PluginContext double: just `doc` + `document()`, which is all the
 *  capability reads. The verbs are spies; `allows` is configurable. */
function makeCtx(
  opts: {
    pages?: Page[];
    allows?: boolean;
    noDoc?: boolean;
  } = {},
) {
  const rotate = vi.fn((pons: number[], rotation: number) => ({ pons, rotation }));
  const move = vi.fn((pons: number[], destIndex: number) => ({ pons, destIndex }));
  const del = vi.fn((pons: number[]) => ({ pons }));
  const insert = vi.fn((bytes: unknown, destIndex?: number) => ({ bytes, destIndex }));
  const insertBlank = vi.fn((spec: unknown, destIndex?: number) => ({ spec, destIndex }));
  const allows = vi.fn(() => opts.allows ?? true);

  const doc = opts.noDoc
    ? null
    : {
        security: { allows },
        pages: { rotate, move, delete: del, insert, insertBlank },
      };

  const ctx = {
    doc,
    document: () => ({ pages: opts.pages ?? [] }),
  } as unknown as Parameters<typeof createPageEditCapability>[0];

  return { cap: createPageEditCapability(ctx), rotate, move, del, insert, insertBlank, allows };
}

/** Three pages in display order, distinct sizes so defaults are observable. */
const THREE_PAGES: Page[] = [
  { pageObjectNumber: 10, rotation: 0, index: 0, size: { width: 100, height: 200 } },
  { pageObjectNumber: 20, rotation: 0, index: 1, size: { width: 300, height: 400 } },
  { pageObjectNumber: 30, rotation: 0, index: 2, size: { width: 500, height: 600 } },
];

describe('PageEditCapability', () => {
  describe('rotateBy — relative gesture → absolute engine call', () => {
    it('adds +90 to the page’s current rotation', () => {
      const { cap, rotate } = makeCtx({ pages: [{ pageObjectNumber: 7, rotation: 90 }] });
      cap.rotateBy(7, 90);
      expect(rotate).toHaveBeenCalledWith([7], 180);
    });

    it('wraps past 360 (270 + 90 → 0)', () => {
      const { cap, rotate } = makeCtx({ pages: [{ pageObjectNumber: 3, rotation: 270 }] });
      cap.rotateBy(3, 90);
      expect(rotate).toHaveBeenCalledWith([3], 0);
    });

    it('wraps below 0 (0 − 90 → 270), not -90', () => {
      const { cap, rotate } = makeCtx({ pages: [{ pageObjectNumber: 1, rotation: 0 }] });
      cap.rotateBy(1, -90);
      expect(rotate).toHaveBeenCalledWith([1], 270);
    });

    it('treats an unknown pon as current rotation 0', () => {
      const { cap, rotate } = makeCtx({ pages: [] });
      cap.rotateBy(99, 90);
      expect(rotate).toHaveBeenCalledWith([99], 90);
    });
  });

  describe('passthroughs (PON-addressed, 1:1 with the engine)', () => {
    it('setRotation forwards the absolute value unchanged', () => {
      const { cap, rotate } = makeCtx();
      cap.setRotation([1, 2], 180);
      expect(rotate).toHaveBeenCalledWith([1, 2], 180);
    });

    it('move forwards pons + destIndex', () => {
      const { cap, move } = makeCtx();
      cap.move([2, 3], 0);
      expect(move).toHaveBeenCalledWith([2, 3], 0);
    });

    it('delete forwards pons', () => {
      const { cap, del } = makeCtx();
      cap.delete([5]);
      expect(del).toHaveBeenCalledWith([5]);
    });
  });

  describe('canEdit — wildcard-aware gate via security.allows', () => {
    it('reflects allows(doc.pages.assemble)', () => {
      const granted = makeCtx({ allows: true });
      expect(granted.cap.canEdit()).toBe(true);
      expect(granted.allows).toHaveBeenCalledWith('doc.pages.assemble');

      const denied = makeCtx({ allows: false });
      expect(denied.cap.canEdit()).toBe(false);
    });

    it('is false when no document is bound', () => {
      const { cap } = makeCtx({ noDoc: true });
      expect(cap.canEdit()).toBe(false);
    });
  });

  describe('addBlank — placement + neighbour-size derivation → explicit engine wire', () => {
    it('appends by default, sized like the last page', () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      cap.addBlank();
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 500, height: 600 }, count: undefined },
        undefined,
      );
    });

    it('{ after: pon } lands after the anchor and matches ITS size', () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      cap.addBlank({ placement: { after: 20 } });
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        2,
      );
    });

    it('{ before: pon } lands at the anchor index and matches ITS size', () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      cap.addBlank({ placement: { before: 10 } });
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        0,
      );
    });

    it('{ index } is forwarded verbatim, sized like the predecessor (clamped at 0)', () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      cap.addBlank({ placement: { index: 2 } });
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 300, height: 400 }, count: undefined },
        2,
      );
      cap.addBlank({ placement: { index: 0 } });
      expect(insertBlank).toHaveBeenCalledWith(
        { size: { width: 100, height: 200 }, count: undefined },
        0,
      );
    });

    it('an explicit size and count always win', () => {
      const { cap, insertBlank } = makeCtx({ pages: THREE_PAGES });
      cap.addBlank({ size: { width: 612, height: 792 }, count: 3, placement: { after: 10 } });
      expect(insertBlank).toHaveBeenCalledWith({ size: { width: 612, height: 792 }, count: 3 }, 1);
    });

    it('throws when the placement anchor is not in the registry', () => {
      const { cap } = makeCtx({ pages: THREE_PAGES });
      expect(() => cap.addBlank({ placement: { after: 99 } })).toThrow(/placement page not found/);
    });
  });

  describe('insert — bytes passthrough with placement resolution', () => {
    it('appends by default', () => {
      const { cap, insert } = makeCtx({ pages: THREE_PAGES });
      const bytes = new Uint8Array([1, 2, 3]);
      cap.insert(bytes);
      expect(insert).toHaveBeenCalledWith(bytes, undefined);
    });

    it('resolves a PON placement to the engine index', () => {
      const { cap, insert } = makeCtx({ pages: THREE_PAGES });
      const bytes = new Uint8Array([1, 2, 3]);
      cap.insert(bytes, { placement: { after: 20 } });
      expect(insert).toHaveBeenCalledWith(bytes, 2);
    });
  });

  it('throws on a mutation when no document is bound', () => {
    const { cap } = makeCtx({ noDoc: true });
    expect(() => cap.rotateBy(1, 90)).toThrow(/no document bound/);
    expect(() => cap.delete([1])).toThrow(/no document bound/);
    expect(() => cap.addBlank()).toThrow(/no document bound/);
    expect(() => cap.insert(new Uint8Array([1]))).toThrow(/no document bound/);
  });
});
