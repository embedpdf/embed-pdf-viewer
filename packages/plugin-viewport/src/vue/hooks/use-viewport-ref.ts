import { Rect } from '@embedpdf/models';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useViewportPlugin } from './use-viewport';

export function useViewportRef(documentId: string) {
  const { plugin: pluginRef } = useViewportPlugin();
  const containerRef = ref<HTMLDivElement | null>(null);

  // Setup function that runs when both plugin and container are available
  const setupViewport = () => {
    const viewportPlugin = pluginRef.value;
    const container = containerRef.value;

    if (!container || !viewportPlugin) return;

    // Register this viewport for the document
    try {
      viewportPlugin.registerViewport(documentId);
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
    viewportPlugin.registerBoundingRectProvider(documentId, provideRect);

    // Get saved viewport state and restore scroll position
    const savedMetrics = viewportPlugin.provides().forDocument(documentId).getMetrics();
    if (savedMetrics && (savedMetrics.scrollTop > 0 || savedMetrics.scrollLeft > 0)) {
      // Restore scroll position on next frame
      requestAnimationFrame(() => {
        container.scrollTop = savedMetrics.scrollTop;
        container.scrollLeft = savedMetrics.scrollLeft;
      });
    }

    // On scroll
    const onScroll = () => {
      viewportPlugin.setViewportScrollMetrics(documentId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      });
    };
    container.addEventListener('scroll', onScroll);

    // On resize
    const resizeObserver = new ResizeObserver(() => {
      viewportPlugin.setViewportResizeMetrics(documentId, {
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
    const unsubscribeScrollRequest = viewportPlugin.onScrollRequest(
      documentId,
      ({ x, y, behavior = 'auto' }) => {
        requestAnimationFrame(() => {
          container.scrollTo({ left: x, top: y, behavior });
        });
      },
    );

    // Return cleanup function
    return () => {
      viewportPlugin.unregisterViewport(documentId);
      viewportPlugin.registerBoundingRectProvider(documentId, null);
      container.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      unsubscribeScrollRequest();
    };
  };

  let cleanup: (() => void) | null = null;

  // Watch for changes in the plugin
  watch(
    pluginRef,
    () => {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      cleanup = setupViewport() || null;
    },
    { immediate: true },
  );

  // Watch for container changes
  watch(
    containerRef,
    () => {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      cleanup = setupViewport() || null;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (cleanup) {
      cleanup();
    }
  });

  return containerRef;
}
