/**
 * What opens over the whole viewer: a layer the size of the viewer's box on
 * screen, in the browser's top layer, where sheets and dialogs open. In the
 * top layer nothing the viewer draws covers it, and what opens later (a menu
 * from a sheet, a dialog from a panel) sits above what opened before. And
 * what holds the keyboard while it's open (a sheet, a dialog): it takes
 * focus, keeps Tab inside it, closes on Escape, and gives focus back to what
 * had it before, the button that opened it. An overlay panel takes focus the
 * same way but lets Tab move on, so the rest of the viewer stays in reach.
 */
import {
  attachFocusTrap,
  deepActiveElementOf,
  observeClientGeometry,
  tabbablesIn,
} from '@embedpdf/web';

import { screenEdgesOf, windowSizeOf, type ScreenEdges } from './screen-edges';

/** The `popover` attribute, which React's types don't list yet. */
export const POPOVER = { popover: 'manual' } as Record<string, string>;

/** The custom element's root: the viewer's box. */
const VIEWER_ROOT_SELECTOR = '[data-embedpdf-root]';

/** What another surface that holds focus is marked with: a press in it is not a press outside. */
export const MODAL_SELECTOR = '[aria-modal="true"]';

/** Place `element` (`position: fixed`) at a box in window px. */
function placeFixed(
  element: HTMLElement,
  box: { left: number; top: number; width: number; height: number },
): void {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
  // Without the top layer, `position: fixed` starts at the viewer's box (its `contain`): move by
  // however far from the window's origin the layer landed.
  const landed = element.getBoundingClientRect();
  if (Math.abs(landed.left - box.left) > 0.5 || Math.abs(landed.top - box.top) > 0.5) {
    element.style.left = `${2 * box.left - landed.left}px`;
    element.style.top = `${2 * box.top - landed.top}px`;
  }
}

/**
 * Show `layer` in the top layer over the part of the viewer on screen, and keep it there as the
 * viewer or the window resizes or scrolls. `onPlace` hears which edges of the window the viewer
 * reaches, each time the layer is placed. Returns the stop, which hides the layer.
 */
export function attachViewerLayer(
  layer: HTMLElement,
  onPlace?: (edges: ScreenEdges) => void,
): () => void {
  const root = layer.parentElement?.closest(VIEWER_ROOT_SELECTOR) ?? null;
  if (typeof layer.showPopover === 'function') layer.showPopover();
  let placed = '';
  const place = () => {
    const view = windowSizeOf(layer);
    const rect = root?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      right: view.width,
      bottom: view.height,
    };
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const box = {
      left,
      top,
      width: Math.max(0, Math.min(view.width, rect.right) - left),
      height: Math.max(0, Math.min(view.height, rect.bottom) - top),
    };
    // Scrolling inside the layer reaches here too: only a move of the viewer changes anything.
    const key = `${box.left},${box.top},${box.width},${box.height},${view.width},${view.height}`;
    if (key === placed) return;
    placed = key;
    placeFixed(layer, box);
    onPlace?.(screenEdgesOf(rect, view));
  };
  place();
  const resizes = new ResizeObserver(place);
  if (root) resizes.observe(root);
  const stopGeometry = observeClientGeometry(place);
  return () => {
    stopGeometry();
    resizes.disconnect();
    if (typeof layer.hidePopover === 'function' && layer.matches(':popover-open')) {
      layer.hidePopover();
    }
  };
}

export interface HeldFocus {
  /** Stop holding focus, leaving it where it is. */
  standDown(): void;
  /** Stop holding focus, and give it back to what had it before when it's still in `container`. */
  release(): void;
}

/** Move focus into `container`: to its first control, else to the container itself. */
function focusInto(container: HTMLElement): void {
  const first = tabbablesIn(container)[0];
  if (first) {
    first.focus();
    return;
  }
  if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
  container.focus();
}

/**
 * Hold the keyboard in `container` until released: focus moves into it (to `initialFocus`, else
 * its first control), Tab and Shift+Tab stay inside it, and Escape calls `onEscape`. With
 * `trap: false` Tab moves on past it, as it does past anything else in the viewer. Releasing
 * gives focus back to what had it before, unless the user has moved it elsewhere.
 */
export function holdFocus(
  container: HTMLElement,
  options: {
    readonly onEscape: () => void;
    readonly initialFocus?: HTMLElement | null;
    readonly trap?: boolean;
  },
): HeldFocus {
  const doc = container.ownerDocument;
  const before = deepActiveElementOf(doc) as HTMLElement | null;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    // Escape closes this, not what it opened over.
    event.stopPropagation();
    options.onEscape();
  };
  container.addEventListener('keydown', onKeyDown);
  let releaseTrap: (() => void) | null = null;
  if (options.trap === false) {
    if (options.initialFocus) options.initialFocus.focus();
    else focusInto(container);
  } else {
    releaseTrap = attachFocusTrap(container, {
      initialFocus: options.initialFocus,
      returnFocus: false,
    });
  }
  const standDown = () => {
    releaseTrap?.();
    releaseTrap = null;
    container.removeEventListener('keydown', onKeyDown);
  };
  return {
    standDown,
    release: () => {
      standDown();
      const active = deepActiveElementOf(doc);
      if (before?.isConnected && (active === null || container.contains(active))) before.focus();
    },
  };
}
