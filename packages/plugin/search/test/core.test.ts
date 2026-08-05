import { describe, expect, test, vi } from 'vitest';
import type { PluginContext } from '@embedpdf/core';
import { createSearchCapability } from '../src/capability';
import { initialSearchState, searchReducer } from '../src/reducer';
import type { SearchAction, SearchHit, SearchState } from '../src/types';

const hit = (pon: number, charStart: number): SearchHit => ({
  pon,
  pageIndex: 0,
  charStart,
  charCount: 4,
  rects: [{ x: 0, y: 0, width: 10, height: 10 }],
});

const started = (): SearchState =>
  searchReducer(initialSearchState(), {
    type: 'START',
    query: { kind: 'literal', text: 'test' },
  });

describe('searchReducer', () => {
  test('START resets everything and enters searching', () => {
    const dirty: SearchState = {
      ...initialSearchState(),
      hits: [hit(5, 0)],
      hitsByPage: { 5: [0] },
      activeIndex: 0,
      status: 'complete',
    };
    const s = searchReducer(dirty, {
      type: 'START',
      query: { kind: 'literal', text: 'x', matchCase: true },
    });
    expect(s.status).toBe('searching');
    expect(s.hits).toEqual([]);
    expect(s.hitsByPage).toEqual({});
    expect(s.activeIndex).toBe(-1);
    // The engine query is the stored intent — a box restores from its
    // derived projection (capability.currentInput()).
    expect(s.query).toEqual({ kind: 'literal', text: 'x', matchCase: true });
  });

  test('APPEND accumulates hits, indexes by page, activates the first hit', () => {
    let s = started();
    s = searchReducer(s, { type: 'APPEND', hits: [hit(5, 0), hit(5, 9)], scanned: 1, total: 8 });
    s = searchReducer(s, { type: 'APPEND', hits: [hit(7, 2)], scanned: 3, total: 8 });
    expect(s.hits.length).toBe(3);
    expect(s.hitsByPage).toEqual({ 5: [0, 1], 7: [2] });
    expect(s.activeIndex).toBe(0);
    expect(s.progress).toEqual({ scanned: 3, total: 8 });
  });

  test('an empty APPEND only advances progress', () => {
    let s = started();
    s = searchReducer(s, { type: 'APPEND', hits: [], scanned: 4, total: 8 });
    expect(s.hits.length).toBe(0);
    expect(s.activeIndex).toBe(-1);
    expect(s.progress.scanned).toBe(4);
  });

  test('APPEND keeps an explicit active index', () => {
    let s = started();
    s = searchReducer(s, { type: 'APPEND', hits: [hit(5, 0), hit(5, 9)], scanned: 1, total: 8 });
    s = searchReducer(s, { type: 'SET_ACTIVE', index: 1 });
    s = searchReducer(s, { type: 'APPEND', hits: [hit(7, 2)], scanned: 2, total: 8 });
    expect(s.activeIndex).toBe(1);
  });

  test('COMPLETE and ERROR set terminal status; CLEAR returns to idle', () => {
    let s = started();
    expect(searchReducer(s, { type: 'COMPLETE' }).status).toBe('complete');
    const failed = searchReducer(s, { type: 'ERROR', message: 'boom' });
    expect(failed.status).toBe('error');
    expect(failed.error).toBe('boom');
    expect(searchReducer(failed, { type: 'CLEAR' })).toEqual(initialSearchState());
  });
});

// ── findAll: the session-free service ────────────────────────────────────────

/** An engine slice promise: awaitable + abortable, like doc.search.query. */
const abortable = <T>(value: T) => Object.assign(Promise.resolve(value), { abort: () => {} });

function mockCtx(slices: unknown[]) {
  const requests: unknown[] = [];
  const dispatch = vi.fn();
  const ctx = {
    doc: {
      search: {
        query: (request: unknown) => {
          requests.push(request);
          return abortable(slices.shift());
        },
      },
    },
    document: () => ({
      pages: [
        {
          pageObjectNumber: 5,
          index: 0,
          boxes: { crop: { left: 0, bottom: 0, right: 100, top: 100 } },
          rotation: 0,
          userUnit: 1,
        },
      ],
    }),
    getState: () => initialSearchState(),
    dispatch,
    tryGet: () => null,
  };
  return { ctx: ctx as unknown as PluginContext<SearchState, SearchAction>, requests, dispatch };
}

describe('findAll', () => {
  test('walks the cursor chain, returns every hit, and NEVER touches state', async () => {
    const match = (charStart: number) => ({
      pageObjectNumber: 5,
      charStart,
      charCount: 4,
      rects: [{ left: 10, bottom: 20, right: 50, top: 40 }],
    });
    const { ctx, requests, dispatch } = mockCtx([
      { matches: [match(0), match(9)], nextCursor: 'c1', scannedPages: 1, totalPages: 2 },
      { matches: [match(2)], nextCursor: null, scannedPages: 2, totalPages: 2 },
    ]);
    const capability = createSearchCapability(ctx);

    const hits = await capability.findAll({ text: 'test' });

    expect(hits.length).toBe(3);
    expect(hits.map((h) => h.charStart)).toEqual([0, 9, 2]);
    for (const h of hits) {
      expect(h.pon).toBe(5);
      expect(h.pageIndex).toBe(0);
      expect(h.rects.length).toBe(1);
    }
    // the cursor was threaded through the second request
    expect((requests[1] as { cursor?: string }).cursor).toBe('c1');
    // session-free: no sidebar, no highlights, no activeIndex — no dispatch
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('pins the mode when asked (rects: no snippet extraction)', async () => {
    const { ctx, requests } = mockCtx([
      { matches: [], nextCursor: null, scannedPages: 1, totalPages: 1 },
    ]);
    const capability = createSearchCapability(ctx);

    await capability.findAll({ text: 'x' }, { mode: 'rects' });

    expect((requests[0] as { mode?: string }).mode).toBe('rects');
  });
});
