import type { PageObjectNumber, PluginContext } from '@embedpdf/core';
import { textQuadBounds, type Point } from '@embedpdf/core-geometry';
import {
  expandTextRangeToLine,
  expandTextRangeToWord,
  textGlyphAt,
  textGlyphQuad,
  textSegmentsForRange,
} from '@embedpdf/engine-core/runtime';
import {
  buildSelectionPageGeometry,
  contentPointToPdf,
  toContentSegment,
  toContentTextQuad,
  type SelectionPageGeometry,
  type SelectionSegment,
} from './geometry';
import type {
  GlyphPointer,
  SelectionAction,
  SelectionCapability,
  SelectionEndpoint,
  SelectionRange,
  SelectionSnapshot,
  SelectionState,
} from './types';

const EMPTY_SEGMENTS: SelectionSegment[] = [];

/**
 * The selection capability. The reducer state holds the selection range, the
 * derived content-space segments (per page), and per-page loaded flags; the
 * (large, non-serializable) per-page canonical layout is cached HERE in the
 * closure. Segmentation itself is the engine-core text layout — selection
 * owns gestures and state, never how glyphs become lines.
 *
 * Selection is cross-page: glyphs are ordered globally by (pageIndex, glyph),
 * so a drag from page 2 into page 4 selects the tail of 2, all of 3, and the
 * head of 4. `recompute` rebuilds the merged line segments for every loaded
 * page in the span and re-runs whenever a mid-span page finishes loading.
 */
