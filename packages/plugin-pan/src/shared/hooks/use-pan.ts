import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { PanPlugin } from '@embedpdf/plugin-pan';
import { useEffect, useState } from '@framework';

export const usePanPlugin = () => usePlugin<PanPlugin>(PanPlugin.id);
export const usePanCapability = () => useCapability<PanPlugin>(PanPlugin.id);

export const usePan = () => {
  const { provides } = usePanCapability();
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    if (!provides) return;
    return provides.onPanModeChange((isPanning) => {
      setIsPanning(isPanning);
    });
  }, [provides]);

  return {
    provides,
    isPanning,
  };
};
