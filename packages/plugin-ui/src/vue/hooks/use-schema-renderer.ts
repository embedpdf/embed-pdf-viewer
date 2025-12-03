import { h, toValue, type VNode, type MaybeRefOrGetter } from 'vue';
import { useUICapability, useUIState } from './use-ui';
import { useRenderers } from '../registries/renderers-registry';

/**
 * High-level composable for rendering UI from schema
 *
 * Provides simple functions to render toolbars and panels by placement+slot.
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
     * Render a panel by placement and slot
     *
     * ALWAYS renders (when panel exists in slot) with isOpen state.
     * Your renderer controls whether to display or animate.
     *
     * @param placement - 'left' | 'right' | 'top' | 'bottom'
     * @param slot - Slot name (e.g. 'main', 'secondary', 'inspector')
     *
     * @example
     * ```vue
     * <component :is="renderPanel('left', 'main')" />
     * <component :is="renderPanel('right', 'main')" />
     * ```
     */
    renderPanel: (placement: 'left' | 'right' | 'top' | 'bottom', slot: string): VNode | null => {
      const schema = provides.value?.getSchema();

      if (!schema || !provides.value || !uiState.value) return null;

      const slotKey = `${placement}-${slot}`;
      const panelSlot = uiState.value.activePanels[slotKey];

      // If no panel in this slot, nothing to render
      if (!panelSlot) return null;

      const panelSchema = schema.panels[panelSlot.panelId];
      if (!panelSchema) {
        console.warn(`Panel "${panelSlot.panelId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        provides.value?.forDocument(toValue(documentId)).closePanelSlot(placement, slot);
      };

      const PanelRenderer = renderers.panel;

      // ALWAYS render, pass isOpen state
      // Your renderer decides whether to return null or animate
      return h(PanelRenderer, {
        key: panelSlot.panelId,
        schema: panelSchema,
        documentId: toValue(documentId),
        isOpen: panelSlot.isOpen,
        onClose: handleClose,
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
     * Helper: Get all active panels for this document
     * Useful for batch rendering or debugging
     */
    getActivePanels: () => {
      if (!uiState.value) return [];
      return Object.entries(uiState.value.activePanels).map(([slotKey, panelSlot]) => {
        const [placement, slot] = slotKey.split('-');
        return {
          placement,
          slot,
          panelId: panelSlot.panelId,
          isOpen: panelSlot.isOpen,
        };
      });
    },
  };
}
