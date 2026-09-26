import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  isPluginError,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { createTextLayout } from '@embedpdf/engine-core/runtime';
import type { PageGeometrySnapshot, PageTextSnapshot } from '@embedpdf/engine-core/runtime';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { selectionPlugin } from '../src/selection.plugin';
import { SelectionToken } from '../src/host-contract';

/** The selection through the real kernel: permissions, the range model, text
 *  extraction, the gesture fact, events, invalidation. */

const crop = { left: 0, bottom: 0, right: 200, top: 100 };

const glyph = (left: number, bottom: number, space = false, width = 8, height = 10) => ({
  loose: { left, bottom, right: left + width, top: bottom + height },
  ...(space ? { space: true as const } : {}),
});

/** One upright run of `count` glyphs starting at x=10, y-up row 90..100
 *  (content space: y 0..10). A space at `spaceAt` splits words. */
const simpleGeometry = (count: number, spaceAt?: number): PageGeometrySnapshot => ({
  runs: [
    {
      rect: { left: 10, bottom: 90, right: 10 + count * 8, top: 100 },
      start: 0,
      glyphs: Array.from({ length: count }, (_, i) => glyph(10 + i * 8, 90, i === spaceAt)),
    },
  ],
});

interface PageFixture {
  pageObjectNumber: number;
  geometry: PageGeometrySnapshot;
  text: PageTextSnapshot;
}

const pageA: PageFixture = {
  pageObjectNumber: 101,
  geometry: simpleGeometry(6),
  text: { text: 'Hello!', charCount: 6 },
};
// Leading non-printing char: 3 character slots, 2 text units.
const pageB: PageFixture = {
  pageObjectNumber: 102,
  geometry: simpleGeometry(3),
  text: { text: 'AB', charCount: 3, charMap: [[1, 0]] },
};
// "Hi wo": a space at slot 2 splits two words.
const pageW: PageFixture = {
  pageObjectNumber: 103,
  geometry: simpleGeometry(5, 2),
  text: { text: 'Hi wo', charCount: 5 },
};

