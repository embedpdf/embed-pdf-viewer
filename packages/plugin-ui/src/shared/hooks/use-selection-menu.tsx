import { useCallback } from '@framework';
import { SelectionMenuPropsBase, SelectionMenuRenderFn } from '@embedpdf/utils/@framework';
import { useUICapability } from './use-ui';
import { useRenderers } from '../registries/renderers-registry';

/**
 * Creates a render function for a selection menu from the schema
 *
 * @param menuId - The selection menu ID from schema
 * @param documentId - Document ID
 * @returns A render function compatible with layer selectionMenu props
 */
export function useSelectionMenu<TContext extends { type: string }>(
  menuId: string,
  documentId: string,
): SelectionMenuRenderFn<TContext> | undefined {
  const { provides } = useUICapability();
  const renderers = useRenderers();

  const renderFn = useCallback(
    (props: SelectionMenuPropsBase<TContext>) => {
      const schema = provides?.getSchema();
      const menuSchema = schema?.selectionMenus?.[menuId];

      if (!menuSchema) {
        return null;
      }

      if (!props.selected) {
        return null;
      }

      const SelectionMenuRenderer = renderers.selectionMenu;

      return <SelectionMenuRenderer schema={menuSchema} documentId={documentId} props={props} />;
    },
    [provides, renderers, menuId, documentId],
  );

  // Return undefined if schema doesn't have this menu
  const schema = provides?.getSchema();
  if (!schema?.selectionMenus?.[menuId]) {
    return undefined;
  }

  return renderFn;
}
