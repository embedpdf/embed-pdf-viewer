/**
 * @embedpdf/vue/outline: the Vue view of `@embedpdf/plugin-outline`. Reading
 * the state reads the outline; the plugin keeps it live off the document's
 * event stream, and shows your own edits at once.
 *
 *   const outline = useOutline();
 *   const { rows, current, canEdit } = useOutlineState();
 *   outline.activate(row.item.ref); // goes where the item goes, as a click does
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-outline';
import { OutlineToken, outlineState } from '@embedpdf/plugin-outline';
import type { OutlineCapability } from '@embedpdf/plugin-outline';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { stateComposable } from './state';

/**
 * The outline API (expand, select, activate, create, update, move, delete) of
 * the nearest `<DocumentScope>`'s document, else the active one. The object
 * never changes; outside a document every method throws `not-ready`.
 */
export function useOutline(): OutlineCapability {
  return useCapability(OutlineToken);
}

/**
 * The outline's state as refs: its items, the rows a tree view shows, the item
 * for where the view is reading, the selection, the load state and whether you
 * may edit it (the page's State table, declared once in `outlineState`). With
 * a selector, one ref for the value it picks, which updates only when that
 * value changes.
 */
export const useOutlineState = stateComposable(outlineState);

/** Subscribe to one outline event while the component lives: `useOutlineEvent((outline) => outline.onChanged, handler)`. */
export function useOutlineEvent<Event>(
  select: (outline: OutlineCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(OutlineToken, select, handler);
}
