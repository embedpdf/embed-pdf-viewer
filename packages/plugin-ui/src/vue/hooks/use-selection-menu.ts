import { computed, h, toValue, type VNode, type MaybeRefOrGetter } from 'vue';
import type { SelectionMenuPropsBase, SelectionMenuRenderFn } from '@embedpdf/utils/vue';
import { useUICapability } from './use-ui';
import { useRenderers } from '../registries/renderers-registry';

/**
 * Creates a render function for a selection menu from the schema
 *
 * @param menuId - The selection menu ID from schema
 * @param documentId - Document ID (can be ref, computed, getter, or plain value)
 * @returns A computed ref containing the render function or undefined
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const annotationMenu = useSelectionMenu('annotation', () => props.documentId);
 * </script>
 *
 * <template>
 *   <AnnotationLayer
 *     :documentId="documentId"
 *     :selectionMenu="annotationMenu"
 *   />
 * </template>
 * ```
 */
export function useSelectionMenu<TContext extends { type: string } = { type: string }>(
  menuId: MaybeRefOrGetter<string>,
  documentId: MaybeRefOrGetter<string>,
) {
  const { provides } = useUICapability();
  const renderers = useRenderers();

  const schema = computed(() => provides.value?.getSchema());
  const menuSchema = computed(() => schema.value?.selectionMenus?.[toValue(menuId)]);

  // Return a computed that produces the render function (or undefined)
  const renderFn = computed<SelectionMenuRenderFn<TContext> | undefined>(() => {
    // If no schema for this menu, return undefined
    if (!menuSchema.value) {
      return undefined;
    }

    // Capture current values for the closure
    const currentMenuSchema = menuSchema.value;
    const currentDocumentId = toValue(documentId);
    const SelectionMenuRenderer = renderers.selectionMenu;

    // Return the render function
    return (props: SelectionMenuPropsBase<TContext>): VNode | null => {
      if (!props.selected) {
        return null;
      }

      return h(SelectionMenuRenderer, {
        schema: currentMenuSchema,
        documentId: currentDocumentId,
        props,
      });
    };
  });

  return renderFn;
}
