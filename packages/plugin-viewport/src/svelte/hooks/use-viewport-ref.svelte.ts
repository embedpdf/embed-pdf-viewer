import { type Rect } from '@embedpdf/models';
import { useViewportPlugin } from './use-viewport.svelte';

/**
 * Hook to get a ref for the viewport container element with automatic setup/teardown
 * @param documentId Document ID
 */
export function useViewportRef(documentId: string) {
  const { plugin } = useViewportPlugin();

  let containerRef = $state<HTMLDivElement | null>(null);

  $effect.pre(() => {
    if (!plugin) return;

    const container = containerRef;
    if (!container) return;

    // Register this viewport for the document
    try {
      plugin.registerViewport(documentId);
    } catch (error) {
      console.error(`Failed to register viewport for document ${documentId}:`, error);
      return;
    }

    // Provide rect calculator
    const provideRect = (): Rect => {
      const r = container.getBoundingClientRect();
      return {
        origin: { x: r.left, y: r.top },
        size: { width: r.width, height: r.height },
      };
    };
    plugin.registerBoundingRectProvider(documentId, provideRect);

    // On scroll
    const onScroll = () => {
      plugin.setViewportScrollMetrics(documentId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      });
    };
    container.addEventListener('scroll', onScroll);

    // On resize
    const resizeObserver = new ResizeObserver(() => {
      plugin.setViewportResizeMetrics(documentId, {
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

    // Subscribe to scroll requests for this document
    const unsubscribeScrollRequest = plugin.onScrollRequest(
      documentId,
      ({ x, y, behavior = 'auto' }) => {
        requestAnimationFrame(() => {
          container.scrollTo({ left: x, top: y, behavior });
        });
      },
    );

    // Store cleanup function
    return () => {
      plugin.unregisterViewport(documentId);
      plugin.registerBoundingRectProvider(documentId, null);
      container.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      unsubscribeScrollRequest();
    };
  });

  return {
    get containerRef() {
      return containerRef;
    },
    set containerRef(el: HTMLDivElement | null) {
      containerRef = el;
    },
  };
}
