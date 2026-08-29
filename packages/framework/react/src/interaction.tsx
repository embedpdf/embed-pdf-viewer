/**
 * The React surface for @embedpdf/plugin-interaction.
 *
 * <PagePointerSource> is the ONE pointer listener per page: it converts events to
 * page space via PageContext.toContentPoint and forwards normalized samples to the
 * hub. It binds only to the page context, so it works identically inside a
 * virtualized <Stage> page and a standalone <PageView>. Features never attach
 * their own pointer listeners — they register handlers with the hub.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-interaction';
// The browser feedback providers live in @embedpdf/web (the plugin is
// DOM-free); re-exported here so app code has one import for the feature.
export { vibrationFeedback, wkFeedback } from '@embedpdf/web';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import type { Modifiers, PointerSample } from '@embedpdf/plugin-interaction';
import { svgCursor } from '@embedpdf/web';
import type { SvgCursorOptions } from '@embedpdf/web';
import { useCapability, usePage, useSelector } from './runtime';

const mods = (e: PointerEvent): Modifiers => ({
  shift: e.shiftKey,
  alt: e.altKey,
  ctrl: e.ctrlKey,
  meta: e.metaKey,
});

/**
 * Robust multi-click counter. `pointerdown.detail` is 0/1 in several browsers, so
 * we count clicks ourselves from timing + proximity — the standard double/triple
 * detection. Input normalization belongs in the adapter; the hub/handlers stay pure.
 */
export function createClickCounter(maxGapMs = 400, maxDistPx = 6) {
  let last = 0;
  let lx = 0;
  let ly = 0;
  let count = 0;
  return (now: number, x: number, y: number): number => {
    count = now - last <= maxGapMs && Math.hypot(x - lx, y - ly) <= maxDistPx ? count + 1 : 1;
    last = now;
    lx = x;
    ly = y;
    return count;
  };
}

export function PagePointerSource() {
  const page = usePage();
  const interaction = useCapability(InteractionToken);
  const cursor = useSelector(InteractionToken, (c) => c.cursor());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clicks = createClickCounter();
    const sample = (
      phase: PointerSample['phase'],
      e: PointerEvent,
      clickCount = 1,
    ): PointerSample => {
      const r = el.getBoundingClientRect();
      return {
        phase,
        viewport: { x: e.clientX - r.left, y: e.clientY - r.top },
        // `scale`/`rotation`/`zoom` carry the same per-page environmental
        // context the Stage source resolves via `pageAt` — read off the page
        // transform so a standalone <PageView> drives handlers identically.
        page: {
          pon: page.pon,
          point: page.toContentPoint(e.clientX, e.clientY),
          scale: page.transform.viewScale,
          rotation: page.transform.rotation,
          zoom: page.transform.zoom,
        },
        // A per-page source can only project onto its OWN page — toContentPoint is
        // already unclamped (the drag listener lives on window), so a gesture
        // anchored here keeps tracking past the page bounds.
        project: (pon) => (pon === page.pon ? page.toContentPoint(e.clientX, e.clientY) : null),
        modifiers: mods(e),
        clickCount,
        pointerType: (e.pointerType || 'mouse') as PointerSample['pointerType'],
      };
    };
    let dragging = false;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      interaction.dispatch(sample('down', e, clicks(Date.now(), e.clientX, e.clientY)));
    };
    // hover (no gesture): drive cursor feedback only — fires from the element
    const hover = (e: PointerEvent) => {
      if (dragging) return;
      interaction.dispatch(sample('move', e));
    };
    // active drag: track on window so it survives leaving the page bounds
    const drag = (e: PointerEvent) => {
      if (!dragging) return;
      interaction.dispatch(sample('move', e));
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      interaction.dispatch(sample('up', e));
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', hover);
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', hover);
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', up);
    };
  }, [interaction, page]);

  // Sits on top as the page's event surface; visual layers below use pointerEvents:none.
  return <div ref={ref} style={{ position: 'absolute', inset: 0, cursor, touchAction: 'none' }} />;
}

/** Read + switch the active tool (for a toolbar). */
export function useTool() {
  const interaction = useCapability(InteractionToken);
  const activeToolId = useSelector(InteractionToken, (c) => c.activeToolId());
  return {
    activeToolId,
    activate: interaction.activateTool,
    tools: interaction.tools(),
  };
}

/** One cursor slot: an SVG image ({@link SvgCursorOptions}) or a plain CSS
 *  cursor string ('crosshair', 'url(…) 4 4, copy'). */
export type ToolCursorImage = SvgCursorOptions | string;

/** What {@link useToolCursor} installs: the tool to reskin + its keyword map.
 *  Apps build `svg` from the SAME icon their toolbar renders, so the cursor
 *  and the button can never drift apart. */
export interface ToolCursorSpec {
  toolId: string;
  /** keyword → cursor: restyle the keywords this tool can show — its declared
   *  base ('crosshair', 'copy') and hover claims ('text' over text) — in the
   *  tool's identity. Keywords the map omits render as-is: a markup tool's
   *  'default' base stays the bare arrow, a foreign 'move' claim drops the
   *  icon. An SVG value defaults its keyword `fallback` to the keyword it
   *  replaces. */
  cursors: Record<string, ToolCursorImage>;
}

const toCursor = (img: ToolCursorImage, fallback?: string): string =>
  typeof img === 'string'
    ? img
    : svgCursor(img.fallback === undefined && fallback ? { ...img, fallback } : img);

/**
 * Give a tool IMAGE cursors — the armed-tool indicator. The cursor is the only
 * zero-latency pointer-locked pixel the platform has, and the hub already
 * arbitrates it: unmapped hover claims beat it over annotations/text, page
 * gaps fall back to the tool's `gapCursor`, and other UI (menus, form fill
 * controls) carries its own CSS cursor — so nothing chases the pointer in
 * DOM. `null` installs nothing. A re-render with new content rebuilds the
 * cursor (live recolor from tool defaults); unmount restores the tool's
 * declared cursors.
 */
export function useToolCursor(spec: ToolCursorSpec | null): void {
  const interaction = useCapability(InteractionToken);
  // Key the effect by VALUE: specs are built inline in render, and a
  // fresh-but-identical object must not thrash the skin.
  const key = spec && JSON.stringify(spec);
  const ref = useRef(spec);
  ref.current = spec;
  useEffect(() => {
    const s = ref.current;
    if (!s) return;
    interaction.setToolCursor(
      s.toolId,
      Object.fromEntries(Object.entries(s.cursors).map(([k, v]) => [k, toCursor(v, k)])),
    );
    return () => interaction.setToolCursor(s.toolId, null);
  }, [interaction, key]);
}
