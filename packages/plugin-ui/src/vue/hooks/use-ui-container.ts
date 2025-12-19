import { inject, type Ref, type InjectionKey } from 'vue';

export interface UIContainerContextValue {
  /** Reference to the UIRoot container element */
  containerRef: Ref<HTMLDivElement | null>;
  /** Get the container element (may be null if not mounted) */
  getContainer: () => HTMLDivElement | null;
}

export const UI_CONTAINER_KEY: InjectionKey<UIContainerContextValue> = Symbol('ui-container');

/**
 * Hook to access the UI container element.
 *
 * This provides access to the UIRoot container for:
 * - Container query based responsiveness
 * - Portaling elements to the root
 * - Measuring container dimensions
 *
 * @example
 * ```vue
 * <script setup>
 * import { useUIContainer } from '@embedpdf/plugin-ui/vue';
 * import { onMounted, onUnmounted } from 'vue';
 *
 * const { containerRef, getContainer } = useUIContainer();
 *
 * onMounted(() => {
 *   const container = getContainer();
 *   if (!container) return;
 *
 *   const observer = new ResizeObserver(() => {
 *     console.log('Container width:', container.clientWidth);
 *   });
 *   observer.observe(container);
 *
 *   onUnmounted(() => observer.disconnect());
 * });
 * </script>
 * ```
 */
export function useUIContainer(): UIContainerContextValue {
  const context = inject(UI_CONTAINER_KEY);
  if (!context) {
    throw new Error('useUIContainer must be used within a UIProvider');
  }
  return context;
}
