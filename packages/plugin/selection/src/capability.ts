import type { PageObjectNumber, PluginContext } from '@embedpdf/core';
import { textQuadBounds, type Point, type Rect } from '@embedpdf/core-geometry';
import {
  expandTextRangeToLine,
  expandTextRangeToWord,
  PermissionDenied,
  sliceTextByChars,
  textGlyphAt,
  textGlyphQuad,
  textSegmentsForRange,
  type PageGeometrySnapshot,
  type PageTextSnapshot,
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
  SelectionEndpoint,
  SelectionHostCapability,
  SelectionMenuAnchor,
  SelectionRange,
  SelectionRangeInput,
  SelectionSnapshot,
  SelectionState,
  TextRange,
} from './types';

const EMPTY_SEGMENTS: SelectionSegment[] = [];

/** How many page-text reads `readText()` keeps in flight at once. */
const TEXT_READ_CONCURRENCY = 8;

/**
 * The selection capability — ONE closure returning the host lens (the
 * public lens is the same object, narrowed at the package root).
 *
 * State model: the reducer holds the selection range and the derived
 * content-space segments; the large, non-serializable per-page caches live
 * HERE in the closure, split by what invalidates them:
 *
 *   - `rawGeometry` — PDF-space geometry snapshots, rotation-independent
 *     (pages load normalized; see `PageRotateResult`). Dropped only when a
 *     page leaves the registry or page CONTENT changes (redaction apply /
 *     flatten).
 *   - `derived` — the content-space transform + layout, keyed by the
 *     layout params (crop/rotation/userUnit) so a view-rotate re-derives
 *     from the cached raw snapshot with NO refetch.
 *   - `textSnapshots` — per-page text (for `readText`), same content-only
 *     invalidation as `rawGeometry`.
 *
 * Permission model: `doc.text.select` gates geometry (selection exists),
 * `doc.text.copy` gates text (extraction) — neither implies the other.
 * Host gesture functions are INERT when select is denied (`ensurePage`
 * no-ops, so nothing warms and nothing hit-tests: the pointer handler
 * needs no special-casing); the public `select()` THROWS `PermissionDenied`
 * so programmatic misuse is loud; `clear()` is always allowed. The engine
 * independently enforces both scopes — these gates exist so the plugin
 * never issues a request that is guaranteed to fail.
 *
 * Selection is cross-page: glyphs are ordered globally by (pageIndex,
 * glyph), so a drag from page 2 into page 4 selects the tail of 2, all of
 * 3, and the head of 4. `recompute` rebuilds the merged line segments for
 * every loaded page in the span, re-runs whenever a mid-span page finishes
 * loading, and CLAMPS stored endpoints once their page's geometry is known
 * (so `selectAll`'s open-ended focus settles to the real last character).
 */
