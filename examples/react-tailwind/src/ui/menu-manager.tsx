import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useUIState, useUICapability } from '@embedpdf/plugin-ui/react';
import { SchemaMenu } from './schema-menu';
import { useAnchorRegistry } from './anchor-registry';

/**
 * Menu Manager
 *
 * Manages menu state by reading from the UI plugin state and rendering menus
 * anchored to their triggering elements via the anchor registry.
 *
 * This provides a clean separation: commands update state, UI reacts to state.
 */

interface MenuManagerContextValue {
  // Can be extended with additional methods if needed
}

const MenuManagerContext = createContext<MenuManagerContextValue | null>(null);

export function MenuManagerProvider({
  children,
  documentId,
}: {
  children: ReactNode;
  documentId: string;
}) {
  const uiState = useUIState(documentId);
  const { provides: uiCapability } = useUICapability();
  const anchorRegistry = useAnchorRegistry();
  const [activeMenu, setActiveMenu] = useState<{
    menuId: string;
    anchorEl: HTMLElement | null;
  } | null>(null);

  const openMenus = uiState?.openMenus || {};
  const schema = uiCapability?.getSchema();

  // Update active menu and anchor element when menus change
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
      if (menuState) {
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
      uiCapability?.forDocument(documentId)?.closeMenu(activeMenu.menuId);
    }
  };

  const contextValue: MenuManagerContextValue = {};

  // Get the menu schema if there's an active menu
  const menuSchema = activeMenu && schema ? schema.menus[activeMenu.menuId] : undefined;

  return (
    <MenuManagerContext.Provider value={contextValue}>
      {children}

      {/* Render active menu */}
      {activeMenu && menuSchema && (
        <SchemaMenu
          schema={menuSchema}
          documentId={documentId}
          anchorEl={activeMenu.anchorEl}
          onClose={handleClose}
          isOpen={true}
        />
      )}
    </MenuManagerContext.Provider>
  );
}

export function useMenuManager(): MenuManagerContextValue {
  const context = useContext(MenuManagerContext);
  if (!context) {
    throw new Error('useMenuManager must be used within MenuManagerProvider');
  }
  return context;
}
