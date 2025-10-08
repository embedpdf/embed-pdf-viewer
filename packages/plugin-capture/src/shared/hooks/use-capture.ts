import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { CapturePlugin } from '@embedpdf/plugin-capture';
import { useState, useEffect } from '@framework';

export const useCaptureCapability = () => useCapability<CapturePlugin>(CapturePlugin.id);
export const useCapturePlugin = () => usePlugin<CapturePlugin>(CapturePlugin.id);

export const useCapture = () => {
  const { provides } = useCaptureCapability();
  const [isMarqueeCaptureActive, setIsMarqueeCaptureActive] = useState(false);

  useEffect(() => {
    if (!provides) return;
    return provides.onMarqueeCaptureActiveChange((isMarqueeCaptureActive) => {
      setIsMarqueeCaptureActive(isMarqueeCaptureActive);
    });
  }, [provides]);

  return {
    provides,
    isMarqueeCaptureActive,
  };
};
