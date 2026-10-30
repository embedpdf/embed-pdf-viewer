/**
 * The viewer filling the screen: its own box, never the page around it. Where the page may use
 * the browser's full screen (`document.fullscreenEnabled`; a frame needs `allow="fullscreen"`),
 * the box goes full screen. A page of its own without it (iPhone Safari has full screen only for
 * video) gets the box over its whole window instead. A frame that may not go full screen has no
 * way: the frame is all a page inside it may cover. Either way the box goes into the browser's
 * top layer and stays where the page put it, so no transform, stacking context or overflow around
 * it holds it in, and nothing of the page's is moved or restyled.
 */
import { isFromTextField } from '@embedpdf/web';
import { useLayoutEffect, useState, type RefObject } from 'react';

import { VIEWER_ROOT_SELECTOR, isFullscreenElement } from './viewer-layer';

/** How the viewer fills the screen: the browser's full screen, or the whole window. */
export type FullscreenWay = 'screen' | 'window';

/** What a page lets the viewer use to fill the screen. */
export interface FullscreenSupport {
  /** The browser's full screen: the browser has it for any element, and the page may use it. */
  readonly screen: boolean;
  /** The page is a window of its own, not a frame in another page. */
  readonly topLevel: boolean;
  /** The browser has popovers, which put an element in the top layer. */
  readonly popover: boolean;
}

/** How the viewer fills the screen with `support`, or `null` when it can't. */
export function fullscreenWayOf(support: FullscreenSupport): FullscreenWay | null {
  if (support.screen) return 'screen';
  return support.topLevel && support.popover ? 'window' : null;
}

/** What the page holding `element` lets it use. */
export function fullscreenSupportOf(element: HTMLElement): FullscreenSupport {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  return {
    screen: doc.fullscreenEnabled === true && typeof element.requestFullscreen === 'function',
    // A frame of another origin answers this too: comparing windows is allowed across origins.
    topLevel: view !== null && view.top === view,
    popover: typeof element.showPopover === 'function',
  };
}

/**
 * The box that fills the screen for the chrome's root `root`: the `<embedpdf-viewer>` element's
 * root around it, else `root` itself, when the chrome is the page.
 */
export const fullscreenTargetOf = (root: HTMLElement): HTMLElement =>
  root.closest<HTMLElement>(VIEWER_ROOT_SELECTOR) ?? root;

/** Marks the box while it fills the window; styles.css lays it over the window. */
const FILLS_WINDOW_ATTRIBUTE = 'data-epdf-fills-window';

/**
 * How `target` fills the screen now, or `null`. The page making the `<embedpdf-viewer>` element
 * itself full screen counts: the viewer is then all there is on the screen.
 */
export function fullscreenOf(target: HTMLElement): FullscreenWay | null {
  if (target.hasAttribute(FILLS_WINDOW_ATTRIBUTE)) return 'window';
  const host = (target.getRootNode() as Partial<ShadowRoot>).host ?? null;
  return isFullscreenElement(target) || (host !== null && isFullscreenElement(host))
    ? 'screen'
    : null;
}

/**
 * Make `target` fill the screen: the browser's full screen when the page may use it, else the
 * window of a page of its own. A browser that refuses its full screen (a webview without it, a
 * call no press started) gets the window too. Call it from the press itself: browsers let a page
 * go full screen only then.
 */
export async function enterFullscreen(target: HTMLElement): Promise<void> {
  if (fullscreenOf(target) !== null) return;
  const support = fullscreenSupportOf(target);
  if (support.screen) {
    try {
      await target.requestFullscreen({ navigationUI: 'hide' });
      return;
    } catch {
      // Refused: the window, where there is one of its own to fill.
    }
  }
  if (support.topLevel && support.popover) fillWindow(target);
}

/**
 * End `target` filling the screen, either way. The browser's full screen it went into from an
 * element around it, the page's own, stays.
 */
export async function exitFullscreen(target: HTMLElement): Promise<void> {
  const way = fullscreenOf(target);
  if (way === 'window') leaveWindow(target);
  else if (way === 'screen') await target.ownerDocument.exitFullscreen();
}

function fillWindow(target: HTMLElement): void {
  target.setAttribute(FILLS_WINDOW_ATTRIBUTE, '');
  target.setAttribute('popover', 'manual');
  target.showPopover();
}

function leaveWindow(target: HTMLElement): void {
  if (target.matches(':popover-open')) target.hidePopover();
  target.removeAttribute('popover');
  target.removeAttribute(FILLS_WINDOW_ATTRIBUTE);
}

/** The viewer's full screen, as the layout's root reads it. */
export interface FullscreenState {
  /** How the viewer would fill the screen here, or `null` when it can't. */
  readonly way: FullscreenWay | null;
  /** How it fills the screen now, or `null` when it doesn't. */
  readonly current: FullscreenWay | null;
}

const NO_FULLSCREEN: FullscreenState = { way: null, current: null };

/**
 * The full screen of the viewer whose chrome root `root` points at, read again whenever the
 * page's full screen changes or the box goes into or out of the top layer. Escape ends filling
 * the window, as it ends the browser's full screen, unless something in the viewer took the key
 * or it was typed in a field. The window ends with the viewer, which made it.
 */
export function useFullscreen(root: RefObject<HTMLElement | null>): FullscreenState {
  const [state, setState] = useState(NO_FULLSCREEN);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const target = fullscreenTargetOf(element);
    const way = fullscreenWayOf(fullscreenSupportOf(target));
    const read = () => {
      const current = fullscreenOf(target);
      setState((previous) =>
        previous.way === way && previous.current === current ? previous : { way, current },
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isFromTextField(event)) return;
      if (fullscreenOf(target) !== 'window') return;
      event.preventDefault();
      leaveWindow(target);
    };
    const doc = target.ownerDocument;
    read();
    doc.addEventListener('fullscreenchange', read);
    target.addEventListener('toggle', read);
    target.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('fullscreenchange', read);
      target.removeEventListener('toggle', read);
      target.removeEventListener('keydown', onKeyDown);
      if (fullscreenOf(target) === 'window') leaveWindow(target);
    };
  }, [root]);
  return state;
}