export function createSelectionCapability(
  ctx: PluginContext<SelectionState, SelectionAction>,
): SelectionHostCapability {
  const rawGeometry = new Map<PageObjectNumber, PageGeometrySnapshot>();
  const derived = new Map<PageObjectNumber, { key: string; geom: SelectionPageGeometry }>();
  const pending = new Set<PageObjectNumber>();
  const textSnapshots = new Map<PageObjectNumber, Promise<PageTextSnapshot>>();
  /** Bumped on content invalidation; in-flight reads from before are discarded. */
  let epoch = 0;
  // Consumers (e.g. text-markup) observe the selection without selection knowing
  // about them: `change` fires whenever the segments change, `commit` when a
  // gesture ends (pointer-up). One typed callback each — not an event bus.
  const changeCbs = new Set<() => void>();
  const commitCbs = new Set<() => void>();
  const fireChange = (): void => changeCbs.forEach((cb) => cb());

  const canSelect = (): boolean => ctx.doc?.security.allows('doc.text.select') ?? false;
  const canCopy = (): boolean => ctx.doc?.security.allows('doc.text.copy') ?? false;

  const layoutOf = (pon: PageObjectNumber) =>
    ctx.document()?.pages.find((p) => p.pageObjectNumber === pon);
  const pageIndexOf = (pon: PageObjectNumber): number =>
    ctx.document()?.pages.findIndex((p) => p.pageObjectNumber === pon) ?? -1;
  const ponAtIndex = (i: number): PageObjectNumber | undefined =>
    ctx.document()?.pages[i]?.pageObjectNumber;

  /**
   * The content-space geometry for a page, derived on demand from the raw
   * snapshot + the CURRENT layout params. A view-rotate (or crop change)
   * changes the key and re-derives — raw caches and the engine are never
   * touched (rotation is presentation metadata).
   */
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
    const geom = geometryFor(ptr.pon);
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

  /** Union box of a page's segments, or null when none have materialized. */
  function pageBounds(pon: PageObjectNumber): Rect | null {
    const segs = ctx.getState().segments[pon];
    if (!segs || segs.length === 0) return null;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const s of segs) {
      x1 = Math.min(x1, s.rect.x);
      y1 = Math.min(y1, s.rect.y);
      x2 = Math.max(x2, s.rect.x + s.rect.width);
      y2 = Math.max(y2, s.rect.y + s.rect.height);
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  function menuAnchor(): SelectionMenuAnchor | null {
    const sel = ctx.getState().selection;
    if (!sel) return null;
    const { end } = orderedEnds(sel);
    // Prefer the gesture's end page; while its geometry is still loading,
    // fall back to the LAST page (document order) with materialized segments
    // so the anchor never teleports backwards mid-drag.
    let bounds = pageBounds(end.pon);
    if (bounds) return { pon: end.pon, bounds };
    const pages = ctx.document()?.pages ?? [];
    for (let i = pages.length - 1; i >= 0; i--) {
      const pon = pages[i].pageObjectNumber;
      bounds = pageBounds(pon);
      if (bounds) return { pon, bounds };
    }
    return null;
  }

  function snapshot(): SelectionSnapshot {
    const { selection, segments } = ctx.getState();
    const pages = Object.keys(segments)
      .map(Number)
      .filter((pon) => (segments[pon]?.length ?? 0) > 0)
      .map((pon) => ({ pon: pon as PageObjectNumber, segments: segments[pon] }));
    if (!selection) return { pages, start: null, end: null, direction: 'forward', range: null };
    const { start, end, direction } = orderedEnds(selection);
    return {
      pages,
      start: endpointFor(start, 'start'),
      end: endpointFor(end, 'end'),
      direction,
      range: {
        start: { pon: start.pon, index: start.glyph },
        end: { pon: end.pon, index: end.glyph + 1 },
      },
    };
  }

  function ensurePage(pon: PageObjectNumber): void {
    if (rawGeometry.has(pon) || pending.has(pon)) return;
    // Authorized-only warming: without doc.text.select the read is
    // guaranteed to be rejected — don't issue it. The engine guard stays
    // the security boundary either way.
    if (!canSelect()) return;
    const doc = ctx.doc;
    if (!doc || !layoutOf(pon)) return;
    pending.add(pon);
    const at = epoch;
    doc
      .page(pon)
      .geometry.read()
      .then(
        (snapshot) => {
          pending.delete(pon);
          if (at !== epoch) return; // content changed while in flight — stale
          rawGeometry.set(pon, snapshot);
          ctx.dispatch({ type: 'PAGE_LOADED', pon });
          if (ctx.getState().selection) recompute(); // a mid-span page arrived → fill its segments
        },
        () => {
          pending.delete(pon); // doc closed / read aborted / denied — ignore
        },
      );
  }

  /** Clamp a pointer into its page's real character range once geometry is
   *  known — how `selectAll`'s open-ended focus settles. */
  function clampPointer(ptr: GlyphPointer): GlyphPointer {
    const geom = geometryFor(ptr.pon);
    if (!geom) return ptr;
    const max = Math.max(geom.layout.glyphs.length - 1, 0);
    const glyph = Math.max(0, Math.min(ptr.glyph, max));
    return glyph === ptr.glyph ? ptr : { pon: ptr.pon, glyph };
  }

  // Rebuild merged line segments for every loaded page in the span; warm the
  // rest (they recompute on arrival). Clears when an endpoint's page has left
  // the registry — a range across a structural edit is meaningless.
  function recompute(sel: SelectionRange | null = ctx.getState().selection): void {
    if (!sel) return;
    const clamped: SelectionRange = {
      anchor: clampPointer(sel.anchor),
      focus: clampPointer(sel.focus),
    };
    const { start, end } = orderedEnds(clamped);
    const si = pageIndexOf(start.pon);
    const ei = pageIndexOf(end.pon);
    if (si < 0 || ei < 0) {
      clearSelection();
      return;
    }
    const segments: Record<number, SelectionSegment[]> = {};
    for (let i = si; i <= ei; i++) {
      const pon = ponAtIndex(i);
      if (pon == null) continue;
      const geom = geometryFor(pon);
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
    ctx.dispatch({ type: 'SET', selection: clamped, segments });
    fireChange();
  }

  /** Flip the gesture-in-flight FACT (see `SelectionState.selecting`). Set
   *  BEFORE the recompute that fires `onChange`, so change listeners always
   *  observe a coherent (selecting, segments) pair. */
  function setSelecting(selecting: boolean): void {
    ctx.dispatch({ type: 'SET_SELECTING', selecting });
  }

  function clearSelection(): void {
    setSelecting(false);
    ctx.dispatch({ type: 'CLEAR' });
    fireChange();
  }

  // Set the selection to a flat [from,to] glyph span on one page (word/line).
  // These are GESTURE vocabulary (double-/triple-click) — the commit arrives
  // at the pointer-up that follows, so the span counts as in-flight until then.
  // Returns whether a span actually engaged (geometry present AND a glyph
  // under the point) — the fact haptics and other success-gated feedback key
  // on, so nothing ever buzzes over blank space.
  function selectSpanAt(pon: PageObjectNumber, point: Point, expand: 'word' | 'line'): boolean {
    const geom = geometryFor(pon);
    if (!geom) return false;
    const i = glyphAt(geom, point);
    if (i == null) return false;
    const [from, to] =
      expand === 'word'
        ? expandTextRangeToWord(geom.layout, i)
        : expandTextRangeToLine(geom.layout, i);
    setSelecting(true);
    recompute({ anchor: { pon, glyph: from }, focus: { pon, glyph: to } });
    return true;
  }

  function assertCanSelect(context: string): void {
    if (!canSelect()) throw new PermissionDenied('doc.text.select', context);
  }

  /** The public programmatic entry: a half-open character range in. */
  function select(input: SelectionRangeInput): void {
    assertCanSelect('selection.select');
    const range: TextRange =
      'pon' in input
        ? {
            start: { pon: input.pon, index: input.start },
            end: { pon: input.pon, index: input.start + input.count },
          }
        : input;
    const si = pageIndexOf(range.start.pon);
    let ei = pageIndexOf(range.end.pon);
    if (si < 0 || ei < 0) {
      throw new Error(
        `select: unknown page object ${si < 0 ? range.start.pon : range.end.pon}`,
      );
    }
    let endIndex = range.end.index;
    if (ei < si || (ei === si && endIndex <= range.start.index)) {
      clearSelection(); // empty range = no selection
      return;
    }
    if (endIndex === 0) {
      // Half-open end exactly at a page boundary: the last included
      // character is the previous page's last one. Its index settles via
      // clamping once that page's geometry loads.
      ei -= 1;
      if (ei < si) {
        clearSelection();
        return;
      }
      endIndex = Number.MAX_SAFE_INTEGER;
    }
    const focusPon = ponAtIndex(ei);
    if (focusPon == null) throw new Error(`select: unknown page at index ${ei}`);
    setSelecting(false); // programmatic selections are born settled
    recompute({
      anchor: { pon: range.start.pon, glyph: Math.max(0, range.start.index) },
      focus: { pon: focusPon, glyph: endIndex - 1 },
    });
  }

  function selectAll(): void {
    assertCanSelect('selection.selectAll');
    const pages = ctx.document()?.pages ?? [];
    if (pages.length === 0) return;
    setSelecting(false); // programmatic selections are born settled
    recompute({
      anchor: { pon: pages[0].pageObjectNumber, glyph: 0 },
      focus: {
        pon: pages[pages.length - 1].pageObjectNumber,
        glyph: Number.MAX_SAFE_INTEGER, // settles to the real last character on load
      },
    });
  }

  /** Per-page text snapshot, cached as a PROMISE so concurrent readers
   *  share one fetch. Rejections are evicted (a denied or failed read must
   *  not poison the cache for a later authorized call). */
  function pageTextSnapshot(pon: PageObjectNumber): Promise<PageTextSnapshot> {
    let p = textSnapshots.get(pon);
    if (!p) {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('readText: document is not open'));
      p = Promise.resolve(doc.page(pon).text.read());
      p.catch(() => textSnapshots.delete(pon));
      textSnapshots.set(pon, p);
    }
    return p;
  }

  async function readText(): Promise<string> {
    const sel = ctx.getState().selection;
    if (!sel) return '';
    if (!canCopy()) throw new PermissionDenied('doc.text.copy', 'selection.readText');
    const { start, end } = orderedEnds(sel);
    const si = pageIndexOf(start.pon);
    const ei = pageIndexOf(end.pon);
    if (si < 0 || ei < 0) return '';
    // Per-page half-open character spans. Geometry is NOT needed here —
    // boundary offsets come from the range, interior pages span their whole
    // charCount (known from the text snapshot itself).
    const spans: Array<{ pon: PageObjectNumber; from: number; to: number }> = [];
    for (let i = si; i <= ei; i++) {
      const pon = ponAtIndex(i);
      if (pon == null) continue;
      spans.push({
        pon,
        from: i === si ? start.glyph : 0,
        to: i === ei ? end.glyph + 1 : Number.MAX_SAFE_INTEGER, // slice clamps to charCount
      });
    }
    const parts: string[] = new Array(spans.length);
    for (let base = 0; base < spans.length; base += TEXT_READ_CONCURRENCY) {
      const batch = spans.slice(base, base + TEXT_READ_CONCURRENCY);
      const snapshots = await Promise.all(batch.map((s) => pageTextSnapshot(s.pon)));
      snapshots.forEach((snap, j) => {
        parts[base + j] = sliceTextByChars(snap, batch[j].from, batch[j].to);
      });
    }
    return parts.join('\n');
  }

  /** Structural registry change (rotate/move/delete/insert — `revision`
   *  bumped): drop caches for pages that left, then recompute. Rotation
   *  re-derives transforms via the layout key; a deleted endpoint page
   *  clears via recompute's registry check. Raw snapshots are NEVER
   *  refetched here — they are rotation-independent. */
  function onPagesUpdated(): void {
    const alive = new Set((ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber));
    for (const pon of [...rawGeometry.keys()]) {
      if (!alive.has(pon)) {
        rawGeometry.delete(pon);
        derived.delete(pon);
        textSnapshots.delete(pon);
      }
    }
    if (ctx.getState().selection) recompute();
  }

  /** Page CONTENT changed (redaction apply / flatten): every cached
   *  snapshot — geometry AND text — is stale, and any live range points
   *  into a character space that no longer exists. Drop everything, clear. */
  function invalidateContent(): void {
    epoch++;
    rawGeometry.clear();
    derived.clear();
    pending.clear();
    textSnapshots.clear();
    if (ctx.getState().selection) clearSelection();
  }

  // ── lifecycle wiring (registry + content invalidation) ──
  let lastRevision = ctx.document()?.revision ?? -1;
  const offStore = ctx.subscribe(() => {
    const revision = ctx.document()?.revision;
    if (revision === undefined || revision === lastRevision) return;
    lastRevision = revision;
    onPagesUpdated();
  });
  ctx.cleanup(offStore);
  const offEvents = ctx.doc?.events.subscribe((event) => {
    if (event.type === 'redaction.applied' || event.type === 'pages.flattened') {
      invalidateContent();
    }
  });
  if (offEvents) ctx.cleanup(offEvents);

  return {
    // ── public lens ──
    canSelect,
    canCopy,
    select,
    selectAll,
    clear: clearSelection,
    snapshot,
    menuAnchor,
    isSelecting: () => ctx.getState().selecting,
    hasSelection: () => ctx.getState().selection != null,
    selectedPages: () => {
      const { segments } = ctx.getState();
      return Object.keys(segments)
        .map(Number)
        .filter((pon) => (segments[pon]?.length ?? 0) > 0) as PageObjectNumber[];
    },
    segmentsForPage: (pon) => ctx.getState().segments[pon] ?? EMPTY_SEGMENTS,
    rectsForPage: (pon) =>
      (ctx.getState().segments[pon] ?? EMPTY_SEGMENTS).map((s) => s.rect),
    readText,
    onChange: (cb) => {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onCommit: (cb) => {
      commitCbs.add(cb);
      return () => commitCbs.delete(cb);
    },

    // ── host lens ──
    ensurePage,
    isLoaded: (pon) => !!ctx.getState().loaded[pon],
    isOverText: (pon, point: Point) => {
      const geom = geometryFor(pon);
      return geom ? glyphAt(geom, point) != null : false;
    },
    beginAt: (pon, point: Point) => {
      const geom = geometryFor(pon);
      if (!geom) return false;
      const i = glyphAt(geom, point);
      if (i == null) return false; // not near text — caller deselects, doesn't capture
      setSelecting(true); // the gesture opened
      recompute({ anchor: { pon, glyph: i }, focus: { pon, glyph: i } });
      return true;
    },
    selectWordAt: (pon, point: Point) => selectSpanAt(pon, point, 'word'),
    selectLineAt: (pon, point: Point) => selectSpanAt(pon, point, 'line'),
    extendTo: (pon, point: Point) => {
      const cur = ctx.getState().selection;
      if (!cur) return;
      const geom = geometryFor(pon);
      if (!geom) {
        ensurePage(pon); // dragged onto a not-yet-loaded page — warm it, recompute on load
        return;
      }
      const i = glyphAt(geom, point);
      if (i == null) return; // off-text — keep the last focus
      recompute({ anchor: cur.anchor, focus: { pon, glyph: i } });
    },
    end: () => {
      // The gesture ended (pointer-up): settle FIRST, so commit listeners
      // (menus, clipboard prefetch) observe isSelecting() === false.
      setSelecting(false);
      commitCbs.forEach((cb) => cb());
    },
    setHighlightVisible: (visible) =>
      ctx.dispatch({ type: 'SET_HIGHLIGHT_HIDDEN', hidden: !visible }),
    highlightVisible: () => !ctx.getState().highlightHidden,
  };
}
