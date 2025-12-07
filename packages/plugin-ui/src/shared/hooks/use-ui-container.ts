import { createContext, useContext, RefObject } from '@framework';

export interface UIContainerContextValue {
  /** Reference to the UIRoot container element */
  containerRef: RefObject<HTMLDivElement>;
  /** Get the container element (may be null if not mounted) */
  getContainer: () => HTMLDivElement | null;
}

export const UIContainerContext = createContext<UIContainerContextValue | null>(null);

/**
 * Hook to access the UI container element.
 *
 * This provides access to the UIRoot container for:
 * - Container query based responsiveness
 * - Portaling elements to the root
 * - Measuring container dimensions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { containerRef, getContainer } = useUIContainer();
 *
 *   // Use containerRef for ResizeObserver
 *   useEffect(() => {
 *     const container = getContainer();
 *     if (!container) return;
 *
 *     const observer = new ResizeObserver(() => {
 *       console.log('Container width:', container.clientWidth);
 *     });
 *     observer.observe(container);
 *     return () => observer.disconnect();
 *   }, [getContainer]);
 *
 *   // Or portal to the container
 *   return createPortal(<Modal />, getContainer()!);
 * }
 * ```
 */
export function useUIContainer(): UIContainerContextValue {
  const context = useContext(UIContainerContext);
  if (!context) {
    throw new Error('useUIContainer must be used within a UIProvider');
  }
  return context;
}
