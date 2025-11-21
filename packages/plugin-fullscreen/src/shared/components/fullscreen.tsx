import { useEffect, useRef, HTMLAttributes, CSSProperties, ReactNode } from '@framework';

import { useFullscreenPlugin, useFullscreenCapability } from '../hooks';
import { handleFullscreenRequest } from '../utils/fullscreen-utils';

type FullscreenProviderProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  children: ReactNode;
  style?: CSSProperties;
};

export function FullscreenProvider({ children, ...props }: FullscreenProviderProps) {
  const { provides: fullscreenCapability } = useFullscreenCapability();
  const { plugin: fullscreenPlugin } = useFullscreenPlugin();
  const { plugin } = useFullscreenPlugin();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fullscreenCapability || !fullscreenPlugin) return;

    const unsub = fullscreenCapability.onRequest(async (event) => {
      const targetSelector = fullscreenPlugin.getTargetSelector();
      await handleFullscreenRequest(event, ref.current, targetSelector);
    });

    return unsub;
  }, [fullscreenCapability, fullscreenPlugin]);

  useEffect(() => {
    if (!plugin) return;
    const handler = () => plugin.setFullscreenState(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [plugin]);

  return (
    <div
      {...props}
      style={{ position: 'relative', width: '100%', height: '100%', ...props.style }}
      ref={ref}
    >
      {children}
    </div>
  );
}
