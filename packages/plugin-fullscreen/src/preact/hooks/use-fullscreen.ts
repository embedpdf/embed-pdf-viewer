import { useCapability, usePlugin } from '@embedpdf/core/preact';
import { FullscreenPlugin, FullscreenState, initialState } from '@embedpdf/plugin-fullscreen';
import { useState, useEffect } from 'preact/hooks';

export const useFullscreenPlugin = () => usePlugin<FullscreenPlugin>(FullscreenPlugin.id);
export const useFullscreenCapability = () => useCapability<FullscreenPlugin>(FullscreenPlugin.id);

export const useFullscreen = () => {
  const { provides } = useFullscreenCapability();
  const [state, setState] = useState<FullscreenState>(initialState);

  useEffect(() => {
    return provides?.onStateChange((state) => {
      setState(state);
    });
  }, [provides]);

  return {
    provides,
    state,
  };
};
