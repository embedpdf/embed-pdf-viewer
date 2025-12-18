import { type Rect } from '@embedpdf/models';
import { useViewportPlugin } from './use-viewport.svelte';

/**
 * Hook to get a ref for the viewport container element with automatic setup/teardown
 * @param getDocumentId Function that returns the document ID
 */
export function useViewportRef(getDocumentId: () => string | null) {
  const { plugin } = useViewportPlugin();

  let containerRef = $state<HTMLDivElement | null>(null);

  // Reactive documentId
  const documentId = $derived(getDocumentId());

  $effect.pre(() => {
    if (!plugin) return;

    const container = containerRef;
    const docId = documentId;
    if (!container || !docId) return;

    // Register this viewport for the document
    try {
      plugin.registerViewport(docId);
    } catch (error) {
      console.error(`Failed to register viewport for document ${docId}:`, error);
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
    plugin.registerBoundingRectProvider(docId, provideRect);

    // On scroll
    const onScroll = () => {
      plugin.setViewportScrollMetrics(docId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      });
    };
    container.addEventListener('scroll', onScroll);

    // On resize
    const resizeObserver = new ResizeObserver(() => {
      plugin.setViewportResizeMetrics(docId, {
        width: container.offsetWidth,
        height: container.offsetHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
        scrollWidth: container.scrollWidth,
        scrollHeight: container.scrollHeight,
        clientLeft: container.clientLeft,
        clientTop: container.clientTop,
      });
    });
    resizeObserver.observe(container);

    // Subscribe to scroll requests for this document
    const unsubscribeScrollRequest = plugin.onScrollRequest(
      docId,
      ({ x, y, behavior = 'auto' }) => {
        requestAnimationFrame(() => {
          container.scrollTo({ left: x, top: y, behavior });
        });
      },
    );

    // Store cleanup function
    return () => {
      plugin.unregisterViewport(docId);
      plugin.registerBoundingRectProvider(docId, null);
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
