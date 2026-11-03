/**
 * What the layout does by itself, as hooks: a floating bar that rests out of
 * sight while nothing moves (`idle-hiding.ts`), like the page number, and comes
 * back when the pages or the pointer move, or you reach it from the keyboard;
 * and the edges of the screen the viewer reaches, so it keeps clear of the
 * notch and the home bar there (`screen-edges.ts`).
 */
import { useOptionalCapability } from '@embedpdf/react/runtime';
import { StageToken } from '@embedpdf/react/stage';
import { deepActiveElementOf, observeClientGeometry } from '@embedpdf/web';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import { IDLE_MS } from './idle-hiding';
import {
  NO_SCREEN_EDGES,
  sameScreenEdges,
  screenEdgesOf,
  windowSizeOf,
  type ScreenEdges,
} from './screen-edges';

/**
 * Whether the bar `bar` points at is hidden now: while `enabled`, once the main pages and the
 * pointer over them have been still for {@link IDLE_MS}. It shows when it's enabled, and again
 * when the pages move, a pointer moves or presses over them, or focus comes into the bar. It
 * stays while the pointer is on it, while you're using it from the keyboard or typing in it, and
 * while a menu from it is open.
 */
export function useHiddenWhenIdle(enabled: boolean, bar: RefObject<HTMLElement | null>): boolean {
  const stage = useOptionalCapability(StageToken);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const element = bar.current;
    if (!enabled || !element) return undefined;
    let pointerOn = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Focus the keyboard put there, or in a field (both `:focus-visible`), holds the bar; a
    // button that kept focus after a click doesn't.
    const held = () => {
      const active = deepActiveElementOf(element.ownerDocument);
      return (
        pointerOn ||
        (active !== null && element.contains(active) && active.matches(':focus-visible')) ||
        element.querySelector('[aria-expanded="true"]') !== null
      );
    };
    const wake = () => {
      setHidden(false);
      clearTimeout(timer);
      timer = setTimeout(rest, IDLE_MS);
    };
    function rest() {
      if (held()) wake();
      else setHidden(true);
    }
    const enter = () => {
      pointerOn = true;
      wake();
    };
    const leave = () => {
      pointerOn = false;
      wake();
    };
    // The box the floating bars are placed in is the pages' own: a pointer anywhere over them
    // wakes the bar, before anything on the pages can keep the event to itself.
    const pages = element.closest<HTMLElement>('[data-float]')?.offsetParent ?? null;
    const capture = { capture: true, passive: true } as const;
    pages?.addEventListener('pointermove', wake, capture);
    pages?.addEventListener('pointerdown', wake, capture);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', wake);
    const stop = stage?.onCameraChanged(wake);
    wake();
    return () => {
      stop?.();
      pages?.removeEventListener('pointermove', wake, capture);
      pages?.removeEventListener('pointerdown', wake, capture);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', wake);
      clearTimeout(timer);
      setHidden(false);
    };
  }, [enabled, stage, bar]);
  return hidden;
}

/**
 * The edges of the window the element `element` points at reaches: measured before the first
 * paint, and again when it resizes or the window resizes or scrolls.
 */
export function useScreenEdges(element: RefObject<HTMLElement | null>): ScreenEdges {
  const [edges, setEdges] = useState(NO_SCREEN_EDGES);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return undefined;
    const measure = () => {
      const next = screenEdgesOf(target.getBoundingClientRect(), windowSizeOf(target));
      setEdges((previous) => (sameScreenEdges(previous, next) ? previous : next));
    };
    measure();
    const resizes = new ResizeObserver(measure);
    resizes.observe(target);
    const stopGeometry = observeClientGeometry(measure);
    return () => {
      stopGeometry();
      resizes.disconnect();
    };
  }, [element]);
  return edges;
}
