import { getContext, setContext } from 'svelte';

export interface UIContainerContextValue {
  /** Get the container element (may be null if not mounted) */
  getContainer: () => HTMLDivElement | null;
}

const UI_CONTAINER_KEY = Symbol('ui-container');

/**
 * Set up the container context (called by UIRoot)
 */
export function setUIContainerContext(value: UIContainerContextValue): void {
  setContext(UI_CONTAINER_KEY, value);
}

/**
 * Hook to access the UI container element.
 *
 * This provides access to the UIRoot container for:
 * - Container query based responsiveness
 * - Portaling elements to the root
 * - Measuring container dimensions
 *
 * @example
 * ```svelte
 * <script>
 *   import { useUIContainer } from '@embedpdf/plugin-ui/svelte';
 *   import { onMount, onDestroy } from 'svelte';
 *
 *   const { getContainer } = useUIContainer();
 *
 *   let observer;
 *
 *   onMount(() => {
 *     const container = getContainer();
 *     if (!container) return;
 *
 *     observer = new ResizeObserver(() => {
 *       console.log('Container width:', container.clientWidth);
 *     });
 *     observer.observe(container);
 *   });
 *
 *   onDestroy(() => observer?.disconnect());
 * </script>
 * ```
 */
export function useUIContainer(): UIContainerContextValue {
  const context = getContext<UIContainerContextValue>(UI_CONTAINER_KEY);
  if (!context) {
    throw new Error('useUIContainer must be used within a UIProvider');
  }
  return context;
}
