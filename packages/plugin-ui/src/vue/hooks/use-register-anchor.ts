import { onBeforeUnmount, ref, watch } from 'vue';
import { useAnchorRegistry } from '../registries/anchor-registry';

/**
 * Register a DOM element as an anchor for menus
 *
 * @param documentId - Document ID
 * @param itemId - Item ID (typically matches the toolbar/menu item ID)
 * @returns Ref to attach to the element (use with :ref="anchorRef")
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const anchorRef = useRegisterAnchor(props.documentId, 'zoom-button');
 * </script>
 *
 * <template>
 *   <button :ref="anchorRef">Zoom</button>
 * </template>
 * ```
 */
export function useRegisterAnchor(documentId: string, itemId: string) {
  const registry = useAnchorRegistry();
  const elementRef = ref<HTMLElement | null>(null);

  // Function to set ref
  const setRef = (el: any) => {
    // Handle Vue 3 ref binding
    const element = el?.$el || el;

    // Unregister previous element if exists
    if (elementRef.value && elementRef.value !== element) {
      registry.unregister(documentId, itemId);
    }

    elementRef.value = element;

    // Register new element
    if (element) {
      registry.register(documentId, itemId, element);
    }
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    if (elementRef.value) {
      registry.unregister(documentId, itemId);
    }
  });

  return setRef;
}
