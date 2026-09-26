/** The selection model: the range, its derived segments, and two facts. */
import type { PageRef } from '@embedpdf/core';
import type { SelectionSegment } from './geometry';

/** A glyph address: a page + a flat character index within that page. */
export interface GlyphPointer {
  page: PageRef;
  glyph: number;
}

/** Anchor = where the selection began, focus = the current end. Inclusive. */
export interface SelectionRange {
  anchor: GlyphPointer;
  focus: GlyphPointer;
}

export interface SelectionState {
  selection: SelectionRange | null;
  /** Derived per-line segments per page (by page object number), page space. */
  segments: Record<number, readonly SelectionSegment[]>;
  /** Pages whose text geometry has loaded (so a layer re-renders when ready). */
  loaded: Record<number, boolean>;
  /** A consumer owns the selection visual (a markup tool draws its own preview). */
  highlightHidden: boolean;
  /** A selection GESTURE is in flight (pointer-down … pointer-up). */
  gestureActive: boolean;
}

export type SelectionAction =
  | { type: 'pageLoaded'; page: PageRef }
  | {
      type: 'set';
      selection: SelectionRange;
      segments: Record<number, readonly SelectionSegment[]>;
    }
  | { type: 'clear' }
  | { type: 'setHighlightHidden'; hidden: boolean }
  | { type: 'setGestureActive'; active: boolean };

export const initialSelectionState = (): SelectionState => ({
  selection: null,
  segments: {},
  loaded: {},
  highlightHidden: false,
  gestureActive: false,
});

export function reduceSelection(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'pageLoaded': {
      const pon = action.page.pageObjectNumber;
      return state.loaded[pon] ? state : { ...state, loaded: { ...state.loaded, [pon]: true } };
    }
    case 'set':
      return { ...state, selection: action.selection, segments: action.segments };
    case 'clear':
      return state.selection === null && Object.keys(state.segments).length === 0
        ? state
        : { ...state, selection: null, segments: {} };
    case 'setHighlightHidden':
      return state.highlightHidden === action.hidden
        ? state
        : { ...state, highlightHidden: action.hidden };
    case 'setGestureActive':
      return state.gestureActive === action.active
        ? state
        : { ...state, gestureActive: action.active };
    default:
      return state;
  }
}
