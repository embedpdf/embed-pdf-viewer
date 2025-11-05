import { useEffect, useRef, HTMLAttributes, CSSProperties, ReactNode } from '@framework';

import { useFullscreenPlugin, useFullscreenCapability } from '../hooks';

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
      if (event.action === 'enter') {
        // Check if a target element selector is configured
        const targetSelector = fullscreenPlugin.getTargetSelector();
        let elementToFullscreen: HTMLElement | null = null;

        if (targetSelector && ref.current) {
          // Try to find the element within the wrapper element
          elementToFullscreen = ref.current.querySelector(targetSelector);
          if (!elementToFullscreen) {
            console.warn(
              `Fullscreen: Could not find element with selector "${targetSelector}" within the wrapper. Falling back to wrapper element.`,
            );
          }
        }

        // Fall back to the wrapper element if no selector or element not found
        if (!elementToFullscreen) {
          elementToFullscreen = ref.current;
        }

        if (elementToFullscreen && !document.fullscreenElement) {
          await elementToFullscreen.requestFullscreen();
        }
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
      }
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