const ALL = new Set(['doc.text.select', 'doc.text.copy']);
const SELECT_ONLY = new Set(['doc.text.select']);
const NONE = new Set<string>();

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function boot(fixtures: PageFixture[], allow = ALL) {
  const pages = [...fixtures];
  const listeners = new Set<(event: unknown) => void>();
  const failing = new Set<number>();
  const geometryReads = vi.fn((pageObjectNumber: number) => {
    if (failing.has(pageObjectNumber)) return Promise.reject(new Error('read failed'));
    const page = pages.find((fixture) => fixture.pageObjectNumber === pageObjectNumber);
    return page
      ? Promise.resolve(page.geometry)
      : Promise.reject(new Error(`no geometry for ${pageObjectNumber}`));
  });
  const textReads = vi.fn((pageObjectNumber: number) => {
    const page = pages.find((fixture) => fixture.pageObjectNumber === pageObjectNumber);
    return page
      ? Promise.resolve(page.text)
      : Promise.reject(new Error(`no text for ${pageObjectNumber}`));
  });
  const layout = (rotation = 0) =>
    pages.map(
      (fixture, index) =>
        ({
          index,
          ref: toPageRef(fixture.pageObjectNumber),
          label: null,
          size: { width: 200, height: 100 },
          rotation,
          userUnit: 1,
          boxes: { media: { ...crop }, crop: { ...crop } },
        }) as PageLayout,
    );
  const handle = {
    id: 'd',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: pages.length, pages: layout() }) },
    security: { allows: (scope: string) => allow.has(scope) },
    page: (ref: { pageObjectNumber: number }) => ({
      text: {
        get: () => textReads(ref.pageObjectNumber),
        layout: () => geometryReads(ref.pageObjectNumber).then(createTextLayout),
      },
    }),
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));

  const kernel = createKernel({ engine, plugins: [interactionPlugin(), selectionPlugin()] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return {
    kernel,
    selection: kernel.capability(SelectionToken, 'd'),
    geometryReads,
    textReads,
    /** Page object numbers whose geometry reads fail. */
    failing,
    emit,
    /** Replace a page's content, as a redaction or flatten would. */
    replacePage: (fixture: PageFixture) => {
      pages.splice(
        pages.findIndex((page) => page.pageObjectNumber === fixture.pageObjectNumber),
        1,
        fixture,
      );
    },
    /** A structural edit: the registry swaps and the revision bumps. */
    removePage: (pageObjectNumber: number) => {
      pages.splice(
        pages.findIndex((page) => page.pageObjectNumber === pageObjectNumber),
        1,
      );
      emit({
        type: 'pages.deleted',
        pages: [toPageRef(pageObjectNumber)],
        layout: { pageCount: pages.length, pages: layout() },
      });
    },
    rotateAll: () =>
      emit({ type: 'pages.rotated', layout: { pageCount: pages.length, pages: layout(90) } }),
  };
}

describe('selection — permissions', () => {
  it('canSelect / canCopy mirror the engine predicate', async () => {
    const some = await boot([pageA], SELECT_ONLY);
    expect(some.selection.canSelect()).toBe(true);
    expect(some.selection.canCopy()).toBe(false);
    const none = await boot([pageA], NONE);
    expect(none.selection.canSelect()).toBe(false);
    await some.kernel.destroy();
    await none.kernel.destroy();
  });

  it('writes throw permission-denied without doc.text.select; clear stays allowed', async () => {
    const { kernel, selection } = await boot([pageA], NONE);
    const denied = expect.objectContaining({ code: 'permission-denied', capability: 'selection' });
    expect(() => selection.select({ page: toPageRef(101), start: 0, count: 2 })).toThrow(denied);
    expect(() => selection.selectAll()).toThrow(denied);
    expect(() => selection.selectPage(toPageRef(101))).toThrow(denied);
    expect(() => selection.selectWordAt(toPageRef(101), { x: 14, y: 5 })).toThrow(denied);
    expect(() => selection.clear()).not.toThrow();
    await kernel.destroy();
  });

  it('ensureLoaded is inert without doc.text.select (no guaranteed-to-fail reads)', async () => {
    const fixture = await boot([pageA], NONE);
    await fixture.selection.ensureLoaded(toPageRef(101));
    expect(fixture.geometryReads).not.toHaveBeenCalled();
    expect(fixture.selection.isLoaded(toPageRef(101))).toBe(false);
    await fixture.kernel.destroy();
  });

  it('readText rejects permission-denied without doc.text.copy, before any read', async () => {
    const fixture = await boot([pageA], SELECT_ONLY);
    fixture.selection.select({ page: toPageRef(101), start: 0, count: 5 });
    await settle();
    await expect(fixture.selection.readText()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fixture.textReads).not.toHaveBeenCalled();
    await fixture.kernel.destroy();
  });
});

describe('selection — programmatic selection', () => {
  it('select({ page, start, count }) materializes segments and a round-trippable range', async () => {
    const { kernel, selection } = await boot([pageA]);
    selection.select({ page: toPageRef(101), start: 1, count: 3 });
    await settle(); // geometry warms, the page-loaded recompute fills the segments
    expect(selection.hasSelection()).toBe(true);
    expect(selection.listSegments(toPageRef(101)).length).toBeGreaterThan(0);
    expect(selection.listRects(toPageRef(101)).length).toBe(1);
    const range = selection.getRange()!;
    expect(range).toEqual({
      start: { page: toPageRef(101), index: 1 },
      end: { page: toPageRef(101), index: 4 },
    });
    // Round trip: the range is a valid select() input.
    selection.select(range);
    await settle();
    expect(selection.getRange()).toEqual(range);
    await kernel.destroy();
  });

  it('an empty range clears; an unknown page is not-found', async () => {
    const { kernel, selection } = await boot([pageA]);
    selection.select({ page: toPageRef(101), start: 2, count: 2 });
    await settle();
    selection.select({ page: toPageRef(101), start: 2, count: 0 });
    expect(selection.hasSelection()).toBe(false);
    expect(() => selection.select({ page: toPageRef(999), start: 0, count: 1 })).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    );
    await kernel.destroy();
  });

  it('selectAll spans every page and clamps its open end once geometry loads', async () => {
    const { kernel, selection } = await boot([pageA, pageB]);
    selection.selectAll();
    await settle();
    const range = selection.getRange()!;
    expect(range.start).toEqual({ page: toPageRef(101), index: 0 });
    expect(range.end).toEqual({ page: toPageRef(102), index: 3 }); // clamped to page B's charCount
    expect(selection.listSelectedPages()).toEqual([toPageRef(101), toPageRef(102)]);
    await kernel.destroy();
  });

  it('selectPage takes one page; selectWordAt takes the word under a point', async () => {
    const { kernel, selection } = await boot([pageA, pageW]);
    selection.selectPage(toPageRef(103));
    await settle();
    expect(selection.getRange()).toEqual({
      start: { page: toPageRef(103), index: 0 },
      end: { page: toPageRef(103), index: 5 },
    });
    expect(selection.selectWordAt(toPageRef(103), { x: 36, y: 5 })).toBe(true); // over "wo"
    expect(selection.getRange()).toEqual({
      start: { page: toPageRef(103), index: 3 },
      end: { page: toPageRef(103), index: 5 },
    });
    expect(selection.selectWordAt(toPageRef(103), { x: 150, y: 50 })).toBe(false); // blank space
    expect(selection.isGestureActive()).toBe(false); // programmatic: born settled
    await kernel.destroy();
  });
});

