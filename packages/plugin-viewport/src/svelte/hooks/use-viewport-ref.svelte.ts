import { type Rect } from '@embedpdf/models';
import { useViewportPlugin } from './use-viewport.svelte';

export function useViewportRef() {
  const { plugin } = useViewportPlugin();
  let containerRef = $state<HTMLDivElement | null>(null);

  $effect.pre(() => {
    if (!plugin) return;

    const container = containerRef;
    if (!container) return;

    /* ---------- live rect provider --------------------------------- */
    const provideRect = (): Rect => {
      const r = container.getBoundingClientRect();
      return {
        origin: { x: r.left, y: r.top },
        size: { width: r.width, height: r.height },
      };
    };
    plugin.registerBoundingRectProvider(provideRect);

    // Example: On scroll, call setMetrics
    const onScroll = () => {
      plugin?.setViewportScrollMetrics({
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      });
    };
    container.addEventListener('scroll', onScroll);

    // Example: On resize, call setMetrics
    const resizeObserver = new ResizeObserver(() => {
      plugin?.setViewportResizeMetrics({
        width: container.offsetWidth,
        height: container.offsetHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
        scrollWidth: container.scrollWidth,
        scrollHeight: container.scrollHeight,
      });
    });
    resizeObserver.observe(container);

    const unsubscribeScrollRequest = plugin.onScrollRequest(({ x, y, behavior = 'auto' }) => {
      requestAnimationFrame(() => {
        container.scrollTo({ left: x, top: y, behavior });
      });
    });

    // Cleanup
    return () => {
      plugin?.registerBoundingRectProvider(null);
      container.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      unsubscribeScrollRequest();
    };
  });

  // Return the ref so your Svelte code can attach it to a div
  return {
    get containerRef() {
      return containerRef;
    },
    set containerRef(el: HTMLDivElement | null) {
      containerRef = el;
    },
  };
}
