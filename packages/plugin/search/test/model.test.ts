import { describe, expect, test } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import type { SearchHit } from '../src/contract';
import {
  appendHits,
  cancelSession,
  clearSession,
  completeSession,
  failSession,
  initialSearchState,
  pagesWithHits,
  setActiveHit,
  startSession,
  type SearchState,
} from '../src/model';

const seg = (rect: { x: number; y: number; width: number; height: number }) => ({
  quad: {
    upperStart: { x: rect.x, y: rect.y },
    upperEnd: { x: rect.x + rect.width, y: rect.y },
    lowerStart: { x: rect.x, y: rect.y + rect.height },
    lowerEnd: { x: rect.x + rect.width, y: rect.y + rect.height },
  },
  rect,
  advance: 1 as const,
});

const hit = (pageObjectNumber: number, charStart: number): SearchHit => ({
  page: toPageRef(pageObjectNumber),
  pageIndex: 0,
  charStart,
  charCount: 4,
  segments: [seg({ x: 0, y: 0, width: 10, height: 10 })],
  bounds: { x: 0, y: 0, width: 10, height: 10 },
});

const started = (): SearchState =>
  startSession(initialSearchState(), { text: 'test' }, 'session#1');

describe('search transitions', () => {
  test('startSession resets everything and enters searching with the operation id', () => {
    const dirty: SearchState = {
      ...initialSearchState(),
      hits: [hit(5, 0)],
      hitsByPage: { 5: [hit(5, 0)] },
      activeIndex: 0,
      status: 'complete',
    };
    const state = startSession(dirty, { text: 'x', matchCase: true }, 'session#2');
    expect(state.status).toBe('searching');
    expect(state.hits).toEqual([]);
    expect(state.hitsByPage).toEqual({});
    expect(state.activeIndex).toBe(-1);
    expect(state.operationId).toBe('session#2');
    expect(state.query).toEqual({ text: 'x', matchCase: true });
  });

  test('appendHits accumulates, keeps per-page arrays reference-stable, activates the first hit', () => {
    let state = started();
    state = appendHits(state, [hit(5, 0), hit(5, 9)], { scanned: 1, total: 8 });
    const page5 = state.hitsByPage[5];
    state = appendHits(state, [hit(7, 2)], { scanned: 3, total: 8 });
    expect(state.hits.length).toBe(3);
    expect(state.hitsByPage[5]).toBe(page5); // an untouched page keeps its array
    expect(state.hitsByPage[7].map((found) => found.charStart)).toEqual([2]);
    expect(state.activeIndex).toBe(0);
    expect(state.progress).toEqual({ scanned: 3, total: 8 });
    expect(pagesWithHits(state).map((page) => page.pageObjectNumber)).toEqual([5, 7]);
  });

  test('an empty slice only advances progress; an explicit active index survives appends', () => {
    let state = started();
    state = appendHits(state, [], { scanned: 4, total: 8 });
    expect(state.hits.length).toBe(0);
    expect(state.activeIndex).toBe(-1);
    state = appendHits(state, [hit(5, 0), hit(5, 9)], { scanned: 5, total: 8 });
    state = setActiveHit(state, 1);
    state = appendHits(state, [hit(7, 2)], { scanned: 6, total: 8 });
    expect(state.activeIndex).toBe(1);
  });

  test('complete, cancelled and failed are terminal; clearing returns to idle', () => {
    const state = started();
    expect(completeSession(state).status).toBe('complete');
    expect(cancelSession(state).status).toBe('cancelled');
    const failed = failSession(state, {
      code: 'operation-failed',
      message: 'boom',
      capability: 'search',
    });
    expect(failed.status).toBe('error');
    expect(failed.error?.message).toBe('boom');
    expect(clearSession(failed)).toEqual(initialSearchState());
  });
});
