import { useUICapability } from './use-ui.svelte';
import { useRenderers } from '../registries/renderers-registry.svelte';

/**
 * High-level hook for rendering UI from schema
 *
 * Provides information about active toolbars, sidebars, and modals.
 * Always includes isOpen state so renderers can control animations.
 *
 * Use with Svelte's component binding to render toolbars and sidebars.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   const { getToolbarInfo, getSidebarInfo, getModalInfo } = useSchemaRenderer(() => documentId);
 *
 *   const topMainToolbar = $derived(getToolbarInfo('top', 'main'));
 *   const leftMainSidebar = $derived(getSidebarInfo('left', 'main'));
 *   const modal = $derived(getModalInfo());
 * </script>
 *
 * {#if topMainToolbar}
 *   {@const ToolbarRenderer = topMainToolbar.renderer}
 *   <ToolbarRenderer
 *     schema={topMainToolbar.schema}
 *     documentId={topMainToolbar.documentId}
 *     isOpen={topMainToolbar.isOpen}
 *     onClose={topMainToolbar.onClose}
 *   />
 * {/if}
 * ```
 */
export function useSchemaRenderer(getDocumentId: () => string | null) {
  const renderers = useRenderers();
  const capability = useUICapability();
  const uiState = useUIState(getDocumentId);

  return {
    /**
     * Get toolbar information by placement and slot
     *
     * @param placement - 'top' | 'bottom' | 'left' | 'right'
     * @param slot - Slot name (e.g. 'main', 'secondary')
     * @returns Toolbar info or null if no toolbar in slot
     */
    getToolbarInfo: (placement: 'top' | 'bottom' | 'left' | 'right', slot: string) => {
      const schema = capability.provides?.getSchema();
      const documentId = getDocumentId();

      if (!schema || !uiState.provides || !uiState.state || !documentId) return null;

      const slotKey = `${placement}-${slot}`;
      const toolbarSlot = uiState.state.activeToolbars[slotKey];

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
            uiState.provides?.closeToolbarSlot(placement, slot);
          }
        : undefined;

      return {
        renderer: renderers.toolbar,
        schema: toolbarSchema,
        documentId,
        isOpen: toolbarSlot.isOpen,
        onClose: handleClose,
      };
    },

    /**
     * Get sidebar information by placement and slot
     *
     * @param placement - 'left' | 'right' | 'top' | 'bottom'
     * @param slot - Slot name (e.g. 'main', 'secondary', 'inspector')
     * @returns Sidebar info or null if no sidebar in slot
     */
    getSidebarInfo: (placement: 'left' | 'right' | 'top' | 'bottom', slot: string) => {
      const schema = capability.provides?.getSchema();
      const documentId = getDocumentId();

      if (!schema || !uiState.provides || !uiState.state || !documentId) return null;

      const slotKey = `${placement}-${slot}`;
      const sidebarSlot = uiState.state.activeSidebars[slotKey];

      // If no sidebar in this slot, nothing to render
      if (!sidebarSlot) return null;

      const sidebarSchema = schema.sidebars?.[sidebarSlot.sidebarId];
      if (!sidebarSchema) {
        console.warn(`Sidebar "${sidebarSlot.sidebarId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        uiState.provides?.closeSidebarSlot(placement, slot);
      };

      return {
        renderer: renderers.sidebar,
        schema: sidebarSchema,
        documentId,
        isOpen: sidebarSlot.isOpen,
        onClose: handleClose,
      };
    },

    /**
     * Get modal information (if active)
     *
     * Supports animation lifecycle:
     * - isOpen: true = visible
     * - isOpen: false = animate out (modal still rendered)
     * - onExited called after animation → modal removed
     *
     * @returns Modal info or null if no modal active
     */
    getModalInfo: () => {
      const schema = capability.provides?.getSchema();
      const documentId = getDocumentId();

      if (!schema || !uiState.provides || !uiState.state?.activeModal || !documentId) return null;

      const { modalId, isOpen } = uiState.state.activeModal;

      const modalSchema = schema.modals?.[modalId];
      if (!modalSchema) {
        console.warn(`Modal "${modalId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        uiState.provides?.closeModal();
      };

      const handleExited = () => {
        uiState.provides?.clearModal();
      };

      const ModalRenderer = renderers.modal;
      if (!ModalRenderer) {
        console.warn('No modal renderer registered');
        return null;
      }

      return {
        renderer: ModalRenderer,
        schema: modalSchema,
        documentId,
        isOpen,
        onClose: handleClose,
        onExited: handleExited,
        modalProps: uiState.state.activeModal.props,
      };
    },

    /**
     * Helper: Get all active toolbars for this document
     * Useful for batch rendering or debugging
     */
    getActiveToolbars: () => {
      if (!uiState.state) return [];
      return Object.entries(uiState.state.activeToolbars).map(([slotKey, toolbarSlot]) => {
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
      if (!uiState.state) return [];
      return Object.entries(uiState.state.activeSidebars).map(([slotKey, sidebarSlot]) => {
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
     * Get overlay information for all enabled overlays
     *
     * Overlays are floating components positioned over the document content.
     * Unlike modals, multiple overlays can be visible and they don't block interaction.
     * Overlay visibility is controlled by the enabledOverlays state.
     *
     * @example
     * ```svelte
     * <script lang="ts">
     *   const { getOverlaysInfo } = useSchemaRenderer(() => documentId);
     *   const overlays = $derived(getOverlaysInfo());
     * </script>
     *
     * {#each overlays as overlay (overlay.schema.id)}
     *   {@const OverlayRenderer = overlay.renderer}
     *   <OverlayRenderer schema={overlay.schema} documentId={overlay.documentId} />
     * {/each}
     * ```
     */
    getOverlaysInfo: () => {
      const schema = capability.provides?.getSchema();
      const documentId = getDocumentId();

      if (!schema?.overlays || !documentId || !uiState.state) return [];

      const OverlayRenderer = renderers.overlay;
      if (!OverlayRenderer) {
        return [];
      }

      const overlays = Object.values(schema.overlays);

      // Filter overlays by enabled state (default to true if not explicitly set)
      const enabledOverlays = overlays.filter(
        (overlay) => uiState.state!.enabledOverlays[overlay.id] !== false,
      );

      return enabledOverlays.map((overlaySchema) => ({
        renderer: OverlayRenderer,
        schema: overlaySchema,
        documentId,
      }));
    },
  };
}

// Import after definition to avoid circular dependency
import { useUIState } from './use-ui.svelte';