describe('selection — readText', () => {
  it('slices through the charMap (a dropped char contributes nothing)', async () => {
    const { kernel, selection } = await boot([pageB]);
    selection.select({ page: toPageRef(102), start: 0, count: 3 });
    await settle();
    await expect(selection.readText()).resolves.toBe('AB');
    selection.select({ page: toPageRef(102), start: 2, count: 1 });
    await settle();
    await expect(selection.readText()).resolves.toBe('B');
    await kernel.destroy();
  });

  it('joins pages with \\n and caches page text across calls', async () => {
    const fixture = await boot([pageA, pageB]);
    fixture.selection.selectAll();
    await settle();
    await expect(fixture.selection.readText()).resolves.toBe('Hello!\nAB');
    await expect(fixture.selection.readText()).resolves.toBe('Hello!\nAB');
    expect(fixture.textReads).toHaveBeenCalledTimes(2); // once per page, cached after
    await fixture.kernel.destroy();
  });

  it('readTextInRange reads any range without touching the selection; readText is empty without one', async () => {
    const { kernel, selection } = await boot([pageA, pageB]);
    await expect(selection.readText()).resolves.toBe('');
    await expect(
      selection.readTextInRange({
        start: { page: toPageRef(101), index: 1 },
        end: { page: toPageRef(102), index: 0 }, // ends at the page boundary
      }),
    ).resolves.toBe('ello!');
    expect(selection.hasSelection()).toBe(false);
    const aborted = new AbortController();
    aborted.abort();
    await expect(selection.readText({ signal: aborted.signal })).resolves.toBe(''); // nothing selected: nothing to cancel
    selection.selectAll();
    await expect(selection.readText({ signal: aborted.signal })).rejects.toMatchObject({
      code: 'operation-cancelled',
    });
    await kernel.destroy();
  });
});

