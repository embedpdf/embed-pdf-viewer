import { describe, expect, it, vi } from 'vitest';
import type { PageObjectNumber, PluginContext } from '@embedpdf/core';
import type { PageGeometrySnapshot, PageTextSnapshot } from '@embedpdf/engine-core/runtime';
import { createSelectionCapability } from './capability';
import { initialSelectionState, selectionReducer } from './reducer';
import type { SelectionAction, SelectionState } from './types';

const crop = { left: 0, bottom: 0, right: 200, top: 100 };

const glyph = (left: number, bottom: number, flags = 0, w = 8, h = 10) => ({
  looseBox: { left, bottom, right: left + w, top: bottom + h },
  flags,
});

/** One upright run of `count` glyphs starting at x=10, y-up row 90..100. */
const simpleGeometry = (count: number): PageGeometrySnapshot => ({
  runs: [
    {
      rect: { left: 10, bottom: 90, right: 10 + count * 8, top: 100 },
      charStart: 0,
      glyphs: Array.from({ length: count }, (_, i) => glyph(10 + i * 8, 90)),
    },
  ],
});

interface PageFixture {
  pon: number;
  geometry: PageGeometrySnapshot;
  text: PageTextSnapshot;
}

function makeHarness(pages: PageFixture[], allow: Set<string>) {
  let state: SelectionState = initialSelectionState;
  const listeners = new Set<() => void>();
  let revision = 0;
  const cleanups: Array<() => void> = [];
  const eventListeners = new Set<(event: { type: string }) => void>();
  const geometryReads = vi.fn((pon: number) => {
    const page = pages.find((p) => p.pon === pon);
    return page
      ? Promise.resolve(page.geometry)
      : Promise.reject(new Error(`no geometry for ${pon}`));
  });
  const textReads = vi.fn((pon: number) => {
    const page = pages.find((p) => p.pon === pon);
    return page ? Promise.resolve(page.text) : Promise.reject(new Error(`no text for ${pon}`));
  });

  const registry = () =>
    pages.map((p, index) => ({
      index,
      pageObjectNumber: p.pon,
      rotation: 0,
      userUnit: 1,
      boxes: { crop },
    }));

  const ctx = {
    id: 'selection',
    doc: {
      security: { allows: (cap: string) => allow.has(cap) },
      page: (pon: number) => ({
        geometry: { read: () => geometryReads(pon) },
        text: { read: () => textReads(pon) },
      }),
      events: {
        subscribe: (cb: (event: { type: string }) => void) => {
          eventListeners.add(cb);
          return () => eventListeners.delete(cb);
        },
      },
    },
    document: () => ({ id: 'doc', pageCount: pages.length, pages: registry(), revision }),
    getState: () => state,
    dispatch: (action: SelectionAction) => {
      state = selectionReducer(state, action);
      listeners.forEach((cb) => cb());
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    cleanup: (fn: () => void) => cleanups.push(fn),
  } as unknown as PluginContext<SelectionState, SelectionAction>;

  return {
    ctx,
    geometryReads,
    textReads,
    emitDocEvent: (type: string) => eventListeners.forEach((cb) => cb({ type })),
    bumpRevision: () => {
      revision++;
      listeners.forEach((cb) => cb());
    },
    removePage: (pon: number) => {
      const at = pages.findIndex((p) => p.pon === pon);
      if (at >= 0) pages.splice(at, 1);
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const ALL = new Set(['doc.text.select', 'doc.text.copy']);
const SELECT_ONLY = new Set(['doc.text.select']);
const NONE = new Set<string>();

const pageA: PageFixture = {
  pon: 101,
  geometry: simpleGeometry(6),
  text: { text: 'Hello!', charCount: 6 },
};
// Leading non-printing char: 3 character slots, 2 text units.
const pageB: PageFixture = {
  pon: 102,
  geometry: simpleGeometry(3),
  text: { text: 'AB', charCount: 3, charMap: [[1, 0]] },
};

describe('selection capability — permissions', () => {
  it('canSelect/canCopy mirror the engine predicate', () => {
    const select = createSelectionCapability(makeHarness([pageA], SELECT_ONLY).ctx);
    expect(select.canSelect()).toBe(true);
    expect(select.canCopy()).toBe(false);
    const none = createSelectionCapability(makeHarness([pageA], NONE).ctx);
    expect(none.canSelect()).toBe(false);
  });

  it('select() throws PermissionDenied without doc.text.select; clear() stays allowed', () => {
    const cap = createSelectionCapability(makeHarness([pageA], NONE).ctx);
    expect(() => cap.select({ pon: 101 as PageObjectNumber, start: 0, count: 2 })).toThrowError(
      /doc\.text\.select/,
    );
    expect(() => cap.clear()).not.toThrow();
  });

  it('ensurePage is inert without doc.text.select (no guaranteed-to-fail reads)', () => {
    const h = makeHarness([pageA], NONE);
    const cap = createSelectionCapability(h.ctx);
    cap.ensurePage(101 as PageObjectNumber);
    expect(h.geometryReads).not.toHaveBeenCalled();
  });

  it('readText() rejects with PermissionDenied without doc.text.copy', async () => {
    const h = makeHarness([pageA], SELECT_ONLY);
    const cap = createSelectionCapability(h.ctx);
    cap.select({ pon: 101 as PageObjectNumber, start: 0, count: 5 });
    await flush();
    await expect(cap.readText()).rejects.toThrowError(/doc\.text\.copy/);
    expect(h.textReads).not.toHaveBeenCalled();
  });
});

describe('selection capability — programmatic selection', () => {
  it('select({pon,start,count}) materializes segments and a round-trippable range', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.select({ pon: 101 as PageObjectNumber, start: 1, count: 3 });
    await flush(); // geometry warms, PAGE_LOADED recompute fills segments
    expect(cap.hasSelection()).toBe(true);
    expect(cap.segmentsForPage(101 as PageObjectNumber).length).toBeGreaterThan(0);
    const range = cap.snapshot().range!;
    expect(range).toEqual({
      start: { pon: 101, index: 1 },
      end: { pon: 101, index: 4 },
    });
    // Round trip: the snapshot range is a valid select() input.
    cap.select(range);
    await flush();
    expect(cap.snapshot().range).toEqual(range);
  });

  it('an empty range clears instead of selecting', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.select({ pon: 101 as PageObjectNumber, start: 2, count: 2 });
    await flush();
    cap.select({ pon: 101 as PageObjectNumber, start: 2, count: 0 });
    expect(cap.hasSelection()).toBe(false);
  });

  it('selectAll spans every page and clamps its open end once geometry loads', async () => {
    const h = makeHarness([pageA, pageB], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.selectAll();
    await flush();
    const range = cap.snapshot().range!;
    expect(range.start).toEqual({ pon: 101, index: 0 });
    expect(range.end).toEqual({ pon: 102, index: 3 }); // clamped to page B's charCount
    expect(cap.selectedPages()).toEqual([101, 102]);
  });
});

describe('selection capability — readText', () => {
  it('slices through the charMap (dropped char contributes nothing)', async () => {
    const h = makeHarness([pageB], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.select({ pon: 102 as PageObjectNumber, start: 0, count: 3 });
    await flush();
    await expect(cap.readText()).resolves.toBe('AB');
    cap.select({ pon: 102 as PageObjectNumber, start: 2, count: 1 });
    await flush();
    await expect(cap.readText()).resolves.toBe('B');
  });

  it('joins pages with \\n and caches page text across calls', async () => {
    const h = makeHarness([pageA, pageB], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.selectAll();
    await flush();
    await expect(cap.readText()).resolves.toBe('Hello!\nAB');
    await expect(cap.readText()).resolves.toBe('Hello!\nAB');
    expect(h.textReads).toHaveBeenCalledTimes(2); // once per page, cached after
  });

  it('resolves empty without a selection', async () => {
    const cap = createSelectionCapability(makeHarness([pageA], ALL).ctx);
    await expect(cap.readText()).resolves.toBe('');
  });
});

describe('selection capability — isSelecting (the gesture-in-flight fact)', () => {
  it('tracks the drag gesture: true from beginAt, false at end()', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.ensurePage(101 as PageObjectNumber);
    await flush();
    expect(cap.isSelecting()).toBe(false);
    expect(cap.beginAt(101 as PageObjectNumber, { x: 14, y: 5 })).toBe(true);
    expect(cap.isSelecting()).toBe(true);
    cap.extendTo(101 as PageObjectNumber, { x: 30, y: 5 });
    expect(cap.isSelecting()).toBe(true);
    cap.end();
    expect(cap.isSelecting()).toBe(false);
    expect(cap.hasSelection()).toBe(true); // the selection survives settling
  });

  it('programmatic selections are born settled', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.select({ pon: 101 as PageObjectNumber, start: 0, count: 4 });
    await flush();
    expect(cap.isSelecting()).toBe(false);
    expect(cap.menuAnchor()).not.toBeNull();
  });

  it('derived recomputes never touch the fact mid-gesture', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.ensurePage(101 as PageObjectNumber);
    await flush();
    cap.beginAt(101 as PageObjectNumber, { x: 14, y: 5 });
    h.bumpRevision(); // rotate/move-style registry refresh → recompute
    expect(cap.isSelecting()).toBe(true);
  });

  it('clear() resets it', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.ensurePage(101 as PageObjectNumber);
    await flush();
    cap.beginAt(101 as PageObjectNumber, { x: 14, y: 5 });
    cap.clear();
    expect(cap.isSelecting()).toBe(false);
  });
});

describe('selection capability — menuAnchor', () => {
  it('is null without a selection, and unions the page segments with one', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    expect(cap.menuAnchor()).toBeNull();
    cap.select({ pon: 101 as PageObjectNumber, start: 1, count: 3 });
    await flush();
    const anchor = cap.menuAnchor()!;
    expect(anchor.pon).toBe(101);
    // Glyphs are 8px cells starting at x=10: chars 1..3 span x 18..42.
    expect(anchor.bounds.x).toBeCloseTo(18);
    expect(anchor.bounds.width).toBeCloseTo(24);
    expect(anchor.bounds.height).toBeGreaterThan(0);
  });

  it('anchors a cross-page selection on the END page', async () => {
    const h = makeHarness([pageA, pageB], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.selectAll();
    await flush();
    expect(cap.menuAnchor()!.pon).toBe(102);
  });
});

describe('selection capability — invalidation', () => {
  it('content mutation (redaction.applied) clears the selection and refetches geometry', async () => {
    const h = makeHarness([pageA], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.select({ pon: 101 as PageObjectNumber, start: 0, count: 4 });
    await flush();
    expect(h.geometryReads).toHaveBeenCalledTimes(1);
    h.emitDocEvent('redaction.applied');
    expect(cap.hasSelection()).toBe(false);
    cap.ensurePage(101 as PageObjectNumber);
    await flush();
    expect(h.geometryReads).toHaveBeenCalledTimes(2);
  });

  it('clears when an endpoint page leaves the registry', async () => {
    const h = makeHarness([pageA, pageB], ALL);
    const cap = createSelectionCapability(h.ctx);
    cap.selectAll();
    await flush();
    expect(cap.hasSelection()).toBe(true);
    h.removePage(102);
    h.bumpRevision();
    expect(cap.hasSelection()).toBe(false);
  });
});
