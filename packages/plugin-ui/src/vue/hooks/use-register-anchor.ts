import { onBeforeUnmount, ref, watch, toValue, type MaybeRefOrGetter } from 'vue';
import { useAnchorRegistry } from '../registries/anchor-registry';

/**
 * Register a DOM element as an anchor for menus
 *
 * @param documentId - Document ID (can be ref, computed, getter, or plain value)
 * @param itemId - Item ID (can be ref, computed, getter, or plain value)
 * @returns Ref callback to attach to the element (use with :ref="anchorRef")
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const anchorRef = useRegisterAnchor(() => props.documentId, () => props.itemId);
 * </script>
 *
 * <template>
 *   <button :ref="anchorRef">Zoom</button>
 * </template>
 * ```
 */
export function useRegisterAnchor(
  documentId: MaybeRefOrGetter<string>,
  itemId: MaybeRefOrGetter<string>,
) {
  const registry = useAnchorRegistry();
  const elementRef = ref<HTMLElement | null>(null);

  // Re-register when documentId or itemId change
  watch(
    [() => toValue(documentId), () => toValue(itemId)],
    ([newDocId, newItemId], [oldDocId, oldItemId]) => {
      // Unregister under old key if values changed
      if (oldDocId && oldItemId && (oldDocId !== newDocId || oldItemId !== newItemId)) {
        registry.unregister(oldDocId, oldItemId);
      }

      // Register under new key if element exists
      if (elementRef.value && newDocId && newItemId) {
        registry.register(newDocId, newItemId, elementRef.value);
      }
    },
  );

  // Function to set ref
  const setRef = (el: any) => {
    // Handle Vue 3 ref binding (component refs have $el)
    const element = el?.$el || el;

    const docId = toValue(documentId);
    const item = toValue(itemId);

    // Unregister previous element if exists
    if (elementRef.value && elementRef.value !== element) {
      registry.unregister(docId, item);
    }

    elementRef.value = element;

    // Register new element
    if (element) {
      registry.register(docId, item, element);
    }
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    if (elementRef.value) {
      registry.unregister(toValue(documentId), toValue(itemId));
    }
  });

  return setRef;
}
