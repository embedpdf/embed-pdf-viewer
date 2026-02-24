import type {
  SelectionMenuPropsBase,
  SelectionMenuRenderFn,
  SelectionMenuRenderResult,
} from '@embedpdf/utils/svelte';
import { useUICapability } from './use-ui.svelte';
import { useRenderers } from '../registries/renderers-registry.svelte';

/**
 * Hook for schema-driven selection menus
 */
export function useSelectionMenu<TContext extends { type: string }>(
  menuId: string | (() => string),
  getDocumentId: () => string,
) {
  const uiCapability = useUICapability();
  const renderers = useRenderers();

  // Normalize menuId to always be a function, then make it reactive
  const getMenuIdFn = typeof menuId === 'function' ? menuId : () => menuId;
  const menuIdValue = $derived(getMenuIdFn());
  const documentId = $derived(getDocumentId());
  const schema = $derived(uiCapability.provides?.getSchema());
  const menuSchema = $derived(schema?.selectionMenus?.[menuIdValue]);

  const renderFn = $derived.by<SelectionMenuRenderFn<TContext> | undefined>(() => {
    if (!menuSchema) return undefined;

    const currentMenuSchema = menuSchema;
    const currentDocumentId = documentId;
    const SelectionMenuRenderer = renderers.selectionMenu;

    return (props: SelectionMenuPropsBase<TContext>): SelectionMenuRenderResult | null => {
      if (!props.selected) return null;

      return {
        component: SelectionMenuRenderer,
        props: {
          schema: currentMenuSchema,
          documentId: currentDocumentId,
          props,
        },
      };
    };
  });

  return {
    get renderFn() {
      return renderFn;
    },
  };
}
