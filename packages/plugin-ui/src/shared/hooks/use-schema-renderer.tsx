import { useUICapability, useUIState } from './use-ui';
import { useRenderers } from '../registries/renderers-registry';

/**
 * High-level hook for rendering UI from schema
 *
 * Provides simple functions to render toolbars, sidebars, and modals.
 * Always passes isOpen state to renderers so they can control animations.
 *
 * Automatically subscribes to UI state changes for the given document.
 */
export function useSchemaRenderer(documentId: string) {
  const renderers = useRenderers();
  const { provides } = useUICapability();
  const schema = provides?.getSchema();
  const uiState = useUIState(documentId); // Subscribe to state changes

  return {
    /**
     * Render a toolbar by placement and slot
     *
     * Always renders with isOpen state when toolbar exists in slot.
     *
     * @param placement - 'top' | 'bottom' | 'left' | 'right'
     * @param slot - Slot name (e.g. 'main', 'secondary')
     *
     * @example
     * ```tsx
     * {renderToolbar('top', 'main')}
     * {renderToolbar('top', 'secondary')}
     * ```
     */
    renderToolbar: (placement: 'top' | 'bottom' | 'left' | 'right', slot: string) => {
      if (!schema || !provides || !uiState) return null;

      const slotKey = `${placement}-${slot}`;
      const toolbarSlot = uiState.activeToolbars[slotKey];

      // If no toolbar in this slot, nothing to render
      if (!toolbarSlot) return null;

      const toolbarSchema = schema.toolbars[toolbarSlot.toolbarId];
      if (!toolbarSchema) {
        console.warn(`Toolbar "${toolbarSlot.toolbarId}" not found in schema`);
        return null;
      }

      // Check if toolbar is closable
      const isClosable = !toolbarSchema.permanent;

      const handleClose = isClosable
        ? () => {
            provides.forDocument(documentId).closeToolbarSlot(placement, slot);
          }
        : undefined;

      const ToolbarRenderer = renderers.toolbar;

      // ALWAYS render, pass isOpen state
      return (
        <ToolbarRenderer
          key={toolbarSlot.toolbarId}
          schema={toolbarSchema}
          documentId={documentId}
          isOpen={toolbarSlot.isOpen}
          onClose={handleClose}
        />
      );
    },

    /**
     * Render a sidebar by placement and slot
     *
     * ALWAYS renders (when sidebar exists in slot) with isOpen state.
     * Your renderer controls whether to display or animate.
     *
     * @param placement - 'left' | 'right' | 'top' | 'bottom'
     * @param slot - Slot name (e.g. 'main', 'secondary', 'inspector')
     *
     * @example
     * ```tsx
     * {renderSidebar('left', 'main')}
     * {renderSidebar('right', 'main')}
     * ```
     */
    renderSidebar: (placement: 'left' | 'right' | 'top' | 'bottom', slot: string) => {
      if (!schema || !provides || !uiState) return null;
      const slotKey = `${placement}-${slot}`;
      const sidebarSlot = uiState.activeSidebars[slotKey];

      // If no sidebar in this slot, nothing to render
      if (!sidebarSlot) return null;

      const sidebarSchema = schema.sidebars?.[sidebarSlot.sidebarId];
      if (!sidebarSchema) {
        console.warn(`Sidebar "${sidebarSlot.sidebarId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        provides.forDocument(documentId).closeSidebarSlot(placement, slot);
      };

      const SidebarRenderer = renderers.sidebar;

      // ALWAYS render, pass isOpen state
      // Your renderer decides whether to return null or animate
      return (
        <SidebarRenderer
          key={sidebarSlot.sidebarId}
          schema={sidebarSchema}
          documentId={documentId}
          isOpen={sidebarSlot.isOpen}
          onClose={handleClose}
        />
      );
    },

    /**
     * Render the active modal (if any)
     *
     * Only one modal can be active at a time.
     * Modals are defined in schema.modals.
     *
     * Supports animation lifecycle:
     * - isOpen: true = visible
     * - isOpen: false = animate out (modal still rendered)
     * - onExited called after animation → modal removed
     *
     * @example
     * ```tsx
     * {renderModal()}
     * ```
     */
    renderModal: () => {
      if (!schema || !provides || !uiState?.activeModal) return null;

      const { modalId, isOpen } = uiState.activeModal;

      const modalSchema = schema.modals?.[modalId];
      if (!modalSchema) {
        console.warn(`Modal "${modalId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        provides.forDocument(documentId).closeModal();
      };

      const handleExited = () => {
        provides.forDocument(documentId).clearModal();
      };

      const ModalRenderer = renderers.modal;
      if (!ModalRenderer) {
        console.warn('No modal renderer registered');
        return null;
      }

      return (
        <ModalRenderer
          key={modalId}
          schema={modalSchema}
          documentId={documentId}
          isOpen={isOpen}
          onClose={handleClose}
          onExited={handleExited}
        />
      );
    },

    /**
     * Helper: Get all active toolbars for this document
     * Useful for batch rendering or debugging
     */
    getActiveToolbars: () => {
      if (!uiState) return [];
      return Object.entries(uiState.activeToolbars).map(([slotKey, toolbarSlot]) => {
        const [placement, slot] = slotKey.split('-');
        return {
          placement,
          slot,
          toolbarId: toolbarSlot.toolbarId,
          isOpen: toolbarSlot.isOpen,
        };
      });
    },

    /**
     * Helper: Get all active sidebars for this document
     * Useful for batch rendering or debugging
     */
    getActiveSidebars: () => {
      if (!uiState) return [];
      return Object.entries(uiState.activeSidebars).map(([slotKey, sidebarSlot]) => {
        const [placement, slot] = slotKey.split('-');
        return {
          placement,
          slot,
          sidebarId: sidebarSlot.sidebarId,
          isOpen: sidebarSlot.isOpen,
        };
      });
    },

    /**
     * Render all enabled overlays
     *
     * Overlays are floating components positioned over the document content.
     * Unlike modals, multiple overlays can be visible and they don't block interaction.
     *
     * @example
     * ```tsx
     * <div className="relative">
     *   {children}
     *   {renderOverlays()}
     * </div>
     * ```
     */
    renderOverlays: () => {
      if (!schema?.overlays || !provides) return null;

      const OverlayRenderer = renderers.overlay;
      if (!OverlayRenderer) {
        return null;
      }

      const overlays = Object.values(schema.overlays);
      if (overlays.length === 0) return null;

      return (
        <>
          {overlays.map((overlaySchema) => (
            <OverlayRenderer
              key={overlaySchema.id}
              schema={overlaySchema}
              documentId={documentId}
            />
          ))}
        </>
      );
    },
  };
}
