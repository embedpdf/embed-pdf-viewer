import { h, toValue, type VNode, type MaybeRefOrGetter } from 'vue';
import { useUICapability, useUIState } from './use-ui';
import { useRenderers } from '../registries/renderers-registry';

/**
 * High-level composable for rendering UI from schema
 *
 * Provides simple functions to render toolbars, sidebars, and modals.
 * Always passes isOpen state to renderers so they can control animations.
 *
 * Automatically subscribes to UI state changes for the given document.
 * @param documentId Document ID (can be ref, computed, getter, or plain value)
 */
export function useSchemaRenderer(documentId: MaybeRefOrGetter<string>) {
  const renderers = useRenderers();
  const { provides } = useUICapability();
  const { state: uiState } = useUIState(documentId);

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
     * ```vue
     * <component :is="renderToolbar('top', 'main')" />
     * <component :is="renderToolbar('top', 'secondary')" />
     * ```
     */
    renderToolbar: (placement: 'top' | 'bottom' | 'left' | 'right', slot: string): VNode | null => {
      const schema = provides.value?.getSchema();

      if (!schema || !provides.value || !uiState.value) return null;

      const slotKey = `${placement}-${slot}`;
      const toolbarSlot = uiState.value.activeToolbars[slotKey];

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
            provides.value?.forDocument(toValue(documentId)).closeToolbarSlot(placement, slot);
          }
        : undefined;

      const ToolbarRenderer = renderers.toolbar;

      // ALWAYS render, pass isOpen state
      return h(ToolbarRenderer, {
        key: toolbarSlot.toolbarId,
        schema: toolbarSchema,
        documentId: toValue(documentId),
        isOpen: toolbarSlot.isOpen,
        onClose: handleClose,
      });
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
     * ```vue
     * <component :is="renderSidebar('left', 'main')" />
     * <component :is="renderSidebar('right', 'main')" />
     * ```
     */
    renderSidebar: (placement: 'left' | 'right' | 'top' | 'bottom', slot: string): VNode | null => {
      const schema = provides.value?.getSchema();

      if (!schema || !provides.value || !uiState.value) return null;

      const slotKey = `${placement}-${slot}`;
      const sidebarSlot = uiState.value.activeSidebars[slotKey];

      // If no sidebar in this slot, nothing to render
      if (!sidebarSlot) return null;

      const sidebarSchema = schema.sidebars?.[sidebarSlot.sidebarId];
      if (!sidebarSchema) {
        console.warn(`Sidebar "${sidebarSlot.sidebarId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        provides.value?.forDocument(toValue(documentId)).closeSidebarSlot(placement, slot);
      };

      const SidebarRenderer = renderers.sidebar;

      // ALWAYS render, pass isOpen state
      return h(SidebarRenderer, {
        key: sidebarSlot.sidebarId,
        schema: sidebarSchema,
        documentId: toValue(documentId),
        isOpen: sidebarSlot.isOpen,
        onClose: handleClose,
      });
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
     * ```vue
     * <component :is="renderModal()" />
     * ```
     */
    renderModal: (): VNode | null => {
      const schema = provides.value?.getSchema();

      if (!schema || !provides.value || !uiState.value?.activeModal) return null;

      const { modalId, isOpen } = uiState.value.activeModal;

      const modalSchema = schema.modals?.[modalId];
      if (!modalSchema) {
        console.warn(`Modal "${modalId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        provides.value?.forDocument(toValue(documentId)).closeModal();
      };

      const handleExited = () => {
        provides.value?.forDocument(toValue(documentId)).clearModal();
      };

      const ModalRenderer = renderers.modal;
      if (!ModalRenderer) {
        console.warn('No modal renderer registered');
        return null;
      }

      return h(ModalRenderer, {
        key: modalId,
        schema: modalSchema,
        documentId: toValue(documentId),
        isOpen,
        onClose: handleClose,
        onExited: handleExited,
      });
    },

    /**
     * Helper: Get all active toolbars for this document
     * Useful for batch rendering or debugging
     */
    getActiveToolbars: () => {
      if (!uiState.value) return [];
      return Object.entries(uiState.value.activeToolbars).map(([slotKey, toolbarSlot]) => {
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
      if (!uiState.value) return [];
      return Object.entries(uiState.value.activeSidebars).map(([slotKey, sidebarSlot]) => {
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
     * ```vue
     * <div class="relative">
     *   <slot />
     *   <component :is="renderOverlays()" />
     * </div>
     * ```
     */
    renderOverlays: (): VNode[] | null => {
      const schema = provides.value?.getSchema();

      if (!schema?.overlays || !provides.value || !uiState.value) return null;

      const OverlayRenderer = renderers.overlay;
      if (!OverlayRenderer) {
        return null;
      }

      const overlays = Object.values(schema.overlays);
      if (overlays.length === 0) return null;

      // Filter overlays by enabled state (default to true if not explicitly set)
      const enabledOverlays = overlays.filter(
        (overlay) => uiState.value!.enabledOverlays[overlay.id] !== false,
      );

      return enabledOverlays.map((overlaySchema) =>
        h(OverlayRenderer, {
          key: overlaySchema.id,
          schema: overlaySchema,
          documentId: toValue(documentId),
        }),
      );
    },
  };
}
