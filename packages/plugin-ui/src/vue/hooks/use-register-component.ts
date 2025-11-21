import { onMounted, onBeforeUnmount, type Component } from 'vue';
import { useComponentRegistry } from '../registries/component-registry';
import type { BaseComponentProps } from '../types';

/**
 * Register a custom component for use in UI schema
 *
 * @param id - Component ID (referenced in schema)
 * @param component - Component to register
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ThumbnailPanel } from './components/ThumbnailPanel.vue';
 * import { BookmarkPanel } from './components/BookmarkPanel.vue';
 *
 * useRegisterComponent('thumbnail-panel', ThumbnailPanel);
 * useRegisterComponent('bookmark-panel', BookmarkPanel);
 * </script>
 * ```
 */
export function useRegisterComponent(id: string, component: Component<BaseComponentProps>): void {
  const registry = useComponentRegistry();

  onMounted(() => {
    registry.register(id, component);
  });

  onBeforeUnmount(() => {
    registry.unregister(id);
  });
}
