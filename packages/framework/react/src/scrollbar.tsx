/**
 * Headless scrollbar for a Stage lens — a pure view of `stage.scrollMetrics()`.
 *
 * The Stage exposes the native scroller contract (scrollTop/scrollHeight/
 * clientHeight, in screen px — see plugin-stage's README); this component turns
 * it into a native-feeling bar: thumb drag with pointer capture and a preserved
 * grab point, track paging with press-and-hold repeat that stops at the
 * pointer, a minimum thumb length on long documents, and macOS-style overlay
 * auto-hide. On an UNBOUNDED stage the metrics already carry the Figma
 * semantics (the range is the union of content and view), so the same bar
 * shrinks toward the edge as you pan away and rides you back — the mapping is
 * FROZEN for the duration of a thumb drag so the thumb never chases itself
 * while the union re-collapses.
 *
 * Headless styling contract: geometry and behavior live here; looks live in
 * your CSS. Style via `className`/`thumbClassName` (or the style props) against
 *   [data-embedpdf-scrollbar][data-axis="y"][data-state="visible|hidden"]
 *   [data-embedpdf-scrollbar][data-dragging]
 *   [data-embedpdf-scrollbar-thumb]
 * The defaults are deliberately minimal: a transparent track pinned to the
 * viewport edge and a `var(--epdf-scrollbar-thumb, …)` pill, so the bar works
 * unstyled and disappears into any theme. Build something else entirely
 * (minimap, progress ring) from `useScrollMetrics()` + `stage.scrollTo()`.
 */

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { StageToken } from '@embedpdf/plugin-stage';
import type { ScrollMetrics, StageCapability } from '@embedpdf/plugin-stage';
import type { CapabilityToken } from '@embedpdf/core';
import { useCapability, useSelector } from './runtime';

export type ScrollbarAxis = 'x' | 'y';

/** Live scroll metrics for a stage lens (reference-stable; see
 *  `StageCapability.scrollMetrics`). The raw material for custom scroll UI. */
export function useScrollMetrics(
  token: CapabilityToken<StageCapability> = StageToken,
): ScrollMetrics {
  return useSelector(token, (c) => c.scrollMetrics());
}

export interface ScrollbarProps {
  axis: ScrollbarAxis;
  /** The stage lens to scroll (default: the main StageToken). */
  token?: CapabilityToken<StageCapability>;
  /**
   * Overlay auto-hide: fade `autoHide` ms after the camera stops moving
   * (drags and hover pin it visible; a hidden bar ignores the pointer, like
   * macOS). `false` = always visible. Visibility is published as
   * `data-state="visible|hidden"` — the default style fades opacity; replace
   * it in CSS for any other treatment. Default 1200.
   */
  autoHide?: number | false;
  /** Minimum thumb length in px — native bars never vanish on long documents.
   *  Position stays proportional via the standard travel remap. Default 24. */
  minThumbSize?: number;
  /**
   * Pressing the track: 'page' steps by 90% of a viewport toward the pointer,
   * repeats while held, and stops when the thumb reaches the pointer (the
   * native default); 'jump' centers the thumb at the pointer and hands off to
   * a drag (the macOS option-click / Figma feel). Default 'page'.
   */
  trackPress?: 'page' | 'jump';
  /** Track class/style. The default style pins the bar to the right (y) or
   *  bottom (x) edge of the nearest positioned ancestor — the Stage container
   *  when rendered in its `overlay`; override to place it anywhere else. */
  className?: string;
  style?: React.CSSProperties;
  thumbClassName?: string;
  thumbStyle?: React.CSSProperties;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Best-effort pointer capture: an already-released pointer (pen/touch races,
 *  synthetic events in tests) throws NotFoundError — the press must still work,
 *  just without capture (moves keep arriving while the pointer stays on us). */
const capturePointer = (el: Element, pointerId: number) => {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* uncaptured is fine */
  }
};

/** Thumb geometry from metrics + a measured track. One formula for render,
 *  drag capture, and paging — they can never disagree. */
const geometry = (m: ScrollMetrics, vertical: boolean, trackPx: number, minThumbSize: number) => {
  const client = vertical ? m.clientHeight : m.clientWidth;
  const total = vertical ? m.scrollHeight : m.scrollWidth;
  const offset = vertical ? m.scrollTop : m.scrollLeft;
  const maxOffset = Math.max(0, total - client);
  const thumbLen = Math.min(
    trackPx,
    Math.max(minThumbSize, total > 0 ? (client / total) * trackPx : 0),
  );
  const travel = Math.max(0, trackPx - thumbLen);
  const thumbPos = maxOffset > 0 ? (offset / maxOffset) * travel : 0;
  return { client, offset, maxOffset, thumbLen, travel, thumbPos };
};

