import { Rect } from '@embedpdf/models';
import { onBeforeUnmount, ref, watch, toValue, type MaybeRefOrGetter } from 'vue';
import { useViewportPlugin } from './use-viewport';

/**
 * Hook to get a ref for the viewport container element with automatic setup/teardown
 * @param documentId Document ID (can be ref, computed, getter, or plain value).
 */
export function useViewportRef(documentId: MaybeRefOrGetter<string>) {
  const { plugin: pluginRef } = useViewportPlugin();
  const containerRef = ref<HTMLDivElement | null>(null);

  let cleanup: (() => void) | null = null;

  // Setup function that runs when both plugin and container are available
  const setupViewport = (docId: string) => {
    const viewportPlugin = pluginRef.value;
    const container = containerRef.value;

    if (!container || !viewportPlugin) return;

    // Register this viewport for the document
    try {
      viewportPlugin.registerViewport(docId);
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
    viewportPlugin.registerBoundingRectProvider(docId, provideRect);

    // On scroll
    const onScroll = () => {
      viewportPlugin.setViewportScrollMetrics(docId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
      });
    };
    container.addEventListener('scroll', onScroll);

    // On resize
    const resizeObserver = new ResizeObserver(() => {
      viewportPlugin.setViewportResizeMetrics(docId, {
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
      docId,
      ({ x, y, behavior = 'auto' }) => {
        requestAnimationFrame(() => {
          container.scrollTo({ left: x, top: y, behavior });
        });
      },
    );

    // Return cleanup function
    return () => {
      viewportPlugin.unregisterViewport(docId);
      viewportPlugin.registerBoundingRectProvider(docId, null);
      container.removeEventListener('scroll', onScroll);
      unsubscribeScrollRequest();
    };
  };

  // Watch for changes in plugin, container, or documentId
  watch(
    [pluginRef, containerRef, () => toValue(documentId)],
    ([, , docId]) => {
      // Clean up previous setup
      if (cleanup) {
        cleanup();
        cleanup = null;
      }

      // Setup new viewport
      cleanup = setupViewport(docId) || null;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  return containerRef;
}
