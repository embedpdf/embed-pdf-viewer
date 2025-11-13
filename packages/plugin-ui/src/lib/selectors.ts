import { UIState, UIDocumentState, ToolbarSlotState, PanelSlotState } from './types';

// Shape of state.plugins passed into command active()
export type PluginsSlice = Record<string, any>;

export function selectUIState(plugins: PluginsSlice): UIState | null {
  return (plugins['ui'] as UIState | undefined) ?? null;
}

export function selectUIDocumentState(
  plugins: PluginsSlice,
  documentId: string,
): UIDocumentState | null {
  const ui = selectUIState(plugins);
  return ui?.documents[documentId] ?? null;
}

function makeSlotKey(placement: string, slot: string): string {
  return `${placement}-${slot}`;
}

// ─────────────────────────────────────────────────────────
// Toolbars
// ─────────────────────────────────────────────────────────

export function selectToolbarSlot(
  plugins: PluginsSlice,
  documentId: string,
  placement: string,
  slot: string,
): ToolbarSlotState | null {
  const doc = selectUIDocumentState(plugins, documentId);
  if (!doc) return null;
  return doc.activeToolbars[makeSlotKey(placement, slot)] ?? null;
}

/**
 * Is a toolbar open in this slot?
 * If toolbarId is provided, also matches that specific toolbar.
 */
export function isToolbarOpen(
  plugins: PluginsSlice,
  documentId: string,
  placement: string,
  slot: string,
  toolbarId?: string,
): boolean {
  const slotState = selectToolbarSlot(plugins, documentId, placement, slot);
  if (!slotState || !slotState.isOpen) return false;
  return toolbarId ? slotState.toolbarId === toolbarId : true;
}

// ─────────────────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────────────────

export function selectPanelSlot(
  plugins: PluginsSlice,
  documentId: string,
  placement: string,
  slot: string,
): PanelSlotState | null {
  const doc = selectUIDocumentState(plugins, documentId);
  if (!doc) return null;
  return doc.activePanels[makeSlotKey(placement, slot)] ?? null;
}

/**
 * Is a panel open in this slot?
 * If panelId is provided, also matches that specific panel.
 */
export function isPanelOpen(
  plugins: PluginsSlice,
  documentId: string,
  placement: string,
  slot: string,
  panelId?: string,
): boolean {
  const slotState = selectPanelSlot(plugins, documentId, placement, slot);
  if (!slotState || !slotState.isOpen) return false;
  return panelId ? slotState.panelId === panelId : true;
}