export function Scrollbar({
  axis,
  token = StageToken,
  autoHide = 1200,
  minThumbSize = 24,
  trackPress = 'page',
  className,
  style,
  thumbClassName,
  thumbStyle,
}: ScrollbarProps) {
  const stage = useCapability(token);
  const m = useScrollMetrics(token);
  const vertical = axis === 'y';
  const scrollable = vertical ? m.scrollableY : m.scrollableX;

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(true); // camera moved recently

  const g = geometry(m, vertical, trackPx, minThumbSize);

  // ── overlay auto-hide: any metrics change re-arms the fade timer ──────────
  const hideAfter = autoHide === false ? 0 : autoHide;
  useEffect(() => {
    if (!hideAfter) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), hideAfter);
    return () => clearTimeout(t);
  }, [m, hideAfter]);
  const shown = !hideAfter || active || hovered || dragging;

  // ── track measurement (px mapping needs real geometry) ────────────────────
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackPx(vertical ? el.clientHeight : el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [vertical, scrollable]);

  // ── interactions. Drag state is FROZEN at pointer-down (grab point, travel,
  //    max offset) and applied as relative pans — absolute-feeling in bounded
  //    mode (the range is static there) and stable in unbounded mode, where
  //    the live union would otherwise shift under the pointer mid-drag. ──────
  const dragRef = useRef<{ grab: number; applied: number; max: number; travel: number } | null>(
    null,
  );
  const pageRef = useRef<{ dir: 1 | -1; timer: number } | null>(null);
  const lastPtr = useRef(0);

  const ptrPos = (e: React.PointerEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    return vertical ? e.clientY - r.top : e.clientX - r.left;
  };
  /** Fresh geometry for paging steps — read from the capability, never a stale render. */
  const liveGeometry = () => geometry(stage.scrollMetrics(), vertical, trackPx, minThumbSize);

  const stopPaging = () => {
    if (pageRef.current) {
      clearTimeout(pageRef.current.timer);
      clearInterval(pageRef.current.timer);
      pageRef.current = null;
    }
  };
  const endDrag = () => {
    dragRef.current = null;
    stopPaging();
    setDragging(false);
  };

  const beginDrag = (grab: number, applied: number) => {
    dragRef.current = { grab, applied, max: g.maxOffset, travel: g.travel };
    setDragging(true);
  };

  const onThumbDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    capturePointer(e.target as Element, e.pointerId);
    beginDrag(ptrPos(e) - g.thumbPos, g.offset);
  };

  const onTrackDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return; // thumb handles its own
    e.preventDefault();
    capturePointer(e.currentTarget as Element, e.pointerId);
    const p = (lastPtr.current = ptrPos(e));

    if (trackPress === 'jump') {
      // land the thumb centered at the pointer, then it's an ordinary drag
      const want = g.travel > 0 ? clamp01((p - g.thumbLen / 2) / g.travel) * g.maxOffset : 0;
      stage.scrollTo(vertical ? { top: want } : { left: want });
      beginDrag(g.thumbLen / 2, want);
      return;
    }

    // 'page': step toward the pointer, repeat while held, stop at the pointer
    const dir: 1 | -1 = p < g.thumbPos ? -1 : 1;
    const step = () => {
      const live = liveGeometry();
      const reached =
        dir === 1
          ? lastPtr.current <= live.thumbPos + live.thumbLen
          : lastPtr.current >= live.thumbPos;
      if (reached) return stopPaging();
      stage.scrollBy(
        vertical ? { top: dir * live.client * 0.9 } : { left: dir * live.client * 0.9 },
      );
    };
    step();
    // native cadence: a beat before the repeat kicks in, then a steady march
    const timer = window.setTimeout(() => {
      if (!pageRef.current) return;
      pageRef.current.timer = window.setInterval(step, 80);
    }, 350);
    pageRef.current = { dir, timer };
  };

  // Pointer capture retargets to the pressed element and bubbles here — one
  // move/up pair serves thumb drags, jump-drags, and paging alike.
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      if (d.travel <= 0) return;
      const want = clamp01((ptrPos(e) - d.grab) / d.travel) * d.max;
      const delta = want - d.applied;
      if (delta) {
        stage.panBy(vertical ? 0 : -delta, vertical ? -delta : 0);
        d.applied = want;
      }
    } else if (pageRef.current) {
      lastPtr.current = ptrPos(e);
    }
  };

  useEffect(() => endDrag, []); // unmount: no orphaned repeat timers

  if (!scrollable) return null;

  const trackDefaults: React.CSSProperties = vertical
    ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: 12 }
    : { position: 'absolute', left: 0, right: 0, bottom: 0, height: 12 };
  const thumbDefaults: React.CSSProperties = vertical
    ? { position: 'absolute', left: 2, right: 2, top: g.thumbPos, height: g.thumbLen }
    : { position: 'absolute', top: 2, bottom: 2, left: g.thumbPos, width: g.thumbLen };

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={Math.round(g.maxOffset)}
      aria-valuenow={Math.round(g.offset)}
      data-embedpdf-scrollbar=""
      data-axis={axis}
      data-state={shown ? 'visible' : 'hidden'}
      data-dragging={dragging ? '' : undefined}
      className={className}
      style={{
        ...trackDefaults,
        touchAction: 'none',
        userSelect: 'none',
        opacity: shown ? 1 : 0,
        transition: 'opacity 200ms',
        // a hidden overlay bar must not eat the clicks under it
        pointerEvents: shown ? 'auto' : 'none',
        ...style,
      }}
      onPointerDown={onTrackDown}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        data-embedpdf-scrollbar-thumb=""
        className={thumbClassName}
        style={{
          ...thumbDefaults,
          borderRadius: 6,
          background: 'var(--epdf-scrollbar-thumb, rgba(0, 0, 0, 0.4))',
          ...thumbStyle,
        }}
        onPointerDown={onThumbDown}
      />
    </div>
  );
}