describe('selection — the gesture fact', () => {
  it('tracks the drag: active from beginGestureAt, settled at endGesture, which commits once', async () => {
    const { kernel, selection } = await boot([pageA]);
    await selection.ensureLoaded(toPageRef(101));
    const commits: unknown[] = [];
    selection.onCommitted((event) => commits.push(event.range));
    expect(selection.isGestureActive()).toBe(false);
    expect(selection.beginGestureAt(toPageRef(101), { x: 14, y: 5 })).toBe(true);
    expect(selection.isGestureActive()).toBe(true);
    selection.extendTo(toPageRef(101), { x: 30, y: 5 });
    expect(selection.isGestureActive()).toBe(true);
    selection.endGesture();
    expect(selection.isGestureActive()).toBe(false);
    expect(selection.hasSelection()).toBe(true); // the selection survives settling
    expect(commits).toEqual([
      { start: { page: toPageRef(101), index: 0 }, end: { page: toPageRef(101), index: 3 } },
    ]);
    // Over blank space nothing opens.
    expect(selection.beginGestureAt(toPageRef(101), { x: 150, y: 50 })).toBe(false);
    await kernel.destroy();
  });

  it('programmatic selections are born settled and never commit', async () => {
    const { kernel, selection } = await boot([pageA]);
    const commits: unknown[] = [];
    selection.onCommitted((event) => commits.push(event));
    selection.select({ page: toPageRef(101), start: 0, count: 4 });
    await settle();
    expect(selection.isGestureActive()).toBe(false);
    expect(selection.getAnchor()).not.toBeNull();
    expect(commits).toEqual([]);
    await kernel.destroy();
  });

  it('derived recomputes never touch the fact mid-gesture; clear leaves it to the gesture owner', async () => {
    const fixture = await boot([pageA]);
    await fixture.selection.ensureLoaded(toPageRef(101));
    fixture.selection.beginGestureAt(toPageRef(101), { x: 14, y: 5 });
    fixture.rotateAll(); // registry refresh → recompute
    await settle();
    expect(fixture.selection.isGestureActive()).toBe(true);
    fixture.selection.clear();
    expect(fixture.selection.isGestureActive()).toBe(true);
    fixture.selection.endGesture(); // nothing to commit
    expect(fixture.selection.isGestureActive()).toBe(false);
    await fixture.kernel.destroy();
  });
});

describe('selection — the anchor', () => {
  it('is null without a selection, and unions the page segments with one', async () => {
    const { kernel, selection } = await boot([pageA]);
    expect(selection.getAnchor()).toBeNull();
    selection.select({ page: toPageRef(101), start: 1, count: 3 });
    await settle();
    const anchor = selection.getAnchor()!;
    expect(anchor.page).toEqual(toPageRef(101));
    // Glyphs are 8px cells starting at x=10: chars 1..3 span x 18..42.
    expect(anchor.bounds.x).toBeCloseTo(18);
    expect(anchor.bounds.width).toBeCloseTo(24);
    expect(anchor.bounds.height).toBeGreaterThan(0);
    await kernel.destroy();
  });

  it('anchors a cross-page selection on the end page', async () => {
    const { kernel, selection } = await boot([pageA, pageB]);
    selection.selectAll();
    await settle();
    expect(selection.getAnchor()!.page).toEqual(toPageRef(102));
    await kernel.destroy();
  });
});

describe('selection — reads are reference-stable', () => {
  it('returns the same snapshot, page list and rects until the selection changes', async () => {
    const { kernel, selection } = await boot([pageA]);
    selection.select({ page: toPageRef(101), start: 0, count: 2 });
    await settle();
    expect(selection.getSnapshot()).toBe(selection.getSnapshot());
    expect(selection.listSelectedPages()).toBe(selection.listSelectedPages());
    expect(selection.listRects(toPageRef(101))).toBe(selection.listRects(toPageRef(101)));
    expect(selection.listSegments(toPageRef(101))).toBe(selection.listSegments(toPageRef(101)));
    const before = selection.getSnapshot();
    selection.select({ page: toPageRef(101), start: 0, count: 3 });
    expect(selection.getSnapshot()).not.toBe(before);
    await kernel.destroy();
  });
});

