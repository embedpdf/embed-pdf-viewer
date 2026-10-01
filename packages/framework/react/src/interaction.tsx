/**
 * The React surface for @embedpdf/plugin-interaction.
 *
 * <PagePointerSource> is the one pointer listener per page: it converts events to
 * page space via PageContext.toPagePoint and forwards normalized samples to the
 * hub. It binds only to the page context, so it works identically inside a
 * virtualized <Stage> page and a standalone <PageView>. Features never attach
 * their own pointer listeners: they register handlers with the hub, and a tool
 * of your own brings its pointer methods (`registerTool`).
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-interaction';
// The browser helpers live in @embedpdf/web (the plugin is DOM-free); they are
// re-exported here so app code has one import for the feature.
export { svgCursor, vibrationFeedback, wkFeedback } from '@embedpdf/web';
export type { SvgCursorOptions } from '@embedpdf/web';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { pageRefsEqual } from '@embedpdf/core';
import {
  InteractionToken as InteractionHostToken,
  type PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import { InteractionToken, interactionState } from '@embedpdf/plugin-interaction';
import type { InteractionCapability, Modifiers } from '@embedpdf/plugin-interaction';
import type { EventHook } from '@embedpdf/core';
import { svgCursor } from '@embedpdf/web';
import type { SvgCursorOptions } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  usePage,
  useSelector,
} from './runtime';
import { settingsHook, stateHook } from './state';

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
          point: page.toPagePoint(event.clientX, event.clientY),
          scale: page.transform.viewScale,
          rotation: page.transform.rotation,
          zoom: page.transform.zoom,
        },
        // A per-page source can only project onto its own page — toPagePoint is
        // already unclamped (the drag listener lives on window), so a gesture
        // anchored here keeps tracking past the page bounds.
        project: (targetPage) =>
          pageRefsEqual(targetPage, page.ref)
            ? page.toPagePoint(event.clientX, event.clientY)
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

/** The interaction capability: switch tools, add your own, set their cursors. */
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

/**
 * The tools' state: the active tool's id and every tool you can switch to
 * (the page's State table, declared once in `interactionState`). Takes a
 * selector, and re-renders only when what it returns changes. Without a
 * document there is no active tool (`null`) and no tool.
 */
export const useInteractionState = stateHook(interactionState);

/** The interaction settings (`defaultTool`, `tools`), with or without a document. Takes a selector. */
export const useInteractionSettings = settingsHook(InteractionToken);

/** One cursor slot: an SVG image ({@link SvgCursorOptions}) or a plain CSS
 *  cursor string ('crosshair', 'url(…) 4 4, copy'). */
export type ToolCursorImage = SvgCursorOptions | string;

/** What {@link useToolCursor} installs: the tool, and its cursors by name.
 *  Apps build `svg` from the same icon their toolbar renders, so the cursor
 *  and the button can never drift apart. */
export interface ToolCursorSpec {
  toolId: string;
  /** keyword → cursor: replace the keywords this tool can show (its own
   *  cursor, 'crosshair' or 'copy', and hover claims, 'text' over text) with
   *  the tool's look. Keywords the map leaves out show as they are: a markup
   *  tool's 'default' stays the bare arrow, a 'move' claim drops the icon. An
   *  SVG value's `fallback` defaults to the keyword it replaces. */
  cursors: Record<string, ToolCursorImage>;
}

const toCursor = (image: ToolCursorImage, fallback?: string): string =>
  typeof image === 'string'
    ? image
    : svgCursor(image.fallback === undefined && fallback ? { ...image, fallback } : image);

/**
 * Give a tool image cursors — the armed-tool indicator. The cursor is the only
 * zero-latency pointer-locked pixel the platform has, and the hub already
 * arbitrates it: unmapped hover claims beat it over annotations/text, page
 * gaps fall back to the tool's `gapCursor`, and other UI (menus, form fill
 * controls) carries its own CSS cursor — so nothing chases the pointer in
 * DOM. `null` installs nothing. A re-render with new content rebuilds the
 * cursor (live recolor from tool defaults); unmount restores the tool's
 * declared cursors. Without a document it installs nothing until one is ready.
 */
export function useToolCursor(spec: ToolCursorSpec | null): void {
  const interaction = useOptionalCapability(InteractionHostToken);
  // Key the effect by value: specs are built inline in render, and a
  // fresh-but-identical object must not thrash the skin.
  const key = spec && JSON.stringify(spec);
  const ref = useRef(spec);
  ref.current = spec;
  useEffect(() => {
    const cursorSpec = ref.current;
    if (!cursorSpec || !interaction) return;
    interaction.setToolCursor(
      cursorSpec.toolId,
      Object.fromEntries(
        Object.entries(cursorSpec.cursors).map(([key, image]) => [key, toCursor(image, key)]),
      ),
    );
    return () => interaction.setToolCursor(cursorSpec.toolId, null);
  }, [interaction, key]);
}
