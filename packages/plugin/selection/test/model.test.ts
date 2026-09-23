import { describe, expect, it } from 'vitest';
import { toPageRef, type DocumentEvent } from '@embedpdf/core';
import { textQuadFromRect } from '@embedpdf/core-geometry';

import type { SelectionSegment } from '../src/geometry';
import {
  clearSelection,
  contentChangedPagesOf,
  initialSelectionState,
  setGestureActive,
  setHighlightHidden,
  setSelection,
  type SelectionRange,
} from '../src/model';

const segment = (x: number): SelectionSegment => {
  const rect = { x, y: 0, width: 8, height: 10 };
  return { quad: textQuadFromRect(rect), rect, advance: 1 };
};

const range = (focusGlyph: number): SelectionRange => ({
  anchor: { page: toPageRef(1), glyph: 0 },
  focus: { page: toPageRef(1), glyph: focusGlyph },
});

const documentEvent = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

describe('selection model', () => {
  it('setSelection returns the same state when the range and segments are unchanged', () => {
    const state = setSelection(initialSelectionState(), range(3), { 1: [segment(0)] });
    // Equal by value, new objects: nothing changed.
    expect(setSelection(state, range(3), { 1: [segment(0)] })).toBe(state);
  });

  it('setSelection keeps the previous array of every page whose segments are unchanged', () => {
    const state = setSelection(initialSelectionState(), range(3), { 1: [segment(0)] });
    const next = setSelection(state, range(3), { 1: [segment(0)], 2: [segment(8)] });
    expect(next).not.toBe(state);
    expect(next.segments[1]).toBe(state.segments[1]);
    expect(next.selection).toBe(state.selection);
    expect(next.segments[2]).toEqual([segment(8)]);
  });

  it('setSelection replaces a changed range or changed segments', () => {
    const state = setSelection(initialSelectionState(), range(3), { 1: [segment(0)] });
    const extended = setSelection(state, range(4), { 1: [segment(0)] });
    expect(extended.selection).toEqual(range(4));
    expect(extended.segments).toBe(state.segments);
    const moved = setSelection(state, range(3), { 1: [segment(2)] });
    expect(moved.segments[1]).toEqual([segment(2)]);
    const dropped = setSelection(state, range(3), {});
    expect(dropped.segments).toEqual({});
  });

  it('clearSelection empties the range and segments, and is a no-op when empty', () => {
    const empty = initialSelectionState();
    expect(clearSelection(empty)).toBe(empty);
    const cleared = clearSelection(setSelection(empty, range(3), { 1: [segment(0)] }));
    expect(cleared.selection).toBeNull();
    expect(cleared.segments).toEqual({});
  });

  it('the fact transitions return the same state when nothing changes', () => {
    const state = initialSelectionState();
    expect(setHighlightHidden(state, false)).toBe(state);
    expect(setHighlightHidden(state, true).highlightHidden).toBe(true);
    expect(setGestureActive(state, false)).toBe(state);
    expect(setGestureActive(state, true).gestureActive).toBe(true);
  });

  it('contentChangedPagesOf names the page an annotation flatten painted into', () => {
    const page = toPageRef(3);
    expect(
      contentChangedPagesOf(
        documentEvent({ type: 'annotations.flattened', page, results: [{ status: 'applied' }] }),
      ),
    ).toEqual([page]);
    expect(
      contentChangedPagesOf(
        documentEvent({ type: 'annotations.flattened', page, results: [{ status: 'skipped' }] }),
      ),
    ).toBeNull();
  });

  it('contentChangedPagesOf names the applied pages of redactions and flattens only', () => {
    const results = [
      { page: toPageRef(1), status: 'applied' },
      { page: toPageRef(2), status: 'unchanged' },
    ];
    expect(contentChangedPagesOf(documentEvent({ type: 'redaction.applied', results }))).toEqual([
      toPageRef(1),
    ]);
    expect(contentChangedPagesOf(documentEvent({ type: 'pages.flattened', results }))).toEqual([
      toPageRef(1),
    ]);
    const nothingApplied = [{ page: toPageRef(2), status: 'skipped' }];
    expect(
      contentChangedPagesOf(documentEvent({ type: 'redaction.applied', results: nothingApplied })),
    ).toBeNull();
    expect(contentChangedPagesOf(documentEvent({ type: 'annotation.created' }))).toBeNull();
  });
});
