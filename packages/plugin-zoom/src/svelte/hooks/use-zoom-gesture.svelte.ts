import { getContext } from 'svelte';
import { useCapability } from '@embedpdf/core/svelte';
import type { ViewportPlugin } from '@embedpdf/plugin-viewport';
import { setupZoomGestures, type ZoomGestureOptions } from '../../shared/utils/zoom-gesture-logic';
import { useZoomCapability } from './use-zoom.svelte';

export type { ZoomGestureOptions };

/** Context type for viewport element */
type ViewportElementContext = { readonly current: HTMLDivElement | null };

export interface UseZoomGestureOptions {
  /** Enable pinch-to-zoom gesture (default: true) */
  enablePinch?: () => boolean;
  /** Enable wheel zoom with ctrl/cmd key (default: true) */
  enableWheel?: () => boolean;
}

/**
 * Hook for setting up zoom gesture functionality (pinch and wheel zoom) on an element
 * @param getDocumentId Function that returns the document ID
 * @param options Optional configuration for enabling/disabling gestures
 */
export function useZoomGesture(
  getDocumentId: () => string | null,
  options: UseZoomGestureOptions = {},
) {
  const viewportCapability = useCapability<ViewportPlugin>('viewport');
  const zoomCapability = useZoomCapability();
  const viewportElementCtx = getContext<ViewportElementContext | undefined>('viewport-element');

  let elementRef = $state<HTMLDivElement | null>(null);
  let cleanup: (() => void) | undefined;

  // Reactive documentId and options
  const documentId = $derived(getDocumentId());
  const enablePinch = $derived(options.enablePinch?.() ?? true);
  const enableWheel = $derived(options.enableWheel?.() ?? true);

  $effect(() => {
    const element = elementRef;
    const container = viewportElementCtx?.current;
    const viewport = viewportCapability.provides;
    const zoom = zoomCapability.provides;
    const docId = documentId;
    const pinchEnabled = enablePinch;
    const wheelEnabled = enableWheel;

    // Clean up previous setup
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }

    // Setup new zoom gestures if all dependencies are available
    if (!element || !container || !zoom || !docId) {
      return;
    }

    cleanup = setupZoomGestures({
      element,
      container,
      documentId: docId,
      zoomProvides: zoom,
      viewportGap: viewport?.getViewportGap() || 0,
      options: { enablePinch: pinchEnabled, enableWheel: wheelEnabled },
    });

    return () => {
      if (cleanup) {
        cleanup();
        cleanup = undefined;
      }
    };
  });

  return {
    get elementRef() {
      return elementRef;
    },
    set elementRef(value: HTMLDivElement | null) {
      elementRef = value;
    },
  };
}
