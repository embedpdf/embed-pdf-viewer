import {
  PluginError,
  memo,
  memoByKey,
  type PluginContext,
  type DocCapability,
  type OperationOptions,
  type PageInfo,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/core';
import { boundsOfRects, textQuadBounds, type Point, type Rect } from '@embedpdf/core-geometry';
import {
  sliceText,
  toPageRef,
  type PageTextSnapshot,
  type TextLayout,
} from '@embedpdf/engine-core/runtime';
import { connectSelection } from './connect';
import type {
  SelectionAnchor,
  SelectionChangedEvent,
  SelectionClearedEvent,
  SelectionCommittedEvent,
  SelectionConfig,
  SelectionEndpoint,
  SelectionRangeInput,
  SelectionSnapshot,
  TextRange,
} from './contract';
import {
  buildSelectionPageGeometry,
  contentPointToPdf,
  toContentSegment,
  toContentTextQuad,
  type SelectionPageGeometry,
  type SelectionSegment,
} from './geometry';
import type { SelectionHostCapability } from './host-contract';
import {
  clearSelection,
  contentChangedPagesOf,
  setGestureActive,
  setHighlightHidden,
  setSelection,
  type GlyphPosition,
  type SegmentsByPage,
  type SelectionRange,
  type SelectionState,
} from './model';

const SELECT_SCOPE: DocCapability = 'doc.text.select';
const COPY_SCOPE: DocCapability = 'doc.text.copy';
const EMPTY_SEGMENTS: readonly SelectionSegment[] = Object.freeze([]);
const EMPTY_PAGES: readonly PageRef[] = Object.freeze([]);
/** How many page-text reads a `readText` keeps in flight at once. */
const TEXT_READ_CONCURRENCY = 8;
/** An open-ended focus: settles to the page's real last character once its geometry loads. */
const OPEN_END = Number.MAX_SAFE_INTEGER;

/** Everything the read model derives from one state object, built once per state. */
interface ReadModel {
  readonly snapshot: SelectionSnapshot;
  readonly pages: readonly PageRef[];
  readonly anchor: SelectionAnchor | null;
}

/** The layout parameters page-space geometry depends on. */
const layoutKeyOf = (layout: PageInfo): string => {
  const crop = layout.boxes.crop;
  return `${layout.rotation}|${layout.userUnit}|${crop.left},${crop.bottom},${crop.right},${crop.top}`;
};

/**
 * The selection controller.
 *
 * State holds the range and its derived page-space segments. Engine data
 * lives outside state:
 *
 *   - text geometry is a page mirror: PDF-space snapshots loaded on demand,
 *     re-read when a confirmed event changes a page's content (redaction
 *     apply, flatten) and dropped when a page is deleted. Page-space
 *     geometry is derived from a snapshot and the page's current layout, so
 *     a view rotation re-derives without asking the engine again.
 *   - `textSnapshots` holds per-page text promises for `readText`, dropped
 *     on the same content changes and when a page leaves the registry.
 *
 * `recompute` rebuilds the segments of every loaded page in the span and
 * warms the rest, which recompute when their geometry arrives. The change
 * and clear events are derived from state changes in one place.
 *
 * Selection is cross-page: glyphs are ordered globally by (page index,
 * glyph), so a drag from page 2 into page 4 selects the tail of 2, all of 3,
 * and the head of 4. Stored endpoints are clamped once their page's geometry
 * is known, which is how `selectAll`'s open end settles.
 */
export function createSelectionController(
  ctx: PluginContext<SelectionState>,
  config: SelectionConfig = {},
) {
  const changed = ctx.events.source<SelectionChangedEvent>();
  const committed = ctx.events.source<SelectionCommittedEvent>();
  const cleared = ctx.events.source<SelectionClearedEvent>();
  const textSnapshots = new Map<PageObjectNumber, Promise<PageTextSnapshot>>();

  const state = () => ctx.state.get();
  const canSelect = (): boolean => ctx.doc.security.allows(SELECT_SCOPE);
  const canCopy = (): boolean => ctx.doc.security.allows(COPY_SCOPE);
  const assertScope = (scope: DocCapability, operation: string): void => {
    if (!ctx.doc.security.allows(scope)) {
      throw new PluginError('permission-denied', 'selection', `${operation} requires ${scope}`, {
        details: { required: scope },
      });
    }
  };

  // ── page addressing (the registry is the truth for order and layout) ──
  const pageIndexOf = (page: PageRef): number => ctx.getPage(page)?.index ?? -1;
  const pageAtIndex = (index: number): PageRef | undefined => ctx.document()?.pages[index]?.ref;

  // ── text geometry ──
  const geometry = ctx.pageMirror<TextLayout>({
    name: 'geometry',
    load: (doc, page) => doc.page(page).text.layout(),
    affected: contentChangedPagesOf,
    changed: ({ cause }) => {
      // A page's geometry arrived: a boundary page's segments can fill in.
      if (cause !== 'load') return;
      const current = state().selection;
      if (current) recompute(current);
    },
  });

  /** A page's snapshot while it is loaded and current: a page whose re-read
   *  failed has no geometry, exactly as {@link SelectionHostCapability.isLoaded} says. */
  const snapshotOf = (page: PageRef): TextLayout | undefined =>
    geometry.getStatus(page) === 'ready' ? geometry.get(page) : undefined;

  /** Page-space geometry for a page, derived from its snapshot and current layout. */
  const pageGeometryOf = memoByKey(
    (pageObjectNumber: PageObjectNumber) => {
      const page = toPageRef(pageObjectNumber);
      const layout = ctx.getPage(page);
      return [snapshotOf(page), layout ? layoutKeyOf(layout) : null];
    },
    (pageObjectNumber, snapshot, layoutKey): SelectionPageGeometry | null => {
      const layout = ctx.getPage(toPageRef(pageObjectNumber));
      if (!snapshot || layoutKey === null || !layout) return null;
      return buildSelectionPageGeometry(
        snapshot,
        layout.boxes.crop,
        layout.rotation,
        layout.userUnit,
      );
    },
  );
  const geometryFor = (page: PageRef) => pageGeometryOf(page.pageObjectNumber);

  const glyphAt = (pageGeometry: SelectionPageGeometry, point: Point): number | null =>
    pageGeometry.layout.charAt(contentPointToPdf(pageGeometry, point));

  /** Warm a page's geometry; the returned promise never rejects (see the host contract). */
  function ensureLoaded(page: PageRef): Promise<void> {
    // Authorized-only warming: without doc.text.select the read is guaranteed
    // to be refused, so it is not issued. The engine stays the security boundary.
    if (!canSelect() || !ctx.getPage(page)) return Promise.resolve();
    return geometry.ensureLoaded(page).catch(() => {
      /* refused or failed: nothing to paint, and a later call retries */
    });
  }

  // ── the range model ──
  function orderedEnds(selection: SelectionRange): {
    start: GlyphPosition;
    end: GlyphPosition;
    direction: 'forward' | 'backward';
  } {
    const anchorPageIndex = pageIndexOf(selection.anchor.page);
    const focusPageIndex = pageIndexOf(selection.focus.page);
    const anchorFirst =
      anchorPageIndex < focusPageIndex ||
      (anchorPageIndex === focusPageIndex && selection.anchor.glyph <= selection.focus.glyph);
    return anchorFirst
      ? { start: selection.anchor, end: selection.focus, direction: 'forward' }
      : { start: selection.focus, end: selection.anchor, direction: 'backward' };
  }

  /** Clamp a position into its page's real character range once geometry is known. */
  function clampPosition(position: GlyphPosition): GlyphPosition {
    const pageGeometry = geometryFor(position.page);
    if (!pageGeometry) return position;
    const max = Math.max(pageGeometry.layout.charCount - 1, 0);
    const glyph = Math.max(0, Math.min(position.glyph, max));
    return glyph === position.glyph ? position : { page: position.page, glyph };
  }

  /** Rebuild merged line segments for every loaded page in the span; warm the
   *  rest. Clears when an endpoint's page has left the registry: a range
   *  across a structural edit is meaningless. */
  function recompute(selection: SelectionRange): void {
    const clamped: SelectionRange = {
      anchor: clampPosition(selection.anchor),
      focus: clampPosition(selection.focus),
    };
    const { start, end } = orderedEnds(clamped);
    const startPageIndex = pageIndexOf(start.page);
    const endPageIndex = pageIndexOf(end.page);
    if (startPageIndex < 0 || endPageIndex < 0) {
      ctx.state.update(clearSelection);
      return;
    }
    const segments: Record<PageObjectNumber, readonly SelectionSegment[]> = {};
    for (let i = startPageIndex; i <= endPageIndex; i++) {
      const page = pageAtIndex(i);
      if (!page) continue;
      const pageGeometry = geometryFor(page);
      if (!pageGeometry) {
        void ensureLoaded(page); // recomputes on arrival
        continue;
      }
      const from = i === startPageIndex ? start.glyph : 0;
      const to = i === endPageIndex ? end.glyph : pageGeometry.layout.charCount - 1;
      segments[page.pageObjectNumber] = pageGeometry.layout
        .segments({ start: from, count: to - from + 1 })
        .map((segment) => toContentSegment(pageGeometry, segment));
    }
    ctx.state.update(setSelection, clamped, segments);
  }

  // ── the read model, built once per state and registry revision ──
  const readModel = memo(
    () => [state(), ctx.document()?.revision ?? 0],
    (current): ReadModel => buildReadModel(current),
  );

  function buildReadModel(current: SelectionState): ReadModel {
    const pagesWithSegments = Object.keys(current.segments)
      .map((key) => toPageRef(Number(key)))
      .filter((page) => (current.segments[page.pageObjectNumber]?.length ?? 0) > 0)
      .sort((left, right) => pageIndexOf(left) - pageIndexOf(right));
    const snapshotPages = pagesWithSegments.map((page) => ({
      page,
      segments: current.segments[page.pageObjectNumber],
    }));
    const pages = pagesWithSegments.length ? pagesWithSegments : EMPTY_PAGES;
    if (!current.selection) {
      return {
        snapshot: {
          pages: snapshotPages,
          start: null,
          end: null,
          direction: 'forward',
          range: null,
        },
        pages,
        anchor: null,
      };
    }
    const { start, end, direction } = orderedEnds(current.selection);
    const snapshot: SelectionSnapshot = {
      pages: snapshotPages,
      start: endpointFor(current.segments, start, 'start'),
      end: endpointFor(current.segments, end, 'end'),
      direction,
      range: {
        start: { page: start.page, index: start.glyph },
        end: { page: end.page, index: end.glyph + 1 },
      },
    };
    // Prefer the gesture's end page; while its geometry is still loading,
    // fall back to the last page (document order) with materialized
    // segments, so the anchor never jumps backwards mid-drag.
    const endBounds = unionOf(current.segments[end.page.pageObjectNumber]);
    let anchor: SelectionAnchor | null = endBounds ? { page: end.page, bounds: endBounds } : null;
    const last = pagesWithSegments[pagesWithSegments.length - 1];
    if (!anchor && last) {
      anchor = { page: last, bounds: unionOf(current.segments[last.pageObjectNumber])! };
    }
    return { snapshot, pages, anchor };
  }

  function endpointFor(
    segmentsByPage: SegmentsByPage,
    position: GlyphPosition,
    which: 'start' | 'end',
  ): SelectionEndpoint | null {
    const segments = segmentsByPage[position.page.pageObjectNumber] ?? EMPTY_SEGMENTS;
    if (!segments.length) return null;
    const segment = which === 'start' ? segments[0] : segments[segments.length - 1];
    // Anchor the endpoint to the boundary glyph's own oriented cell so caret
    // placement lands on the exact character edge; fall back to the segment
    // when the glyph is degenerate (e.g. a generated space).
    const pageGeometry = geometryFor(position.page);
    const cell = pageGeometry ? pageGeometry.layout.charQuad(position.glyph) : null;
    if (pageGeometry && cell) {
      const glyphQuad = toContentTextQuad(pageGeometry, cell);
      return {
        page: position.page,
        glyphQuad,
        advance: segment.advance,
        rect: textQuadBounds(glyphQuad),
      };
    }
    return {
      page: position.page,
      glyphQuad: segment.quad,
      advance: segment.advance,
      rect: segment.rect,
    };
  }

  const unionOf = (segments: readonly SelectionSegment[] | undefined): Rect | null =>
    segments ? boundsOfRects(segments.map((segment) => segment.rect)) : null;

  /** A page's segment boxes, the same array until that page's segments change. */
  const rectsOf = memoByKey(
    (pageObjectNumber: PageObjectNumber) => [state().segments[pageObjectNumber]],
    (_pageObjectNumber, segments): readonly Rect[] =>
      (segments ?? EMPTY_SEGMENTS).map((segment) => segment.rect),
  );

  // ── events, derived from each state change ──
  ctx.state.onChange(({ previous, next }) => {
    if (previous.selection === next.selection && previous.segments === next.segments) return;
    const model = readModel();
    changed.emit({ range: model.snapshot.range, pages: model.pages });
    if (previous.selection !== null && next.selection === null) cleared.emit({});
  });

  // ── writes ──
  function select(input: SelectionRangeInput): void {
    assertScope(SELECT_SCOPE, 'selection.select');
    const range: TextRange =
      'page' in input
        ? {
            start: { page: input.page, index: input.start },
            end: { page: input.page, index: input.start + input.count },
          }
        : input;
    ctx.assertPageRef(range.start.page);
    ctx.assertPageRef(range.end.page);
    const startPageIndex = pageIndexOf(range.start.page);
    let endPageIndex = pageIndexOf(range.end.page);
    let endCharIndex = range.end.index;
    if (
      endPageIndex < startPageIndex ||
      (endPageIndex === startPageIndex && endCharIndex <= range.start.index)
    ) {
      ctx.state.update(clearSelection); // an empty range is no selection
      return;
    }
    if (endCharIndex === 0) {
      // Half-open end exactly at a page boundary: the last included character
      // is the previous page's last one, which settles by clamping on load.
      endPageIndex -= 1;
      if (endPageIndex < startPageIndex) {
        ctx.state.update(clearSelection);
        return;
      }
      endCharIndex = OPEN_END;
    }
    const focusPage = pageAtIndex(endPageIndex);
    if (!focusPage) return;
    recompute({
      anchor: { page: range.start.page, glyph: Math.max(0, range.start.index) },
      focus: { page: focusPage, glyph: endCharIndex - 1 },
    });
  }

  function selectAll(): void {
    assertScope(SELECT_SCOPE, 'selection.selectAll');
    const pages = ctx.document()?.pages ?? [];
    if (pages.length === 0) return;
    recompute({
      anchor: { page: pages[0].ref, glyph: 0 },
      focus: { page: pages[pages.length - 1].ref, glyph: OPEN_END },
    });
  }

  function selectPage(page: PageRef): void {
    assertScope(SELECT_SCOPE, 'selection.selectPage');
    ctx.assertPageRef(page);
    recompute({ anchor: { page, glyph: 0 }, focus: { page, glyph: OPEN_END } });
  }

  /** Word / line around a point. Returns whether a span actually engaged
   *  (geometry present and a glyph under the point): the fact haptics and
   *  other success-gated feedback key on, so nothing buzzes over blank space. */
  function selectSpanAt(page: PageRef, point: Point, expand: 'word' | 'line'): boolean {
    assertScope(SELECT_SCOPE, `selection.select${expand === 'word' ? 'WordAt' : 'LineAt'}`);
    const pageGeometry = geometryFor(page);
    if (!pageGeometry) return false;
    const glyph = glyphAt(pageGeometry, point);
    if (glyph == null) return false;
    const span =
      expand === 'word' ? pageGeometry.layout.wordAt(glyph) : pageGeometry.layout.lineAt(glyph);
    if (!span) return false;
    recompute({
      anchor: { page, glyph: span.start },
      focus: { page, glyph: span.start + span.count - 1 },
    });
    return true;
  }

  function extendTo(page: PageRef, point: Point): void {
    assertScope(SELECT_SCOPE, 'selection.extendTo');
    const current = state().selection;
    if (!current) return;
    const pageGeometry = geometryFor(page);
    if (!pageGeometry) {
      void ensureLoaded(page); // extended onto a page not loaded yet: lands on arrival
      return;
    }
    const glyph = glyphAt(pageGeometry, point);
    if (glyph == null) return; // off-text: keep the last focus
    recompute({ anchor: current.anchor, focus: { page, glyph } });
  }

  // ── text extraction ──
  /** Per-page text snapshot, cached as a promise so concurrent readers share
   *  one fetch. Rejections are evicted: a refused or failed read must not
   *  poison the cache for a later authorized call. */
  function pageText(page: PageRef): Promise<PageTextSnapshot> {
    const key = page.pageObjectNumber;
    const cached = textSnapshots.get(key);
    if (cached) return cached;
    const pending = Promise.resolve(ctx.doc.page(page).text.get());
    textSnapshots.set(key, pending);
    pending.catch(() => {
      if (textSnapshots.get(key) === pending) textSnapshots.delete(key);
    });
    return pending;
  }

  async function readTextInRange(range: TextRange, options?: OperationOptions): Promise<string> {
    assertScope(COPY_SCOPE, 'selection.readText');
    ctx.assertPageRef(range.start.page);
    ctx.assertPageRef(range.end.page);
    const startPageIndex = pageIndexOf(range.start.page);
    let endPageIndex = pageIndexOf(range.end.page);
    let endCharIndex = range.end.index;
    if (
      endPageIndex < startPageIndex ||
      (endPageIndex === startPageIndex && endCharIndex <= range.start.index)
    ) {
      return '';
    }
    if (endCharIndex === 0) {
      endPageIndex -= 1; // a range ending at a page boundary includes nothing of that page
      endCharIndex = OPEN_END;
    }
    // Per-page half-open character spans. Geometry is not needed: boundary
    // offsets come from the range, interior pages span their whole text
    // (`sliceText` clamps to the snapshot's charCount).
    const spans: Array<{ page: PageRef; from: number; to: number }> = [];
    for (let i = startPageIndex; i <= endPageIndex; i++) {
      const page = pageAtIndex(i);
      if (!page) continue;
      spans.push({
        page,
        from: i === startPageIndex ? Math.max(0, range.start.index) : 0,
        to: i === endPageIndex ? endCharIndex : OPEN_END,
      });
    }
    const parts: string[] = new Array(spans.length);
    for (let base = 0; base < spans.length; base += TEXT_READ_CONCURRENCY) {
      throwIfAborted(options?.signal);
      const batch = spans.slice(base, base + TEXT_READ_CONCURRENCY);
      const snapshots = await Promise.all(batch.map((span) => pageText(span.page)));
      snapshots.forEach((snapshot, index) => {
        const { from, to } = batch[index];
        parts[base + index] = sliceText(snapshot, { start: from, count: to - from });
      });
    }
    throwIfAborted(options?.signal);
    return parts.join('\n');
  }

  function throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
      throw new PluginError('operation-cancelled', 'selection', 'selection.readText was cancelled');
    }
  }

  // ── invalidation ──
  /** Structural registry change (rotate/move/delete/insert): drop the text of
   *  pages that left, then recompute. Rotation re-derives page-space geometry
   *  through the layout key; a deleted endpoint page clears through
   *  recompute's registry check. */
  function onPagesUpdated(): void {
    const alive = new Set((ctx.document()?.pages ?? []).map((info) => info.ref.pageObjectNumber));
    for (const pageObjectNumber of [...textSnapshots.keys()]) {
      if (!alive.has(pageObjectNumber)) textSnapshots.delete(pageObjectNumber);
    }
    const current = state().selection;
    if (current) recompute(current);
  }

  /** Page content changed: the pages' text is stale, and a live range points
   *  into a character space that no longer exists, so it clears. The
   *  geometry mirror re-reads those pages itself. */
  function onContentChanged(pages: readonly PageRef[]): void {
    for (const page of pages) textSnapshots.delete(page.pageObjectNumber);
    ctx.state.update(clearSelection);
  }

  const setGesture = (active: boolean): void => ctx.state.update(setGestureActive, active);

  const api: SelectionHostCapability = {
    // ── public lens ──
    canSelect,
    canCopy,
    select,
    selectAll,
    selectPage,
    selectWordAt: (page, point) => selectSpanAt(page, point, 'word'),
    selectLineAt: (page, point) => selectSpanAt(page, point, 'line'),
    extendTo,
    clear: () => ctx.state.update(clearSelection),
    hasSelection: () => state().selection != null,
    getSnapshot: () => readModel().snapshot,
    getRange: () => readModel().snapshot.range,
    listSelectedPages: () => readModel().pages,
    listSegments: (page) => state().segments[page.pageObjectNumber] ?? EMPTY_SEGMENTS,
    listRects: (page) => rectsOf(page.pageObjectNumber),
    getAnchor: () => readModel().anchor,
    readText: (options) => {
      const range = readModel().snapshot.range;
      return range ? readTextInRange(range, options) : Promise.resolve('');
    },
    readTextInRange,
    onChanged: changed.on,
    onCommitted: committed.on,
    onCleared: cleared.on,

    // ── host lens ──
    ensureLoaded,
    isLoaded: (page) => geometry.getStatus(page) === 'ready',
    isOverText: (page, point) => {
      const pageGeometry = geometryFor(page);
      return pageGeometry ? glyphAt(pageGeometry, point) != null : false;
    },
    beginGesture: () => setGesture(true),
    beginGestureAt: (page, point) => {
      if (!canSelect()) return false;
      const pageGeometry = geometryFor(page);
      if (!pageGeometry) return false;
      const glyph = glyphAt(pageGeometry, point);
      if (glyph == null) return false; // not near text: the caller lets the gesture go
      // The gesture opens before the selection changes, so listeners see a
      // coherent (gesture, segments) pair.
      setGesture(true);
      recompute({ anchor: { page, glyph }, focus: { page, glyph } });
      return true;
    },
    endGesture: () => {
      // Settle first, so commit listeners (menus, clipboard prefetch) observe
      // isGestureActive() === false.
      setGesture(false);
      const range = readModel().snapshot.range;
      if (range) committed.emit({ range });
    },
    isGestureActive: () => state().gestureActive,
    setHighlightVisible: (visible) => ctx.state.update(setHighlightHidden, !visible),
    isHighlightVisible: () => !state().highlightHidden,
  };

  return {
    api,
    connect() {
      // Registry changes (rotate/move/delete/insert) bump the document revision.
      ctx.watch(() => ctx.document()?.revision ?? 0, onPagesUpdated);
      ctx.listen(ctx.doc.events, (event) => {
        const pages = contentChangedPagesOf(event);
        if (pages) onContentChanged(pages);
      });
      connectSelection(ctx, api, config);
    },
  };
}
