import { Rect } from '@embedpdf/models';
import { useLayoutEffect, useRef } from '@framework';
import { useViewportPlugin } from './use-viewport';

export function useViewportRef(documentId: string) {
  const { plugin: viewportPlugin } = useViewportPlugin();
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!viewportPlugin) return;

    const container = containerRef.current;
    if (!container) return;

    // Register this viewport for the document
    try {
      viewportPlugin.registerViewport(documentId);
    } catch (error) {
      console.error(`Failed to register viewport for document ${documentId}:`, error);
      return;
    }

    // On scroll
    const onScroll = () => {
      viewportPlugin.setViewportScrollMetrics(documentId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      });
    };
    container.addEventListener('scroll', onScroll);

    // Helper to update viewport metrics
    const updateMetrics = () => {
      viewportPlugin.setViewportResizeMetrics(documentId, {
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
    };

    // Set initial metrics
    updateMetrics();

    // On resize - use requestAnimationFrame to defer updates to next frame
    // This prevents "ResizeObserver loop completed with undelivered notifications" errors
    // that occur when ResizeObserver callbacks trigger layout changes synchronously
    /*
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        updateMetrics();
      });
    });
    resizeObserver.observe(container);
    */

    // Subscribe to scroll requests for this document
    const unsubscribeScrollRequest = viewportPlugin.onScrollRequest(
      documentId,
      ({ x, y, behavior = 'auto' }) => {
        requestAnimationFrame(() => {
          container.scrollTo({ left: x, top: y, behavior });
        });
      },
    );

    // Cleanup
    return () => {
      viewportPlugin.unregisterViewport(documentId);
      //resizeObserver.disconnect();
      container.removeEventListener('scroll', onScroll);
      unsubscribeScrollRequest();
    };
  }, [viewportPlugin, documentId]);

  return containerRef;
}
