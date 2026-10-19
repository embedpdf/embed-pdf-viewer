/**
 * What a phone's layout does by itself, as hooks: a bar that gets out of the
 * way while the pages scroll (`scroll-hiding.ts`), unless something in it has
 * focus, like the page number being typed; and the edges of the screen the
 * viewer reaches, so it keeps clear of the notch and the home bar there
 * (`screen-edges.ts`).
 */
import { useOptionalCapability } from '@embedpdf/react/runtime';
import { StageToken } from '@embedpdf/react/stage';
import { deepActiveElementOf, observeClientGeometry } from '@embedpdf/web';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import {
  NO_SCREEN_EDGES,
  sameScreenEdges,
  screenEdgesOf,
  windowSizeOf,
  type ScreenEdges,
} from './screen-edges';
import { SCROLL_SETTLE_MS, isScrollOf, type ScrollCamera } from './scroll-hiding';

/**
 * Whether the bar `bar` points at is hidden now: while `enabled`, from the first scroll of the
 * main pages until they have been still for {@link SCROLL_SETTLE_MS}.
 */
export function useHiddenWhileScrolling(
  enabled: boolean,
  bar: RefObject<HTMLElement | null>,
): boolean {
  const stage = useOptionalCapability(StageToken);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled || !stage) return undefined;
    let previous: ScrollCamera = stage.getCamera();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = stage.onCameraChanged(({ camera }) => {
      const scrolled = isScrollOf(previous, camera);
      previous = camera;
      const element = bar.current;
      if (!scrolled || !element) return;
      const active = deepActiveElementOf(element.ownerDocument);
      if (active && element.contains(active)) return;
      setHidden(true);
      clearTimeout(timer);
      timer = setTimeout(() => setHidden(false), SCROLL_SETTLE_MS);
    });
    return () => {
      stop();
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