describe('selection — events', () => {
  it('onChanged carries the range and the pages; onCleared follows a clear', async () => {
    const { kernel, selection } = await boot([pageA]);
    await selection.ensureLoaded(toPageRef(101));
    const log: string[] = [];
    selection.onChanged((event) =>
      log.push(`changed:${event.range ? event.range.end.index : '-'}:${event.pages.length}`),
    );
    selection.onCleared(() => log.push('cleared'));
    selection.select({ page: toPageRef(101), start: 0, count: 2 });
    selection.beginGestureAt(toPageRef(101), { x: 14, y: 5 });
    selection.extendTo(toPageRef(101), { x: 30, y: 5 });
    selection.endGesture();
    selection.clear();
    selection.clear(); // clearing nothing is not a change
    expect(log).toEqual(['changed:2:1', 'changed:1:1', 'changed:3:1', 'changed:-:0', 'cleared']);
    await kernel.destroy();
  });

  it('fires only when the range or its segments change', async () => {
    const fixture = await boot([pageA]);
    await fixture.selection.ensureLoaded(toPageRef(101));
    let changes = 0;
    fixture.selection.onChanged(() => changes++);
    fixture.selection.beginGestureAt(toPageRef(101), { x: 14, y: 5 });
    fixture.selection.extendTo(toPageRef(101), { x: 30, y: 5 });
    const snapshot = fixture.selection.getSnapshot();
    fixture.selection.extendTo(toPageRef(101), { x: 31, y: 5 }); // the same glyph
    fixture.selection.select(fixture.selection.getRange()!); // the same range
    expect(changes).toBe(2);
    expect(fixture.selection.getSnapshot()).toBe(snapshot);
    fixture.rotateAll(); // page space is unrotated: the segments stay the same
    await settle();
    expect(changes).toBe(2);
    await fixture.kernel.destroy();
  });

  it("a boundary page's geometry arriving mid-selection fills its segments and fires onChanged", async () => {
    const { kernel, selection } = await boot([pageA, pageB]);
    const pageCounts: number[] = [];
    selection.onChanged((event) => pageCounts.push(event.pages.length));
    selection.selectAll();
    expect(pageCounts).toEqual([0]); // nothing loaded yet: the range, no segments
    await settle();
    expect(pageCounts.length).toBeGreaterThan(1);
    expect(pageCounts[pageCounts.length - 1]).toBe(2);
    await kernel.destroy();
  });

  it('a throwing listener neither breaks its siblings nor the write', async () => {
    const { kernel, selection } = await boot([pageA]);
    const seen: number[] = [];
    selection.onChanged(() => {
      throw new Error('boom');
    });
    selection.onChanged(() => seen.push(1));
    expect(() => selection.select({ page: toPageRef(101), start: 0, count: 2 })).not.toThrow();
    expect(seen).toEqual([1]);
    expect(selection.hasSelection()).toBe(true);
    await kernel.destroy();
  });
});

const origin = { kind: 'local', sessionId: 's1', sub: null, ts: 1 };
const applied = (pageObjectNumber: number, status = 'applied') => ({
  page: toPageRef(pageObjectNumber),
  status,
});

