import { useEffect, useState } from '@framework';
import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { ScrollActivity, ViewportPlugin } from '@embedpdf/plugin-viewport';

export const useViewportPlugin = () => usePlugin<ViewportPlugin>(ViewportPlugin.id);
export const useViewportCapability = () => useCapability<ViewportPlugin>(ViewportPlugin.id);

export const useViewportScrollActivity = () => {
  const { provides } = useViewportCapability();
  const [scrollActivity, setScrollActivity] = useState<ScrollActivity>({
    isScrolling: false,
    isSmoothScrolling: false,
  });

  useEffect(() => {
    if (!provides) return;

    return provides.onScrollActivity(setScrollActivity);
  }, [provides]);

  return scrollActivity;
};