export function createSelectionCapability(
  ctx: PluginContext<SelectionState, SelectionAction>,
): SelectionCapability {
  const cache = new Map<number, SelectionPageGeometry>();
  const pending = new Set<number>();
  // Consumers (e.g. text-markup) observe the selection without selection knowing
  // about them: `change` fires whenever the segments change, `commit` when a
  // gesture ends (pointer-up). One typed callback each — not an event bus.
  const changeCbs = new Set<() => void>();
  const commitCbs = new Set<() => void>();
  const fireChange = (): void => changeCbs.forEach((cb) => cb());

  const pageIndexOf = (pon: PageObjectNumber): number =>
    ctx.document()?.pages.findIndex((p) => p.pageObjectNumber === pon) ?? -1;
  const ponAtIndex = (i: number): PageObjectNumber | undefined =>
    ctx.document()?.pages[i]?.pageObjectNumber;

  const glyphAt = (geom: SelectionPageGeometry, point: Point): number | null =>
    textGlyphAt(geom.layout, contentPointToPdf(geom, point));

  // Order the two ends of a selection by document position (page, then glyph).
  function orderedEnds(sel: SelectionRange): {
    start: GlyphPointer;
    end: GlyphPointer;
    direction: 'forward' | 'backward';
  } {
    const ai = pageIndexOf(sel.anchor.pon);
    const fi = pageIndexOf(sel.focus.pon);
    const anchorFirst = ai < fi || (ai === fi && sel.anchor.glyph <= sel.focus.glyph);
    return anchorFirst
      ? { start: sel.anchor, end: sel.focus, direction: 'forward' }
      : { start: sel.focus, end: sel.anchor, direction: 'backward' };
  }

  function endpointFor(ptr: GlyphPointer, which: 'start' | 'end'): SelectionEndpoint | null {
    const segments = ctx.getState().segments[ptr.pon] ?? EMPTY_SEGMENTS;
    if (!segments.length) return null;
    const segment = which === 'start' ? segments[0] : segments[segments.length - 1];

    // Anchor the endpoint to the boundary GLYPH's own oriented cell so caret
    // placement lands on the exact character edge; fall back to the segment
    // when the glyph is degenerate (e.g. a generated space).
    const geom = cache.get(ptr.pon);
    const cell = geom ? textGlyphQuad(geom.layout, ptr.glyph) : null;
    if (geom && cell) {
      const glyphQuad = toContentTextQuad(geom, cell);
      return {
        pon: ptr.pon,
        glyphQuad,
        advance: segment.advance,
        rect: textQuadBounds(glyphQuad),
      };
    }
    return { pon: ptr.pon, glyphQuad: segment.quad, advance: segment.advance, rect: segment.rect };
  }

  function snapshot(): SelectionSnapshot {
    const { selection, segments } = ctx.getState();
    const pages = Object.keys(segments)
      .map(Number)
      .filter((pon) => (segments[pon]?.length ?? 0) > 0)
      .map((pon) => ({ pon: pon as PageObjectNumber, segments: segments[pon] }));
    if (!selection) return { pages, start: null, end: null, direction: 'forward' };
    const { start, end, direction } = orderedEnds(selection);
    return {
      pages,
      start: endpointFor(start, 'start'),
      end: endpointFor(end, 'end'),
      direction,
    };
  }

  function ensurePage(pon: PageObjectNumber): void {
    if (cache.has(pon) || pending.has(pon)) return;
    const doc = ctx.doc;
    const layout = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon);
    if (!doc || !layout) return;
    pending.add(pon);
    doc
      .page(pon)
      .geometry.read()
      .then(
        (snapshot) => {
          pending.delete(pon);
          cache.set(
            pon,
            buildSelectionPageGeometry(
              snapshot,
              layout.boxes.crop,
              layout.rotation,
              layout.userUnit,
            ),
          );
          ctx.dispatch({ type: 'PAGE_LOADED', pon });
          if (ctx.getState().selection) recompute(); // a mid-span page arrived → fill its segments
        },
        () => {
          pending.delete(pon); // doc closed / read aborted — ignore
        },
      );
  }

  // Rebuild merged line segments for every loaded page in the span; ensure the rest.
  function recompute(sel: SelectionRange | null = ctx.getState().selection): void {
    if (!sel) return;
    const { start, end } = orderedEnds(sel);
    const si = pageIndexOf(start.pon);
    const ei = pageIndexOf(end.pon);
    if (si < 0 || ei < 0) return;
    const segments: Record<number, SelectionSegment[]> = {};
    for (let i = si; i <= ei; i++) {
      const pon = ponAtIndex(i);
      if (pon == null) continue;
      const geom = cache.get(pon);
      if (!geom) {
        ensurePage(pon); // not loaded yet — it'll recompute when ready
        continue;
      }
      const from = i === si ? start.glyph : 0;
      const to = i === ei ? end.glyph : geom.layout.glyphs.length - 1;
      segments[pon] = textSegmentsForRange(geom.layout, from, to - from + 1).map((s) =>
        toContentSegment(geom, s),
      );
    }
    ctx.dispatch({ type: 'SET', selection: sel, segments });
    fireChange();
  }

  // Set the selection to a flat [from,to] glyph span on one page (word/line).
  function selectSpan(pon: PageObjectNumber, point: Point, expand: 'word' | 'line'): void {
    const geom = cache.get(pon);
    if (!geom) return;
    const i = glyphAt(geom, point);
    if (i == null) return;
    const [from, to] =
      expand === 'word'
        ? expandTextRangeToWord(geom.layout, i)
        : expandTextRangeToLine(geom.layout, i);
    recompute({ anchor: { pon, glyph: from }, focus: { pon, glyph: to } });
  }

  return {
    ensurePage,

    isLoaded: (pon) => !!ctx.getState().loaded[pon],

    isOverText: (pon, point: Point) => {
      const geom = cache.get(pon);
      return geom ? glyphAt(geom, point) != null : false;
    },

    beginAt: (pon, point: Point) => {
      const geom = cache.get(pon);
      if (!geom) return false;
      const i = glyphAt(geom, point);
      if (i == null) return false; // not near text — caller deselects, doesn't capture
      recompute({ anchor: { pon, glyph: i }, focus: { pon, glyph: i } });
      return true;
    },

    selectWord: (pon, point: Point) => selectSpan(pon, point, 'word'),
    selectLine: (pon, point: Point) => selectSpan(pon, point, 'line'),

    extendTo: (pon, point: Point) => {
      const cur = ctx.getState().selection;
      if (!cur) return;
      const geom = cache.get(pon);
      if (!geom) {
        ensurePage(pon); // dragged onto a not-yet-loaded page — warm it, recompute on load
        return;
      }
      const i = glyphAt(geom, point);
      if (i == null) return; // off-text — keep the last focus
      recompute({ anchor: cur.anchor, focus: { pon, glyph: i } });
    },

    end: () => commitCbs.forEach((cb) => cb()), // the gesture ended (pointer-up) → notify consumers

    clear: () => {
      ctx.dispatch({ type: 'CLEAR' });
      fireChange();
    },

    snapshot,

    segmentsForPage: (pon) => ctx.getState().segments[pon] ?? EMPTY_SEGMENTS,

    rectsForPage: (pon) =>
      (ctx.getState().segments[pon] ?? EMPTY_SEGMENTS).map((s) => s.rect),

    hasSelection: () => ctx.getState().selection != null,

    selectedPages: () => {
      const { segments } = ctx.getState();
      return Object.keys(segments)
        .map(Number)
        .filter((pon) => (segments[pon]?.length ?? 0) > 0) as PageObjectNumber[];
    },

    onChange: (cb) => {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onCommit: (cb) => {
      commitCbs.add(cb);
      return () => commitCbs.delete(cb);
    },

    setHighlightVisible: (visible) =>
      ctx.dispatch({ type: 'SET_HIGHLIGHT_HIDDEN', hidden: !visible }),
    highlightVisible: () => !ctx.getState().highlightHidden,
  };
}
