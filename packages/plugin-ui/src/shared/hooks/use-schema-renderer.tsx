import { useUICapability, useUIState } from './use-ui';
import { useRenderers } from '../registries/renderers-registry';

/**
 * High-level hook for rendering UI from schema
 *
 * Provides simple functions to render toolbars and panels by placement+slot.
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
     * Render a panel by placement and slot
     *
     * ALWAYS renders (when panel exists in slot) with isOpen state.
     * Your renderer controls whether to display or animate.
     *
     * @param placement - 'left' | 'right' | 'top' | 'bottom'
     * @param slot - Slot name (e.g. 'main', 'secondary', 'inspector')
     *
     * @example
     * ```tsx
     * {renderPanel('left', 'main')}
     * {renderPanel('right', 'main')}
     * ```
     */
    renderPanel: (placement: 'left' | 'right' | 'top' | 'bottom', slot: string) => {
      if (!schema || !provides || !uiState) return null;
      const slotKey = `${placement}-${slot}`;
      const panelSlot = uiState.activePanels[slotKey];

      // If no panel in this slot, nothing to render
      if (!panelSlot) return null;

      const panelSchema = schema.panels[panelSlot.panelId];
      if (!panelSchema) {
        console.warn(`Panel "${panelSlot.panelId}" not found in schema`);
        return null;
      }

      const handleClose = () => {
        provides.forDocument(documentId).closePanelSlot(placement, slot);
      };

      const PanelRenderer = renderers.panel;

      // ALWAYS render, pass isOpen state
      // Your renderer decides whether to return null or animate
      return (
        <PanelRenderer
          key={panelSlot.panelId}
          schema={panelSchema}
          documentId={documentId}
          isOpen={panelSlot.isOpen}
          onClose={handleClose}
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
     * Helper: Get all active panels for this document
     * Useful for batch rendering or debugging
     */
    getActivePanels: () => {
      if (!uiState) return [];
      return Object.entries(uiState.activePanels).map(([slotKey, panelSlot]) => {
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
