/**
 * @embedpdf/svelte/outline — the document's outline (its bookmarks).
 *
 * Reading the state reads the outline; the plugin keeps it live off the document's event stream,
 * and shows your own edits at once:
 *
 *   const outline = useOutline();
 *   const state = useOutlineState(); // state.rows, state.current, state.canEdit
 *   outline.activate(row.item.ref); // goes where the item goes, as a click does
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-outline';

export { useOutline, useOutlineEvent, useOutlineState } from './outline/readers';
