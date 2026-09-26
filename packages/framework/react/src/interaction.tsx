/**
 * The React surface for @embedpdf/plugin-interaction.
 *
 * <PagePointerSource> is the one pointer listener per page: it converts events to
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
import { pageRefsEqual } from '@embedpdf/core';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import type {
  InteractionCapability,
  Modifiers,
  PointerSample,
  ToolChangedEvent,
} from '@embedpdf/plugin-interaction';
import type { EventHook } from '@embedpdf/core';
import { svgCursor } from '@embedpdf/web';
import type { SvgCursorOptions } from '@embedpdf/web';
import { shallowArray, useCapability, useCapabilityEvent, usePage, useSelector } from './runtime';

const mods = (event: PointerEvent): Modifiers => ({
  shift: event.shiftKey,
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
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
  // The pointer source is a host of the hub (it dispatches samples).
  const interaction = useCapability(InteractionHostToken);
  const cursor = useSelector(InteractionHostToken, (interaction) => interaction.getCursor());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const clicks = createClickCounter();
    const sample = (
      phase: PointerSample['phase'],
      event: PointerEvent,
      clickCount = 1,
    ): PointerSample => {
      const rect = element.getBoundingClientRect();
      return {
        phase,
        viewport: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        // `scale`/`rotation`/`zoom` carry the same per-page environmental
        // context the Stage source resolves via `pageAt` — read off the page
        // transform so a standalone <PageView> drives handlers identically.
        page: {
          ref: page.ref,
          point: page.toContentPoint(event.clientX, event.clientY),
          scale: page.transform.viewScale,
          rotation: page.transform.rotation,
          zoom: page.transform.zoom,
        },
        // A per-page source can only project onto its own page — toContentPoint is
        // already unclamped (the drag listener lives on window), so a gesture
        // anchored here keeps tracking past the page bounds.
        project: (targetPage) =>
          pageRefsEqual(targetPage, page.ref)
            ? page.toContentPoint(event.clientX, event.clientY)
            : null,
        modifiers: mods(event),
        clickCount,
        pointerType: (event.pointerType || 'mouse') as PointerSample['pointerType'],
      };
    };
    let dragging = false;

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      interaction.dispatchPointer(
        sample('down', event, clicks(Date.now(), event.clientX, event.clientY)),
      );
    };
    // hover (no gesture): drive cursor feedback only — fires from the element
    const hover = (event: PointerEvent) => {
      if (dragging) return;
      interaction.dispatchPointer(sample('move', event));
    };
    // active drag: track on window so it survives leaving the page bounds
    const drag = (event: PointerEvent) => {
      if (!dragging) return;
      interaction.dispatchPointer(sample('move', event));
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      interaction.dispatchPointer(sample('up', event));
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', hover);
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', up);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', hover);
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', up);
    };
  }, [interaction, page]);

  // Sits on top as the page's event surface; visual layers below use pointerEvents:none.
  return <div ref={ref} style={{ position: 'absolute', inset: 0, cursor, touchAction: 'none' }} />;
}

/** The interaction capability (tools, cursor, handlers) for app chrome. */
export function useInteraction(): InteractionCapability {
  return useCapability(InteractionToken);
}

/** Subscribe to one interaction event for the mounted lifetime: `useInteractionEvent((interaction) => interaction.onGestureStarted, handler)`. */
export function useInteractionEvent<T>(
  select: (interaction: InteractionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(InteractionToken, select, handler);
}

/** Read + switch the active tool (for a toolbar). `push`/`pop` arm a tool
 *  temporarily (hold space to pan) and restore the previous one. */
export function useTool() {
  const interaction = useCapability(InteractionToken);
  const activeToolId = useSelector(InteractionToken, (interaction) =>
    interaction.getActiveToolId(),
  );
  const tools = useSelector(
    InteractionToken,
    (interaction) => interaction.listTools(),
    shallowArray,
  );
  return {
    activeToolId,
    activate: interaction.activateTool,
    tools,
    push: interaction.pushTool,
    pop: interaction.popTool,
  };
}

/** Run `handler` on every tool change of this subtree's document. */
export function useToolChanged(handler: (event: ToolChangedEvent) => void): void {
  useCapabilityEvent(InteractionToken, (interaction) => interaction.onToolChanged, handler);
}

/** One cursor slot: an SVG image ({@link SvgCursorOptions}) or a plain CSS
 *  cursor string ('crosshair', 'url(…) 4 4, copy'). */
export type ToolCursorImage = SvgCursorOptions | string;

/** What {@link useToolCursor} installs: the tool to reskin + its keyword map.
 *  Apps build `svg` from the same icon their toolbar renders, so the cursor
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
 * Give a tool image cursors — the armed-tool indicator. The cursor is the only
 * zero-latency pointer-locked pixel the platform has, and the hub already
 * arbitrates it: unmapped hover claims beat it over annotations/text, page
 * gaps fall back to the tool's `gapCursor`, and other UI (menus, form fill
 * controls) carries its own CSS cursor — so nothing chases the pointer in
 * DOM. `null` installs nothing. A re-render with new content rebuilds the
 * cursor (live recolor from tool defaults); unmount restores the tool's
 * declared cursors.
 */
export function useToolCursor(spec: ToolCursorSpec | null): void {
  const interaction = useCapability(InteractionHostToken);
  // Key the effect by value: specs are built inline in render, and a
  // fresh-but-identical object must not thrash the skin.
  const key = spec && JSON.stringify(spec);
  const ref = useRef(spec);
  ref.current = spec;
  useEffect(() => {
    const cursorSpec = ref.current;
    if (!cursorSpec) return;
    interaction.setToolCursor(
      cursorSpec.toolId,
      Object.fromEntries(
        Object.entries(cursorSpec.cursors).map(([key, image]) => [key, toCursor(image, key)]),
      ),
    );
    return () => interaction.setToolCursor(cursorSpec.toolId, null);
  }, [interaction, key]);
}
