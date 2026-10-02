/**
 * Headless scrollbar for a Stage lens — a pure view of `stage.getScrollMetrics()`.
 *
 * The Stage exposes the native scroller contract (scrollTop/scrollHeight/
 * clientHeight, in screen px — see plugin-stage's README); this component turns
 * it into a native-feeling bar: thumb drag with pointer capture and a preserved
 * grab point, track paging with press-and-hold repeat that stops at the
 * pointer, a minimum thumb length on long documents, and macOS-style overlay
 * auto-hide. On an unbounded stage the metrics already carry the Figma
 * semantics (the range is the union of content and view), so the same bar
 * shrinks toward the edge as you pan away and rides you back — the mapping is
 * frozen for the duration of a thumb drag so the thumb never chases itself
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
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';
import type { ScrollMetrics, StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import type { CapabilityToken } from '@embedpdf/core';
import { createScrollbarPresses, paintDefault, scrollbarLayout } from '@embedpdf/web';
import type { ScrollbarTrack } from '@embedpdf/web';
import { useCapability, useDocumentScope, useKernelValue } from './runtime';
import { useStageToken } from './stage-scope';

export type ScrollbarAxis = 'x' | 'y';

/** What a view with nothing to scroll measures: no document, or not placed yet. */
const NO_SCROLL: ScrollMetrics = Object.freeze({
  scrollLeft: 0,
  scrollTop: 0,
  scrollWidth: 0,
  scrollHeight: 0,
  clientWidth: 0,
  clientHeight: 0,
  scrollableX: false,
  scrollableY: false,
});

/**
 * The view's scroll position as a scrolling element has it: `scrollTop`,
 * `scrollHeight`, `clientHeight` and their horizontal twins, in screen pixels.
 * The raw material for scroll UI of your own; all zero without a document.
 */
export function useScrollMetrics(token?: CapabilityToken<StageCapability>): ScrollMetrics {
  const lens = asHost(useStageToken(token));
  const scoped = useDocumentScope();
  // The capability keeps the same metrics object until a number moves.
  return useKernelValue(
    (kernel) => kernel.tryCapability(lens, scoped ?? undefined)?.getScrollMetrics() ?? NO_SCROLL,
  );
}

// Scroll metrics live on the host lens (the same runtime token, typed wider):
// a scrollbar is chrome that drives the camera, not a document-level consumer.
const asHost = (token: CapabilityToken<StageCapability>) =>
  token as unknown as CapabilityToken<StageHostCapability>;

export interface ScrollbarProps {
  axis: ScrollbarAxis;
  /** The stage lens to scroll (default: the nearest `<StageScope>` / `<Stage>`, else the main StageToken). */
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

export function Scrollbar({
  axis,
  token: explicitToken,
  autoHide = 1200,
  minThumbSize = 24,
  trackPress = 'page',
  className,
  style,
  thumbClassName,
  thumbStyle,
}: ScrollbarProps) {
  const token = useStageToken(explicitToken);
  const stage = useCapability(asHost(token));
  const metrics = useScrollMetrics(token);
  const vertical = axis === 'y';
  const scrollable = vertical ? metrics.scrollableY : metrics.scrollableX;

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(true); // camera moved recently

  // The thumb along the track: one formula for drawing, dragging and paging, shared with every framework.
  const layout = scrollbarLayout(metrics, vertical, trackPx, minThumbSize);

  // ── overlay auto-hide: any metrics change re-arms the fade timer ──────────
  const hideAfter = autoHide === false ? 0 : autoHide;
  useEffect(() => {
    if (!hideAfter) return;
    setActive(true);
    const timer = setTimeout(() => setActive(false), hideAfter);
    return () => clearTimeout(timer);
  }, [metrics, hideAfter]);
  const shown = !hideAfter || active || hovered || dragging;

  // ── track measurement (px mapping needs real geometry) ────────────────────
  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    const measure = () => setTrackPx(vertical ? element.clientHeight : element.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(element);
    measure();
    return () => ro.disconnect();
  }, [vertical, scrollable]);

  // ── interactions: `@embedpdf/web`'s press handling (thumb drags, track paging and jumps),
  //    one per bar, handed the bar as this render has it on every event. ──
  const presses = useMemo(() => createScrollbarPresses(setDragging), []);
  const track = (): ScrollbarTrack => ({
    stage,
    vertical,
    element: trackRef.current!,
    layout,
    // Fresh geometry for paging steps — read from the capability, never a stale render.
    liveLayout: () => scrollbarLayout(stage.getScrollMetrics(), vertical, trackPx, minThumbSize),
  });

  useEffect(() => () => presses.release(), [presses]); // unmount: no orphaned repeat timers

  if (!scrollable) return null;

  const trackDefaults: React.CSSProperties = vertical
    ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: 12 }
    : { position: 'absolute', left: 0, right: 0, bottom: 0, height: 12 };
  const thumbDefaults: React.CSSProperties = vertical
    ? {
        position: 'absolute',
        left: 2,
        right: 2,
        top: layout.thumbPosition,
        height: layout.thumbLength,
      }
    : {
        position: 'absolute',
        top: 2,
        bottom: 2,
        left: layout.thumbPosition,
        width: layout.thumbLength,
      };

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={Math.round(layout.maxOffset)}
      aria-valuenow={Math.round(layout.offset)}
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
      // Pointer capture retargets to the pressed element and bubbles here — one
      // move/up pair serves thumb drags, jump-drags, and paging alike.
      onPointerDown={(event) => presses.pressTrack(event, track(), trackPress)}
      onPointerMove={(event) => presses.move(event, track())}
      onPointerUp={() => presses.release()}
      onPointerCancel={() => presses.release()}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        data-embedpdf-scrollbar-thumb=""
        className={thumbClassName}
        style={{
          ...thumbDefaults,
          borderRadius: 6,
          background: paintDefault('scrollbar-thumb'),
          ...thumbStyle,
        }}
        onPointerDown={(event) => presses.pressThumb(event, track())}
      />
    </div>
  );
}
