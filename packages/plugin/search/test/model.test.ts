import { describe, expect, test } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import type { SearchHit } from '../src/contract';
import { initialSearchState, pagesWithHits, reduceSearch, type SearchState } from '../src/model';

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

const hit = (pon: number, charStart: number): SearchHit => ({
  page: toPageRef(pon),
  pageIndex: 0,
  charStart,
  charCount: 4,
  segments: [seg({ x: 0, y: 0, width: 10, height: 10 })],
  bounds: { x: 0, y: 0, width: 10, height: 10 },
});

const started = (): SearchState =>
  reduceSearch(initialSearchState(), {
    type: 'START',
    query: { text: 'test' },
    operationId: 'session#1',
  });

describe('reduceSearch', () => {
  test('START resets everything and enters searching with the operation id', () => {
    const dirty: SearchState = {
      ...initialSearchState(),
      hits: [hit(5, 0)],
      hitsByPage: { 5: [hit(5, 0)] },
      activeIndex: 0,
      status: 'complete',
    };
    const s = reduceSearch(dirty, {
      type: 'START',
      query: { text: 'x', matchCase: true },
      operationId: 'session#2',
    });
    expect(s.status).toBe('searching');
    expect(s.hits).toEqual([]);
    expect(s.hitsByPage).toEqual({});
    expect(s.activeIndex).toBe(-1);
    expect(s.operationId).toBe('session#2');
    expect(s.query).toEqual({ text: 'x', matchCase: true });
  });

  test('APPEND accumulates, keeps per-page arrays reference-stable, activates the first hit', () => {
    let s = started();
    s = reduceSearch(s, { type: 'APPEND', hits: [hit(5, 0), hit(5, 9)], scanned: 1, total: 8 });
    const page5 = s.hitsByPage[5];
    s = reduceSearch(s, { type: 'APPEND', hits: [hit(7, 2)], scanned: 3, total: 8 });
    expect(s.hits.length).toBe(3);
    expect(s.hitsByPage[5]).toBe(page5); // untouched page keeps its array
    expect(s.hitsByPage[7].map((h) => h.charStart)).toEqual([2]);
    expect(s.activeIndex).toBe(0);
    expect(s.progress).toEqual({ scanned: 3, total: 8 });
    expect(pagesWithHits(s).map((p) => p.pageObjectNumber)).toEqual([5, 7]);
  });

  test('an empty APPEND only advances progress; an explicit active index survives appends', () => {
    let s = started();
    s = reduceSearch(s, { type: 'APPEND', hits: [], scanned: 4, total: 8 });
    expect(s.hits.length).toBe(0);
    expect(s.activeIndex).toBe(-1);
    s = reduceSearch(s, { type: 'APPEND', hits: [hit(5, 0), hit(5, 9)], scanned: 5, total: 8 });
    s = reduceSearch(s, { type: 'SET_ACTIVE', index: 1 });
    s = reduceSearch(s, { type: 'APPEND', hits: [hit(7, 2)], scanned: 6, total: 8 });
    expect(s.activeIndex).toBe(1);
  });

  test('COMPLETE, CANCELLED and ERROR are terminal; CLEAR returns to idle', () => {
    const s = started();
    expect(reduceSearch(s, { type: 'COMPLETE' }).status).toBe('complete');
    expect(reduceSearch(s, { type: 'CANCELLED' }).status).toBe('cancelled');
    const failed = reduceSearch(s, {
      type: 'ERROR',
      error: { code: 'operation-failed', message: 'boom', capability: 'search' },
    });
    expect(failed.status).toBe('error');
    expect(failed.error?.message).toBe('boom');
    expect(reduceSearch(failed, { type: 'CLEAR' })).toEqual(initialSearchState());
  });
});
