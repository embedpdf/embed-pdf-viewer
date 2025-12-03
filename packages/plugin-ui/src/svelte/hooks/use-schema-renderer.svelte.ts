import { useUICapability } from './use-ui.svelte';
import { useRenderers } from '../registries/renderers-registry.svelte';

/**
 * High-level hook for rendering UI from schema
 *
 * Provides information about active toolbars and panels by placement+slot.
 * Always includes isOpen state so renderers can control animations.
 *
 * Use with Svelte's component binding to render toolbars and panels.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   const { getToolbarInfo, getPanelInfo } = useSchemaRenderer(() => documentId);
 *
 *   const topMainToolbar = $derived(getToolbarInfo('top', 'main'));
 *   const leftMainPanel = $derived(getPanelInfo('left', 'main'));
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
     * Get panel information by placement and slot
     *
     * @param placement - 'left' | 'right' | 'top' | 'bottom'
     * @param slot - Slot name (e.g. 'main', 'secondary', 'inspector')
     * @returns Panel info or null if no panel in slot
     */
    getPanelInfo: (placement: 'left' | 'right' | 'top' | 'bottom', slot: string) => {
      const schema = capability.provides?.getSchema();
      const documentId = getDocumentId();

      if (!schema || !uiState.provides || !uiState.state || !documentId) return null;

      const slotKey = `${placement}-${slot}`;
      const panelSlot = uiState.state.activePanels[slotKey];

      // If no panel in this slot, nothing to render
      if (!panelSlot) return null;

      const panelSchema = schema.panels[panelSlot.panelId];
      if (!panelSchema) {
        console.warn(`Panel "${panelSlot.panelId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        uiState.provides?.closePanelSlot(placement, slot);
      };

      return {
        renderer: renderers.panel,
        schema: panelSchema,
        documentId,
        isOpen: panelSlot.isOpen,
        onClose: handleClose,
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
     * Helper: Get all active panels for this document
     * Useful for batch rendering or debugging
     */
    getActivePanels: () => {
      if (!uiState.state) return [];
      return Object.entries(uiState.state.activePanels).map(([slotKey, panelSlot]) => {
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

// Import after definition to avoid circular dependency
import { useUIState } from './use-ui.svelte';
