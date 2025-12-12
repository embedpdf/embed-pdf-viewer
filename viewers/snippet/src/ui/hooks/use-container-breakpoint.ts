import { useState, useEffect } from 'preact/hooks';

/**
 * Hook to detect if container width is below a breakpoint
 * Uses synchronous initial measurement to prevent flicker
 *
 * @param getContainer - Function to get the container element
 * @param breakpoint - Width breakpoint in pixels (default: 768)
 * @returns Whether the container is below the breakpoint (mobile)
 */
export function useContainerBreakpoint(
  getContainer: () => HTMLElement | null,
  breakpoint: number = 768,
): boolean {
  // Synchronous initial measurement to prevent flicker
  const getInitialValue = (): boolean => {
    const container = getContainer();
    if (!container) return false; // Default to desktop if container not ready
    return container.clientWidth < breakpoint;
  };

  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState<boolean>(getInitialValue);

  // Watch for container size changes
  useEffect(() => {
    const container = getContainer();
    if (!container) return;

    const checkSize = () => {
      setIsBelowBreakpoint(container.clientWidth < breakpoint);
    };

    const observer = new ResizeObserver(checkSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [getContainer, breakpoint]);

  return isBelowBreakpoint;
}
