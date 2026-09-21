import {
  PluginError,
  isPluginError,
  type ChangeOrigin,
  type ControllerContext,
  type DocCapability,
  type OperationOptions,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/core';
import { textQuadBounds, type Point, type Rect } from '@embedpdf/core-geometry';
import {
  expandTextRangeToLine,
  expandTextRangeToWord,
  sliceTextByChars,
  textGlyphAt,
  textGlyphQuad,
  textSegmentsForRange,
  toPageRef,
  type PageGeometrySnapshot,
  type PageTextSnapshot,
} from '@embedpdf/engine-core/runtime';
import type {
  SelectionAnchor,
  SelectionChangedEvent,
  SelectionClearedEvent,
  SelectionCommittedEvent,
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
import type { GlyphPointer, SelectionAction, SelectionRange, SelectionState } from './model';

const SELECT_SCOPE: DocCapability = 'doc.text.select';
const COPY_SCOPE: DocCapability = 'doc.text.copy';
const EMPTY_SEGMENTS: readonly SelectionSegment[] = Object.freeze([]);
const EMPTY_PAGES: readonly PageRef[] = Object.freeze([]);
/** How many page-text reads a `readText` keeps in flight at once. */
const TEXT_READ_CONCURRENCY = 8;
/** An open-ended focus: settles to the page's real last character once its geometry loads. */
const OPEN_END = Number.MAX_SAFE_INTEGER;

const localOrigin = (trigger: ChangeOrigin['trigger']): ChangeOrigin => ({
  locality: 'local',
  trigger,
  sessionId: null,
  actorId: null,
});

/** Everything the read model derives from one state object, built once per state. */
interface ReadModel {
  state: SelectionState;
  snapshot: SelectionSnapshot;
  pages: readonly PageRef[];
  anchor: SelectionAnchor | null;
  rects: Map<PageObjectNumber, readonly Rect[]>;
}

/**
 * The selection controller.
 *
 * The model holds the range and its derived page-space segments; the large,
 * non-serializable per-page caches live here, split by what invalidates them:
 *
 *   - `rawGeometry` — PDF-space geometry snapshots, rotation-independent.
 *     Dropped only when a page leaves the registry or page CONTENT changes
 *     (redaction apply / flatten).
 *   - `derived` — the page-space transform + layout, keyed by the layout
 *     params (crop/rotation/userUnit), so a view-rotate re-derives from the
 *     cached raw snapshot with NO refetch.
 *   - `textSnapshots` — per-page text (for `readText`), same content-only
 *     invalidation as `rawGeometry`.
 *
 * Two habits keep it readable top to bottom: `publish` is the ONE place the
 * selection changes and `onChanged` / `onCleared` fire; `recompute` rebuilds
 * the segments for every loaded page in the span and warms the rest (they
 * recompute on arrival, with a `system` origin).
 *
 * Selection is cross-page: glyphs are ordered globally by (page index,
 * glyph), so a drag from page 2 into page 4 selects the tail of 2, all of 3,
 * and the head of 4. Stored endpoints are CLAMPED once their page's geometry
 * is known, which is how `selectAll`'s open end settles.
 */
export function createSelectionController(ctx: ControllerContext<SelectionState, SelectionAction>) {
  const rawGeometry = new Map<PageObjectNumber, PageGeometrySnapshot>();
  const derived = new Map<PageObjectNumber, { key: string; geom: SelectionPageGeometry }>();
  const loads = new Map<PageObjectNumber, Promise<void>>();
  const textSnapshots = new Map<PageObjectNumber, Promise<PageTextSnapshot>>();
  /** Bumped on content invalidation; in-flight reads from before are discarded. */
  let epoch = 0;

  const changed = ctx.events.source<SelectionChangedEvent>();
  const committed = ctx.events.source<SelectionCommittedEvent>();
  const cleared = ctx.events.source<SelectionClearedEvent>();

  const state = () => ctx.getState();
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
  const layoutOf = (pon: PageObjectNumber) => ctx.getPage(toPageRef(pon));
  const pageIndexOf = (pon: PageObjectNumber): number => layoutOf(pon)?.index ?? -1;
  const ponAtIndex = (i: number): PageObjectNumber | undefined =>
    ctx.document()?.pages[i]?.ref.pageObjectNumber;

  /** Page-space geometry for a page, derived on demand from the raw snapshot
   *  + the CURRENT layout params. A view-rotate (or crop change) changes the
   *  key and re-derives — the engine is never asked again. */
  function geometryFor(pon: PageObjectNumber): SelectionPageGeometry | null {
    const raw = rawGeometry.get(pon);
    const layout = layoutOf(pon);
    if (!raw || !layout) return null;
    const crop = layout.boxes.crop;
    const key = `${layout.rotation}|${layout.userUnit}|${crop.left},${crop.bottom},${crop.right},${crop.top}`;
    const hit = derived.get(pon);
    if (hit && hit.key === key) return hit.geom;
    const geom = buildSelectionPageGeometry(raw, crop, layout.rotation, layout.userUnit);
    derived.set(pon, { key, geom });
    return geom;
  }

  const glyphAt = (geom: SelectionPageGeometry, point: Point): number | null =>
    textGlyphAt(geom.layout, contentPointToPdf(geom, point));

  /** Warm a page's geometry; the settled promise never rejects (see the host contract). */
  function ensureLoaded(page: PageRef): Promise<void> {
    const pon = page.pageObjectNumber;
    if (rawGeometry.has(pon)) return Promise.resolve();
    const inFlight = loads.get(pon);
    if (inFlight) return inFlight;
    // Authorized-only warming: without doc.text.select the read is guaranteed
    // to be refused — don't issue it. The engine stays the security boundary.
    if (!canSelect() || !layoutOf(pon)) return Promise.resolve();
    const at = epoch;
    const load = ctx.doc
      .page(page)
      .geometry.read()
      .then(
        (snapshot) => {
          loads.delete(pon);
          if (at !== epoch) return; // content changed while in flight — stale
          rawGeometry.set(pon, snapshot);
          ctx.dispatch({ type: 'pageLoaded', page });
          const current = state().selection;
          if (current) recompute(current, 'system'); // a mid-span page arrived → fill its segments
        },
        () => {
          loads.delete(pon); // closed / aborted / refused — nothing to paint, a later call retries
        },
      );
    loads.set(pon, load);
    return load;
  }

  // ── the range model ──
  function orderedEnds(sel: SelectionRange): {
    start: GlyphPointer;
    end: GlyphPointer;
    direction: 'forward' | 'backward';
  } {
    const ai = pageIndexOf(sel.anchor.page.pageObjectNumber);
    const fi = pageIndexOf(sel.focus.page.pageObjectNumber);
    const anchorFirst = ai < fi || (ai === fi && sel.anchor.glyph <= sel.focus.glyph);
    return anchorFirst
      ? { start: sel.anchor, end: sel.focus, direction: 'forward' }
      : { start: sel.focus, end: sel.anchor, direction: 'backward' };
  }

  /** Clamp a pointer into its page's real character range once geometry is known. */
  function clampPointer(ptr: GlyphPointer): GlyphPointer {
    const geom = geometryFor(ptr.page.pageObjectNumber);
    if (!geom) return ptr;
    const max = Math.max(geom.layout.glyphs.length - 1, 0);
    const glyph = Math.max(0, Math.min(ptr.glyph, max));
    return glyph === ptr.glyph ? ptr : { page: ptr.page, glyph };
  }

  /** The one place the selection changes. Commits the model, then tells listeners. */
  function publish(
    selection: SelectionRange | null,
    segments: Record<number, readonly SelectionSegment[]>,
    trigger: ChangeOrigin['trigger'],
  ): void {
    const before = state();
    if (selection) ctx.dispatch({ type: 'set', selection, segments });
    else ctx.dispatch({ type: 'clear' });
    if (state() === before) return; // clearing nothing is not a change
    const origin = localOrigin(trigger);
    const model = readModel();
    changed.emit({ range: model.snapshot.range, pages: model.pages, origin });
    if (!selection) cleared.emit({ origin });
  }

  /** Rebuild merged line segments for every loaded page in the span; warm the
   *  rest. Clears when an endpoint's page has left the registry — a range
   *  across a structural edit is meaningless. */
  function recompute(sel: SelectionRange, trigger: ChangeOrigin['trigger']): void {
    const clamped: SelectionRange = {
      anchor: clampPointer(sel.anchor),
      focus: clampPointer(sel.focus),
    };
    const { start, end } = orderedEnds(clamped);
    const si = pageIndexOf(start.page.pageObjectNumber);
    const ei = pageIndexOf(end.page.pageObjectNumber);
    if (si < 0 || ei < 0) {
      publish(null, {}, trigger);
      return;
    }
    const segments: Record<number, readonly SelectionSegment[]> = {};
    for (let i = si; i <= ei; i++) {
      const pon = ponAtIndex(i);
      if (pon == null) continue;
      const geom = geometryFor(pon);
      if (!geom) {
        void ensureLoaded(toPageRef(pon)); // recomputes on arrival
        continue;
      }
      const from = i === si ? start.glyph : 0;
      const to = i === ei ? end.glyph : geom.layout.glyphs.length - 1;
      segments[pon] = textSegmentsForRange(geom.layout, from, to - from + 1).map((s) =>
        toContentSegment(geom, s),
      );
    }
    publish(clamped, segments, trigger);
  }

  const setGesture = (active: boolean): void => ctx.dispatch({ type: 'setGestureActive', active });
  /** Changes made while a gesture drives the selection are the user's; the rest come through the API. */
  const writeTrigger = (): ChangeOrigin['trigger'] => (state().gestureActive ? 'user' : 'api');

  // ── the read model, built once per state object ──
  let model: ReadModel | null = null;
  function readModel(): ReadModel {
    const s = state();
    if (model?.state === s) return model;
    const pagesWithSegments = Object.keys(s.segments)
      .map(Number)
      .filter((pon) => (s.segments[pon]?.length ?? 0) > 0)
      .sort((a, b) => pageIndexOf(a) - pageIndexOf(b));
    const pages = pagesWithSegments.map((pon) => toPageRef(pon));
    const snapshotPages = pagesWithSegments.map((pon) => ({
      page: toPageRef(pon),
      segments: s.segments[pon],
    }));
    let snapshot: SelectionSnapshot;
    let anchor: SelectionAnchor | null = null;
    if (!s.selection) {
      snapshot = {
        pages: snapshotPages,
        start: null,
        end: null,
        direction: 'forward',
        range: null,
      };
    } else {
      const { start, end, direction } = orderedEnds(s.selection);
      snapshot = {
        pages: snapshotPages,
        start: endpointFor(s, start, 'start'),
        end: endpointFor(s, end, 'end'),
        direction,
        range: {
          start: { page: start.page, index: start.glyph },
          end: { page: end.page, index: end.glyph + 1 },
        },
      };
      // Prefer the gesture's end page; while its geometry is still loading,
      // fall back to the LAST page (document order) with materialized
      // segments so the anchor never teleports backwards mid-drag.
      const endBounds = unionOf(s.segments[end.page.pageObjectNumber]);
      if (endBounds) anchor = { page: end.page, bounds: endBounds };
      else {
        const last = pagesWithSegments[pagesWithSegments.length - 1];
        if (last != null) anchor = { page: toPageRef(last), bounds: unionOf(s.segments[last])! };
      }
    }
    model = {
      state: s,
      snapshot,
      pages: pages.length ? pages : EMPTY_PAGES,
      anchor,
      rects: new Map(),
    };
    return model;
  }

  function endpointFor(
    s: SelectionState,
    ptr: GlyphPointer,
    which: 'start' | 'end',
  ): SelectionEndpoint | null {
    const segments = s.segments[ptr.page.pageObjectNumber] ?? EMPTY_SEGMENTS;
    if (!segments.length) return null;
    const segment = which === 'start' ? segments[0] : segments[segments.length - 1];
    // Anchor the endpoint to the boundary GLYPH's own oriented cell so caret
    // placement lands on the exact character edge; fall back to the segment
    // when the glyph is degenerate (e.g. a generated space).
    const geom = geometryFor(ptr.page.pageObjectNumber);
    const cell = geom ? textGlyphQuad(geom.layout, ptr.glyph) : null;
    if (geom && cell) {
      const glyphQuad = toContentTextQuad(geom, cell);
      return {
        page: ptr.page,
        glyphQuad,
        advance: segment.advance,
        rect: textQuadBounds(glyphQuad),
      };
    }
    return {
      page: ptr.page,
      glyphQuad: segment.quad,
      advance: segment.advance,
      rect: segment.rect,
    };
  }

  function unionOf(segments: readonly SelectionSegment[] | undefined): Rect | null {
    if (!segments || segments.length === 0) return null;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const s of segments) {
      x1 = Math.min(x1, s.rect.x);
      y1 = Math.min(y1, s.rect.y);
      x2 = Math.max(x2, s.rect.x + s.rect.width);
      y2 = Math.max(y2, s.rect.y + s.rect.height);
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

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
    const si = pageIndexOf(range.start.page.pageObjectNumber);
    let ei = pageIndexOf(range.end.page.pageObjectNumber);
    let endIndex = range.end.index;
    if (ei < si || (ei === si && endIndex <= range.start.index)) {
      publish(null, {}, writeTrigger()); // an empty range is no selection
      return;
    }
    if (endIndex === 0) {
      // Half-open end exactly at a page boundary: the last included character
      // is the previous page's last one, which settles by clamping on load.
      ei -= 1;
      if (ei < si) {
        publish(null, {}, writeTrigger());
        return;
      }
      endIndex = OPEN_END;
    }
    const focusPon = ponAtIndex(ei);
    if (focusPon == null) return;
    recompute(
      {
        anchor: { page: range.start.page, glyph: Math.max(0, range.start.index) },
        focus: { page: toPageRef(focusPon), glyph: endIndex - 1 },
      },
      writeTrigger(),
    );
  }

  function selectAll(): void {
    assertScope(SELECT_SCOPE, 'selection.selectAll');
    const pages = ctx.document()?.pages ?? [];
    if (pages.length === 0) return;
    recompute(
      {
        anchor: { page: pages[0].ref, glyph: 0 },
        focus: { page: pages[pages.length - 1].ref, glyph: OPEN_END },
      },
      writeTrigger(),
    );
  }

  function selectPage(page: PageRef): void {
    assertScope(SELECT_SCOPE, 'selection.selectPage');
    ctx.assertPageRef(page);
    recompute({ anchor: { page, glyph: 0 }, focus: { page, glyph: OPEN_END } }, writeTrigger());
  }

  /** Word / line around a point. Returns whether a span actually engaged
   *  (geometry present AND a glyph under the point) — the fact haptics and
   *  other success-gated feedback key on, so nothing buzzes over blank space. */
  function selectSpanAt(page: PageRef, point: Point, expand: 'word' | 'line'): boolean {
    assertScope(SELECT_SCOPE, `selection.select${expand === 'word' ? 'WordAt' : 'LineAt'}`);
    const geom = geometryFor(page.pageObjectNumber);
    if (!geom) return false;
    const i = glyphAt(geom, point);
    if (i == null) return false;
    const [from, to] =
      expand === 'word'
        ? expandTextRangeToWord(geom.layout, i)
        : expandTextRangeToLine(geom.layout, i);
    recompute({ anchor: { page, glyph: from }, focus: { page, glyph: to } }, writeTrigger());
    return true;
  }

  function extendTo(page: PageRef, point: Point): void {
    assertScope(SELECT_SCOPE, 'selection.extendTo');
    const current = state().selection;
    if (!current) return;
    const geom = geometryFor(page.pageObjectNumber);
    if (!geom) {
      void ensureLoaded(page); // extended onto a not-yet-loaded page — lands on arrival
      return;
    }
    const i = glyphAt(geom, point);
    if (i == null) return; // off-text — keep the last focus
    recompute({ anchor: current.anchor, focus: { page, glyph: i } }, writeTrigger());
  }

  function clear(): void {
    publish(null, {}, writeTrigger());
  }

  // ── text extraction ──
  /** Per-page text snapshot, cached as a PROMISE so concurrent readers share
   *  one fetch. Rejections are evicted (a refused or failed read must not
   *  poison the cache for a later authorized call). */
  function pageText(pon: PageObjectNumber): Promise<PageTextSnapshot> {
    let p = textSnapshots.get(pon);
    if (!p) {
      p = Promise.resolve(ctx.doc.page(toPageRef(pon)).text.read());
      p.catch(() => textSnapshots.delete(pon));
      textSnapshots.set(pon, p);
    }
    return p;
  }

  async function readTextInRange(range: TextRange, options?: OperationOptions): Promise<string> {
    assertScope(COPY_SCOPE, 'selection.readText');
    ctx.assertPageRef(range.start.page);
    ctx.assertPageRef(range.end.page);
    const si = pageIndexOf(range.start.page.pageObjectNumber);
    let ei = pageIndexOf(range.end.page.pageObjectNumber);
    let endIndex = range.end.index;
    if (ei < si || (ei === si && endIndex <= range.start.index)) return '';
    if (endIndex === 0) {
      ei -= 1; // a range ending at a page boundary includes nothing of that page
      endIndex = OPEN_END;
    }
    // Per-page half-open character spans. Geometry is NOT needed: boundary
    // offsets come from the range, interior pages span their whole text
    // (`sliceTextByChars` clamps to the snapshot's charCount).
    const spans: Array<{ pon: PageObjectNumber; from: number; to: number }> = [];
    for (let i = si; i <= ei; i++) {
      const pon = ponAtIndex(i);
      if (pon == null) continue;
      spans.push({
        pon,
        from: i === si ? Math.max(0, range.start.index) : 0,
        to: i === ei ? endIndex : OPEN_END,
      });
    }
    const parts: string[] = new Array(spans.length);
    for (let base = 0; base < spans.length; base += TEXT_READ_CONCURRENCY) {
      throwIfAborted(options?.signal);
      const batch = spans.slice(base, base + TEXT_READ_CONCURRENCY);
      const snapshots = await Promise.all(batch.map((s) => pageText(s.pon)));
      snapshots.forEach((snap, j) => {
        parts[base + j] = sliceTextByChars(snap, batch[j].from, batch[j].to);
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
  /** Structural registry change (rotate/move/delete/insert): drop caches for
   *  pages that left, then recompute. Rotation re-derives transforms via the
   *  layout key; a deleted endpoint page clears via recompute's registry
   *  check. Raw snapshots are NEVER refetched here — they are rotation-independent. */
  function onPagesUpdated(): void {
    const alive = new Set((ctx.document()?.pages ?? []).map((p) => p.ref.pageObjectNumber));
    for (const pon of [...rawGeometry.keys()]) {
      if (!alive.has(pon)) {
        rawGeometry.delete(pon);
        derived.delete(pon);
        textSnapshots.delete(pon);
      }
    }
    const current = state().selection;
    if (current) recompute(current, 'system');
  }

  /** Page CONTENT changed (redaction apply / flatten): every cached snapshot
   *  — geometry AND text — is stale, and any live range points into a
   *  character space that no longer exists. Drop everything, clear. */
  function invalidateContent(): void {
    epoch++;
    rawGeometry.clear();
    derived.clear();
    loads.clear();
    textSnapshots.clear();
    publish(null, {}, 'system');
  }

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
    clear,
    hasSelection: () => state().selection != null,
    getSnapshot: () => readModel().snapshot,
    getRange: () => readModel().snapshot.range,
    listSelectedPages: () => readModel().pages,
    listSegments: (page) => state().segments[page.pageObjectNumber] ?? EMPTY_SEGMENTS,
    listRects: (page) => {
      const { rects } = readModel();
      const pon = page.pageObjectNumber;
      let hit = rects.get(pon);
      if (!hit) {
        hit = (state().segments[pon] ?? EMPTY_SEGMENTS).map((s) => s.rect);
        rects.set(pon, hit);
      }
      return hit;
    },
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
    isLoaded: (page) => !!state().loaded[page.pageObjectNumber],
    isOverText: (page, point) => {
      const geom = geometryFor(page.pageObjectNumber);
      return geom ? glyphAt(geom, point) != null : false;
    },
    beginGesture: () => setGesture(true),
    beginGestureAt: (page, point) => {
      if (!canSelect()) return false;
      const geom = geometryFor(page.pageObjectNumber);
      if (!geom) return false;
      const i = glyphAt(geom, point);
      if (i == null) return false; // not near text — the caller lets the gesture go
      setGesture(true); // BEFORE the publish, so listeners see a coherent (gesture, segments) pair
      recompute({ anchor: { page, glyph: i }, focus: { page, glyph: i } }, 'user');
      return true;
    },
    endGesture: () => {
      // Settle FIRST, so commit listeners (menus, clipboard prefetch) observe
      // isGestureActive() === false.
      setGesture(false);
      const range = readModel().snapshot.range;
      if (range) committed.emit({ range });
    },
    isGestureActive: () => state().gestureActive,
    setHighlightVisible: (visible) =>
      ctx.dispatch({ type: 'setHighlightHidden', hidden: !visible }),
    isHighlightVisible: () => !state().highlightHidden,
  };

  return {
    api,
    connect() {
      // Registry changes (rotate/move/delete/insert bump the document revision).
      let lastRevision = ctx.document()?.revision ?? -1;
      ctx.cleanup(
        ctx.subscribe(() => {
          const revision = ctx.document()?.revision;
          if (revision === undefined || revision === lastRevision) return;
          lastRevision = revision;
          onPagesUpdated();
        }),
      );
      // Content changes: every cached snapshot is stale.
      ctx.listen(ctx.doc.events, (event) => {
        if (event.type === 'redaction.applied' || event.type === 'pages.flattened') {
          invalidateContent();
        }
      });
    },
  };
}
