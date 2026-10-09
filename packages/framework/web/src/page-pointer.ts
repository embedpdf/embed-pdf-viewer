/**
 * A page's own pointer listener: what a page pointer source (`PagePointerSource`, a `PageView`'s
 * pointer surface) attaches to its element. It turns each pointer event into a point on the page
 * through the page context, so it needs nothing but the page, and hands the sample to the
 * interaction hub, whose active tool decides what the press means.
 *
 * A Stage takes its pointer input itself (`createStageSurface`); this is for one page on its own.
 * Like the rest of this package it speaks to the hub through structural types
 * ({@link PagePointerHub}), which `InteractionHostCapability` satisfies.
 */
import type { PageRef } from './page-ref';

interface PointerPoint {
  x: number;
  y: number;
}

/**
 * A multi-click counter. `pointerdown.detail` is 0 or 1 in several browsers, so clicks are
 * counted here from timing and distance: the standard double and triple click. Input is
 * normalized in the adapter; the hub and its handlers stay pure.
 */
export function createClickCounter(maxGapMs = 400, maxDistancePx = 6) {
  let last = 0;
  let lastX = 0;
  let lastY = 0;
  let count = 0;
  return (now: number, x: number, y: number): number => {
    count =
      now - last <= maxGapMs && Math.hypot(x - lastX, y - lastY) <= maxDistancePx ? count + 1 : 1;
    last = now;
    lastX = x;
    lastY = y;
    return count;
  };
}

/** What the listener reads from the page context when an event arrives. */
export interface PagePointerPage {
  readonly ref: PageRef;
  readonly transform: {
    readonly viewScale: number;
    readonly rotation: 0 | 90 | 180 | 270;
    readonly zoom: number;
  };
  toPagePoint(clientX: number, clientY: number): PointerPoint;
}

/** The sample the listener hands the hub: structurally the interaction plugin's `PointerSample`. */
export interface PagePointerSample {
  phase: 'down' | 'move' | 'up';
  viewport: PointerPoint;
  page: {
    ref: PageRef;
    point: PointerPoint;
    scale: number;
    rotation: 0 | 90 | 180 | 270;
    zoom: number;
  };
  project: (page: PageRef) => PointerPoint | null;
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean };
  clickCount: number;
  pointerType: 'mouse' | 'pen' | 'touch';
}

/** What the listener needs from the interaction hub; `InteractionHostCapability` satisfies it. */
export interface PagePointerHub {
  dispatchPointer(sample: PagePointerSample): void;
}

/**
 * Listen to the pointer on `element` for the page `page()` gives when an event arrives (a zoom
 * changes it, and a drag carries on through it), and dispatch every event to `hub`. A press
 * starts on the element; while it lasts the window listens, so a drag goes on outside the page.
 * Returns the function that stops listening.
 */
export function attachPagePointer(
  element: HTMLElement,
  hub: PagePointerHub,
  page: () => PagePointerPage,
): () => void {
  const clicks = createClickCounter();
  const sample = (
    phase: PagePointerSample['phase'],
    event: PointerEvent,
    clickCount = 1,
  ): PagePointerSample => {
    const current = page();
    const rect = element.getBoundingClientRect();
    return {
      phase,
      viewport: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      // The same per-page facts the Stage's own source finds for the page under the pointer,
      // read off the page transform, so every page surface drives handlers alike.
      page: {
        ref: current.ref,
        point: current.toPagePoint(event.clientX, event.clientY),
        scale: current.transform.viewScale,
        rotation: current.transform.rotation,
        zoom: current.transform.zoom,
      },
      // A page's source projects onto its own page only. `toPagePoint` is unclamped (the drag
      // listener is on the window), so a gesture that starts here keeps tracking past the edge.
      project: (target) =>
        target.kind === current.ref.kind && target.objectNumber === current.ref.objectNumber
          ? current.toPagePoint(event.clientX, event.clientY)
          : null,
      modifiers: {
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
      },
      clickCount,
      pointerType: (event.pointerType || 'mouse') as PagePointerSample['pointerType'],
    };
  };
  let dragging = false;

  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    hub.dispatchPointer(sample('down', event, clicks(Date.now(), event.clientX, event.clientY)));
  };
  // Hovering, with no press: cursor feedback only, from the element.
  const hover = (event: PointerEvent) => {
    if (dragging) return;
    hub.dispatchPointer(sample('move', event));
  };
  const drag = (event: PointerEvent) => {
    if (!dragging) return;
    hub.dispatchPointer(sample('move', event));
  };
  const up = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    hub.dispatchPointer(sample('up', event));
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
}
