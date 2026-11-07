/**
 * The React surface for @embedpdf/plugin-outline: the capability, the state
 * declared once in `outlineState`, and its events. Reading the state reads
 * the outline; the plugin keeps it live off the document event stream, and
 * shows your own edits at once.
 *
 *   const outline = useOutline();
 *   const { rows, current, canEdit } = useOutlineState();
 *   outline.activate(row.item.ref); // goes where the item goes, as a click does
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-outline';
import { OutlineToken, outlineState, type OutlineCapability } from '@embedpdf/plugin-outline';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime';
import { stateHook } from './state';

/**
 * The outline capability (expand, select, activate, create, update, move,
 * delete) of the surrounding `<DocumentScope>`'s document, else the active
 * one. Outside a document, every method throws `not-ready`.
 */
export function useOutline(): OutlineCapability {
  return useCapability(OutlineToken);
}

/**
 * The outline's state: its items, the rows a tree view shows, the item for
 * where the view is reading, the selection, the load state and whether you may
 * edit it (the page's State table, declared once in `outlineState`). Takes a
 * selector, and re-renders only when what it returns changes.
 */
export const useOutlineState = stateHook(outlineState);

/** Subscribe to one outline event for the mounted lifetime: `useOutlineEvent((outline) => outline.onChanged, handler)`. */
export function useOutlineEvent<T>(
  select: (outline: OutlineCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(OutlineToken, select, handler);
}
