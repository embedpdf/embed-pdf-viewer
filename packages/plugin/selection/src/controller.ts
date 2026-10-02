import {
  PluginError,
  memo,
  memoByKey,
  type PluginContext,
  type DocCapability,
  type OperationOptions,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/core';
import { boundsOfRects, quadBounds, type Point, type Rect } from '@embedpdf/core-geometry';
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
  SelectionEndpoint,
  SelectionRangeInput,
  SelectionSettings,
  SelectionSnapshot,
  TextRange,
} from './contract';
import type { SelectionSegment } from './geometry';
import type { SelectionHostCapability } from './host-contract';
import {
  clearSelection,
  contentChangedPagesOf,
  setHighlightHidden,
  setSelecting,
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
const EMPTY_RECTS: readonly Rect[] = Object.freeze([]);
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
 *
 * The settings belong to the plugin registration; the pointer handler reads
 * the drag threshold from them, and the framework layers read the colors.
 */
export function createSelectionController(ctx: PluginContext<SelectionState, SelectionSettings>) {
  const settings = ctx.settings();
  const changed = ctx.events.source<SelectionChangedEvent>();
  const committed = ctx.events.source<SelectionCommittedEvent>();
  const cleared = ctx.events.source<SelectionClearedEvent>();
  const textSnapshots = new Map<PageObjectNumber, Promise<PageTextSnapshot>>();

  const state = () => ctx.state.get();
  const canSelect = (): boolean => ctx.allows(SELECT_SCOPE);
  const canCopy = (): boolean => ctx.allows(COPY_SCOPE);

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

  /** A page's text layout while it is loaded and current. */
  const geometryFor = snapshotOf;

  const glyphAt = (layout: TextLayout, point: Point): number | null => layout.charAt(point);

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
    const textLayout = geometryFor(position.page);
    if (!textLayout) return position;
    const max = Math.max(textLayout.charCount - 1, 0);
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
      const textLayout = geometryFor(page);
      if (!textLayout) {
        void ensureLoaded(page); // recomputes on arrival
        continue;
      }
      const from = i === startPageIndex ? start.glyph : 0;
      const to = i === endPageIndex ? end.glyph : textLayout.charCount - 1;
      segments[page.objectNumber] = textLayout.segments({ start: from, count: to - from + 1 });
    }
    ctx.state.update(setSelection, clamped, segments);
  }

  // ── the read model, built once per selection and registry revision ──
  // Only the range and the segments go in, so a change to the gesture fact or
  // the highlight's visibility keeps every read (the range, the page list) as it was.
  const readModel = memo(
    () => [state().selection, state().segments, ctx.document()?.revision ?? 0],
    (selection, segments): ReadModel => buildReadModel(selection, segments),
  );

  function buildReadModel(selection: SelectionRange | null, segments: SegmentsByPage): ReadModel {
    const pagesWithSegments = Object.keys(segments)
      .map((key) => toPageRef(Number(key)))
      .filter((page) => (segments[page.objectNumber]?.length ?? 0) > 0)
      .sort((left, right) => pageIndexOf(left) - pageIndexOf(right));
    const snapshotPages = pagesWithSegments.map((page) => ({
      page,
      segments: segments[page.objectNumber],
    }));
    const pages = pagesWithSegments.length ? pagesWithSegments : EMPTY_PAGES;
    if (!selection) {
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
    const { start, end, direction } = orderedEnds(selection);
    const snapshot: SelectionSnapshot = {
      pages: snapshotPages,
      start: endpointFor(segments, start, 'start'),
      end: endpointFor(segments, end, 'end'),
      direction,
      range: {
        start: { page: start.page, index: start.glyph },
        end: { page: end.page, index: end.glyph + 1 },
      },
    };
    // Prefer the gesture's end page; while its geometry is still loading,
    // fall back to the last page (document order) with materialized
    // segments, so the anchor never jumps backwards mid-drag.
    const endBounds = unionOf(segments[end.page.objectNumber]);
    let anchor: SelectionAnchor | null = endBounds ? { page: end.page, bounds: endBounds } : null;
    const last = pagesWithSegments[pagesWithSegments.length - 1];
    if (!anchor && last) {
      anchor = { page: last, bounds: unionOf(segments[last.objectNumber])! };
    }
    return { snapshot, pages, anchor };
  }

  function endpointFor(
    segmentsByPage: SegmentsByPage,
    position: GlyphPosition,
    which: 'start' | 'end',
  ): SelectionEndpoint | null {
    const segments = segmentsByPage[position.page.objectNumber] ?? EMPTY_SEGMENTS;
    if (!segments.length) return null;
    const segment = which === 'start' ? segments[0] : segments[segments.length - 1];
    // Anchor the endpoint to the boundary glyph's own oriented cell so caret
    // placement lands on the exact character edge; fall back to the segment
    // when the glyph is degenerate (e.g. a generated space).
    const textLayout = geometryFor(position.page);
    const cell = textLayout ? textLayout.charQuad(position.glyph) : null;
    if (textLayout && cell) {
      return {
        page: position.page,
        glyphQuad: cell,
        advance: segment.advance,
        rect: quadBounds(cell),
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
    ctx.assertAllowed(SELECT_SCOPE, 'selection.select');
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
    ctx.assertAllowed(SELECT_SCOPE, 'selection.selectAll');
    const pages = ctx.document()?.pages ?? [];
    if (pages.length === 0) return;
    recompute({
      anchor: { page: pages[0].ref, glyph: 0 },
      focus: { page: pages[pages.length - 1].ref, glyph: OPEN_END },
    });
  }

  function selectPage(target: PageRef | number): void {
    ctx.assertAllowed(SELECT_SCOPE, 'selection.selectPage');
    const page = ctx.pageOf(target).ref;
    recompute({ anchor: { page, glyph: 0 }, focus: { page, glyph: OPEN_END } });
  }

  /** Word / line around a point. Returns whether a span actually engaged
   *  (geometry present and a glyph under the point): the fact haptics and
   *  other success-gated feedback key on, so nothing buzzes over blank space. */
  function selectSpanAt(target: PageRef | number, point: Point, expand: 'word' | 'line'): boolean {
    ctx.assertAllowed(SELECT_SCOPE, `selection.select${expand === 'word' ? 'WordAt' : 'LineAt'}`);
    const page = ctx.pageOf(target).ref;
    const textLayout = geometryFor(page);
    if (!textLayout) return false;
    const glyph = glyphAt(textLayout, point);
    if (glyph == null) return false;
    const span = expand === 'word' ? textLayout.wordAt(glyph) : textLayout.lineAt(glyph);
    if (!span) return false;
    recompute({
      anchor: { page, glyph: span.start },
      focus: { page, glyph: span.start + span.count - 1 },
    });
    return true;
  }

  function extendTo(target: PageRef | number, point: Point): void {
    ctx.assertAllowed(SELECT_SCOPE, 'selection.extendTo');
    const page = ctx.pageOf(target).ref;
    const current = state().selection;
    if (!current) return;
    const textLayout = geometryFor(page);
    if (!textLayout) {
      void ensureLoaded(page); // extended onto a page not loaded yet: lands on arrival
      return;
    }
    const glyph = glyphAt(textLayout, point);
    if (glyph == null) return; // off-text: keep the last focus
    recompute({ anchor: current.anchor, focus: { page, glyph } });
  }

  // ── text extraction ──
  /** Per-page text snapshot, cached as a promise so concurrent readers share
   *  one fetch. Rejections are evicted: a refused or failed read must not
   *  poison the cache for a later authorized call. */
  function pageText(page: PageRef): Promise<PageTextSnapshot> {
    const key = page.objectNumber;
    const cached = textSnapshots.get(key);
    if (cached) return cached;
    const pending = Promise.resolve(ctx.doc.page(page).text.get());
    textSnapshots.set(key, pending);
    pending.catch(() => {
      if (textSnapshots.get(key) === pending) textSnapshots.delete(key);
    });
    return pending;
  }

  async function readText(options?: OperationOptions): Promise<string> {
    ctx.assertAllowed(COPY_SCOPE, 'selection.readText');
    const range = readModel().snapshot.range;
    return range ? readRange(range, options) : '';
  }

  async function readTextInRange(range: TextRange, options?: OperationOptions): Promise<string> {
    ctx.assertAllowed(COPY_SCOPE, 'selection.readTextInRange');
    return readRange(range, options);
  }

  /** A range's text, read a few pages at a time. Cancelling stops the wait at
   *  once; the page reads it started finish into the cache, which other
   *  readers share. */
  async function readRange(range: TextRange, options?: OperationOptions): Promise<string> {
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
    const signal = options?.signal;
    const parts: string[] = new Array(spans.length);
    for (let base = 0; base < spans.length; base += TEXT_READ_CONCURRENCY) {
      // A signal that has fired starts no more reads.
      if (signal?.aborted) {
        throw new PluginError('operation-cancelled', 'selection', 'reading the text was cancelled');
      }
      const batch = spans.slice(base, base + TEXT_READ_CONCURRENCY);
      const snapshots = await ctx.cancellable(
        signal,
        Promise.all(batch.map((span) => pageText(span.page))),
      );
      snapshots.forEach((snapshot, index) => {
        const { from, to } = batch[index];
        parts[base + index] = sliceText(snapshot, { start: from, count: to - from });
      });
    }
    return parts.join('\n');
  }

  // ── invalidation ──
  /** Structural registry change (rotate/move/delete/insert): drop the text of
   *  pages that left, then recompute. Rotation re-derives page-space geometry
   *  through the layout key; a deleted endpoint page clears through
   *  recompute's registry check. */
  function onPagesUpdated(): void {
    const alive = new Set((ctx.document()?.pages ?? []).map((info) => info.ref.objectNumber));
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
    for (const page of pages) textSnapshots.delete(page.objectNumber);
    ctx.state.update(clearSelection);
  }

  const setGesture = (active: boolean): void => ctx.state.update(setSelecting, active);

  /** A page's segments, by its ref or its index: a page that isn't in the document has none. */
  const segmentsOn = (target: PageRef | number): readonly SelectionSegment[] => {
    const page = ctx.getPage(target);
    return page ? (state().segments[page.ref.objectNumber] ?? EMPTY_SEGMENTS) : EMPTY_SEGMENTS;
  };

  const api: SelectionHostCapability = {
    ...settings.api,

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
    isSelecting: () => state().selecting,
    getSnapshot: () => readModel().snapshot,
    getRange: () => readModel().snapshot.range,
    listSelectedPages: () => readModel().pages,
    listSegments: segmentsOn,
    listRects: (target) => {
      const page = ctx.getPage(target);
      return page ? rectsOf(page.ref.objectNumber) : EMPTY_RECTS;
    },
    getAnchor: () => readModel().anchor,
    readText,
    readTextInRange,
    onChanged: changed.on,
    onCommitted: committed.on,
    onCleared: cleared.on,

    // ── host lens ──
    ensureLoaded,
    isLoaded: (page) => geometry.getStatus(page) === 'ready',
    isOverText: (page, point) => {
      const textLayout = geometryFor(page);
      return textLayout ? glyphAt(textLayout, point) != null : false;
    },
    beginGesture: () => setGesture(true),
    beginGestureAt: (page, point) => {
      if (!canSelect()) return false;
      const textLayout = geometryFor(page);
      if (!textLayout) return false;
      const glyph = glyphAt(textLayout, point);
      if (glyph == null) return false; // not near text: the caller lets the gesture go
      // The gesture opens before the selection changes, so listeners see a
      // coherent (gesture, segments) pair.
      setGesture(true);
      recompute({ anchor: { page, glyph }, focus: { page, glyph } });
      return true;
    },
    endGesture: () => {
      // Settle first, so commit listeners (menus, clipboard prefetch) observe
      // isSelecting() === false.
      setGesture(false);
      const range = readModel().snapshot.range;
      if (range) committed.emit({ range });
    },
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
      connectSelection(ctx, api);
    },
  };
}
