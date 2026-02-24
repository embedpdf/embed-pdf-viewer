import { UIState, UIDocumentState, ToolbarSlotState, SidebarSlotState } from './types';

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
// Sidebars
// ─────────────────────────────────────────────────────────

export function selectSidebarSlot(
  plugins: PluginsSlice,
  documentId: string,
  placement: string,
  slot: string,
): SidebarSlotState | null {
  const doc = selectUIDocumentState(plugins, documentId);
  if (!doc) return null;
  return doc.activeSidebars[makeSlotKey(placement, slot)] ?? null;
}

/**
 * Is a sidebar open in this slot?
 * If sidebarId is provided, also matches that specific sidebar.
 */
export function isSidebarOpen(
  plugins: PluginsSlice,
  documentId: string,
  placement: string,
  slot: string,
  sidebarId?: string,
): boolean {
  const slotState = selectSidebarSlot(plugins, documentId, placement, slot);
  if (!slotState || !slotState.isOpen) return false;
  return sidebarId ? slotState.sidebarId === sidebarId : true;
}