describe('selection — invalidation', () => {
  it('an applied redaction clears the selection and re-reads the page geometry', async () => {
    const fixture = await boot([pageA]);
    fixture.selection.select({ page: toPageRef(101), start: 0, count: 4 });
    await settle();
    expect(fixture.geometryReads).toHaveBeenCalledTimes(1);
    fixture.emit({ type: 'redaction.applied', origin, results: [applied(101)] });
    expect(fixture.selection.hasSelection()).toBe(false);
    await settle();
    expect(fixture.geometryReads).toHaveBeenCalledTimes(2);
    await fixture.kernel.destroy();
  });

  it('a redaction that applied nothing leaves the selection and the geometry alone', async () => {
    const fixture = await boot([pageA]);
    fixture.selection.select({ page: toPageRef(101), start: 0, count: 4 });
    await settle();
    fixture.emit({ type: 'redaction.applied', origin, results: [applied(101, 'skipped')] });
    await settle();
    expect(fixture.selection.hasSelection()).toBe(true);
    expect(fixture.geometryReads).toHaveBeenCalledTimes(1);
    await fixture.kernel.destroy();
  });

  it('a flattened page clears the selection and re-reads its geometry and text', async () => {
    const fixture = await boot([pageA]);
    fixture.selection.selectAll();
    await settle();
    await expect(fixture.selection.readText()).resolves.toBe('Hello!');
    fixture.emit({
      type: 'pages.flattened',
      origin,
      pages: [toPageRef(101)],
      results: [applied(101)],
    });
    expect(fixture.selection.hasSelection()).toBe(false);
    await settle();
    expect(fixture.geometryReads).toHaveBeenCalledTimes(2);
    fixture.selection.selectAll();
    await fixture.selection.readText();
    expect(fixture.textReads).toHaveBeenCalledTimes(2);
    await fixture.kernel.destroy();
  });

  it('isLoaded tracks the geometry actually held across a content change', async () => {
    // Regression: the loaded flag outlived a content change, so isLoaded(page)
    // reported true while the page had no geometry to hit-test.
    const fixture = await boot([pageA]);
    await fixture.selection.ensureLoaded(toPageRef(101));
    expect(fixture.selection.isLoaded(toPageRef(101))).toBe(true);
    expect(fixture.selection.isOverText(toPageRef(101), { x: 46, y: 5 })).toBe(true); // glyph 4
    // The redaction leaves two glyphs on the page.
    fixture.replacePage({
      ...pageA,
      geometry: simpleGeometry(2),
      text: { text: 'He', charCount: 2 },
    });
    fixture.emit({ type: 'redaction.applied', origin, results: [applied(101)] });
    await settle();
    expect(fixture.selection.isLoaded(toPageRef(101))).toBe(true);
    expect(fixture.selection.isOverText(toPageRef(101), { x: 14, y: 5 })).toBe(true); // glyph 0
    expect(fixture.selection.isOverText(toPageRef(101), { x: 46, y: 5 })).toBe(false); // gone
    await fixture.kernel.destroy();
  });

  it('a failed re-read leaves the page unloaded with no geometry, and a later warm retries', async () => {
    const fixture = await boot([pageA]);
    await fixture.selection.ensureLoaded(toPageRef(101));
    fixture.failing.add(101);
    fixture.emit({ type: 'redaction.applied', origin, results: [applied(101)] });
    await settle();
    expect(fixture.selection.isLoaded(toPageRef(101))).toBe(false);
    expect(fixture.selection.isOverText(toPageRef(101), { x: 14, y: 5 })).toBe(false);
    fixture.failing.delete(101);
    await fixture.selection.ensureLoaded(toPageRef(101));
    expect(fixture.selection.isLoaded(toPageRef(101))).toBe(true);
    expect(fixture.selection.isOverText(toPageRef(101), { x: 14, y: 5 })).toBe(true);
    await fixture.kernel.destroy();
  });

  it('clears when an endpoint page leaves the registry', async () => {
    const fixture = await boot([pageA, pageB]);
    fixture.selection.selectAll();
    await settle();
    expect(fixture.selection.hasSelection()).toBe(true);
    fixture.removePage(102);
    await settle();
    expect(fixture.selection.hasSelection()).toBe(false);
    expect(fixture.selection.isLoaded(toPageRef(102))).toBe(false);
    await fixture.kernel.destroy();
  });

  it('closing the document disposes the instance: a late geometry read is dropped silently', async () => {
    const fixture = await boot([pageA]);
    const pending = fixture.selection.ensureLoaded(toPageRef(101));
    await fixture.kernel.documents.close('d');
    await expect(pending).resolves.toBeUndefined();
    expect(isPluginError(new Error('x'))).toBe(false);
    await fixture.kernel.destroy();
  });
});
