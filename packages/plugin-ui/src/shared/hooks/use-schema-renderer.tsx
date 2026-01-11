import { Fragment } from '@framework';
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
      const slotKey = `${placement}-${slot}`;

      if (!schema || !provides || !uiState) {
        return null;
      }

      const toolbarSlot = uiState.activeToolbars[slotKey];
      const toolbarSchema = toolbarSlot ? schema.toolbars[toolbarSlot.toolbarId] : null;

      if (toolbarSlot && !toolbarSchema) {
        console.warn(`Toolbar "${toolbarSlot.toolbarId}" not found in schema`);
      }

      const isClosable = toolbarSchema ? !toolbarSchema.permanent : false;
      const handleClose = isClosable
        ? () => provides.forDocument(documentId).closeToolbarSlot(placement, slot)
        : undefined;

      const ToolbarRenderer = renderers.toolbar;

      // Always return the same element type (div) with stable key
      return (
        <Fragment key={`toolbar-slot-${slotKey}`}>
          {toolbarSlot && toolbarSchema && (
            <ToolbarRenderer
              schema={toolbarSchema}
              documentId={documentId}
              isOpen={toolbarSlot.isOpen}
              onClose={handleClose}
            />
          )}
        </Fragment>
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
      const slotKey = `${placement}-${slot}`;

      if (!schema || !provides || !uiState) {
        return null;
      }

      const sidebarSlot = uiState.activeSidebars[slotKey];
      const sidebarSchema = sidebarSlot ? schema.sidebars?.[sidebarSlot.sidebarId] : null;

      if (sidebarSlot && !sidebarSchema) {
        console.warn(`Sidebar "${sidebarSlot.sidebarId}" not found in schema`);
      }

      const handleClose = () => {
        provides.forDocument(documentId).closeSidebarSlot(placement, slot);
      };

      const SidebarRenderer = renderers.sidebar;

      // Always return the same element type (Fragment) with stable key
      return (
        <Fragment key={`sidebar-slot-${slotKey}`}>
          {sidebarSlot && sidebarSchema && (
            <SidebarRenderer
              schema={sidebarSchema}
              documentId={documentId}
              isOpen={sidebarSlot.isOpen}
              onClose={handleClose}
            />
          )}
        </Fragment>
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
      if (!schema || !provides || !uiState) {
        return null;
      }

      const ModalRenderer = renderers.modal;
      if (!ModalRenderer) {
        return null;
      }

      const activeModal = uiState.activeModal;
      const modalSchema = activeModal ? schema.modals?.[activeModal.modalId] : null;

      if (activeModal && !modalSchema) {
        console.warn(`Modal "${activeModal.modalId}" not found in schema`);
      }

      const handleClose = () => {
        provides.forDocument(documentId).closeModal();
      };

      const handleExited = () => {
        provides.forDocument(documentId).clearModal();
      };

      // Always return the same element type (Fragment) with stable key
      return (
        <Fragment key="modal-slot">
          {activeModal && modalSchema && (
            <ModalRenderer
              schema={modalSchema}
              documentId={documentId}
              isOpen={activeModal.isOpen}
              onClose={handleClose}
              onExited={handleExited}
            />
          )}
        </Fragment>
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
     * Overlay visibility is controlled by the enabledOverlays state.
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
      if (!schema || !provides || !uiState) {
        return null;
      }

      const OverlayRenderer = renderers.overlay;
      if (!OverlayRenderer) {
        return null;
      }

      const overlays = schema.overlays ? Object.values(schema.overlays) : [];

      // Filter overlays by enabled state (default to true if not explicitly set)
      const enabledOverlays = overlays.filter(
        (overlay) => uiState.enabledOverlays[overlay.id] !== false,
      );

      // Always return the same element type (Fragment) with stable key
      return (
        <Fragment key="overlays-slot">
          {enabledOverlays.map((overlaySchema) => (
            <OverlayRenderer
              key={overlaySchema.id}
              schema={overlaySchema}
              documentId={documentId}
            />
          ))}
        </Fragment>
      );
    },
  };
}
