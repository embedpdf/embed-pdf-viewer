import { useState, useEffect } from '@framework';
import { useUIState, useUICapability } from './hooks/use-ui';
import { useAnchorRegistry } from './registries/anchor-registry';
import { useRenderers } from './registries/renderers-registry';

/**
 * Automatically renders menus when opened
 *
 * This component:
 * 1. Listens to UI plugin state for open menus
 * 2. Looks up anchor elements from the anchor registry
 * 3. Renders menus using the user-provided menu renderer
 */
export interface AutoMenuRendererProps {
  container?: HTMLElement | null;
  documentId: string; // Which document's menus to render
}

export function AutoMenuRenderer({ container, documentId }: AutoMenuRendererProps) {
  const uiState = useUIState(documentId);
  const { provides } = useUICapability();
  const anchorRegistry = useAnchorRegistry();
  const renderers = useRenderers();

  const [activeMenu, setActiveMenu] = useState<{
    menuId: string;
    anchorEl: HTMLElement | null;
  } | null>(null);

  const openMenus = uiState?.openMenus || {};
  const schema = provides?.getSchema();

  // Update active menu when state changes
  useEffect(() => {
    const openMenuIds = Object.keys(openMenus);

    if (openMenuIds.length > 0) {
      // Show the first open menu (in practice, should only be one)
      const menuId = openMenuIds[0];
      if (!menuId) {
        setActiveMenu(null);
        return;
      }

      const menuState = openMenus[menuId];
      if (menuState && menuState.triggeredByItemId) {
        // Look up anchor with documentId scope
        const anchor = anchorRegistry.getAnchor(documentId, menuState.triggeredByItemId);
        setActiveMenu({ menuId, anchorEl: anchor });
      } else {
        setActiveMenu(null);
      }
    } else {
      setActiveMenu(null);
    }
  }, [openMenus, anchorRegistry, documentId]);

  const handleClose = () => {
    if (activeMenu) {
      provides?.forDocument(documentId).closeMenu(activeMenu.menuId);
    }
  };

  if (!activeMenu || !schema) {
    return null;
  }

  const menuSchema = schema.menus[activeMenu.menuId];
  if (!menuSchema) {
    console.warn(`Menu "${activeMenu.menuId}" not found in schema`);
    return null;
  }

  // Use the user-provided menu renderer
  const MenuRenderer = renderers.menu;

  return (
    <MenuRenderer
      schema={menuSchema}
      documentId={documentId}
      anchorEl={activeMenu.anchorEl}
      onClose={handleClose}
      container={container}
    />
  );
}
