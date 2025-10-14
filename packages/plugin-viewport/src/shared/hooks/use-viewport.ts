import { useEffect, useState } from '@framework';
import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

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
