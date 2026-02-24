import { useEffect, useState, useContext, RefObject } from '@framework';
import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { GateChangeEvent, ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';
import { ViewportElementContext } from '../context';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

/**
 * Hook to get the viewport DOM element ref from context.
 * Must be used within a Viewport component.
 */
export const useViewportElement = (): RefObject<HTMLDivElement> | null => {
  return useContext(ViewportElementContext);
};

/**
 * Hook to get the gated state of the viewport for a specific document.
 * The viewport children are not rendered when gated.
 * @param documentId Document ID.
 */
export const useIsViewportGated = (documentId: string) => {
  const { provides } = useViewportCapability();
  const [isGated, setIsGated] = useState(provides?.isGated(documentId) ?? false);

  useEffect(() => {
    if (!provides) return;

    // Set initial state
    setIsGated(provides.isGated(documentId));

    // Subscribe to gate state changes
    return provides.onGateChange((event: GateChangeEvent) => {
      if (event.documentId === documentId) {
        setIsGated(event.isGated);
      }
    });
  }, [provides, documentId]);

  return isGated;
};

/**
 * Hook to get scroll activity for a specific document
 * @param documentId Document ID.
 */
export const useViewportScrollActivity = (documentId: string) => {
  const { provides } = useViewportCapability();
  const [scrollActivity, setScrollActivity] = useState<ScrollActivity>({
    isScrolling: false,
    isSmoothScrolling: false,
  });

  useEffect(() => {
    if (!provides) return;

    // Subscribe to scroll activity events
    return provides.onScrollActivity((event) => {
      // Filter by documentId if provided
      if (event.documentId === documentId) {
        setScrollActivity(event.activity);
      }
    });
  }, [provides, documentId]);

  return scrollActivity;
};
