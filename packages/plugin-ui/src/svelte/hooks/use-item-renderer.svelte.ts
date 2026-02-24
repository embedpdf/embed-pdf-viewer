import { useComponentRegistry } from '../registries/component-registry.svelte';

/**
 * Helper utilities for building renderers
 */
export function useItemRenderer() {
  const componentRegistry = useComponentRegistry();

  return {
    /**
     * Get a custom component by ID
     *
     * @param componentId - Component ID from schema
     * @returns Component constructor or undefined if not found
     *
     * @example
     * ```svelte
     * <script lang="ts">
     *   const { getCustomComponent } = useItemRenderer();
     *   const MyComponent = getCustomComponent('my-component-id');
     * </script>
     *
     * {#if MyComponent}
     *   <MyComponent {documentId} {...props} />
     * {/if}
     * ```
     */
    getCustomComponent: (componentId: string) => {
      const Component = componentRegistry.get(componentId);

      if (!Component) {
        console.error(`Component "${componentId}" not found in registry`);
        return undefined;
      }

      return Component;
    },
  };
}
