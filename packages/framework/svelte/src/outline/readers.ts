/** The outline's readers: the API, the state declared once in `outlineState`, and its events. */
import type { EventHook } from '@embedpdf/core';
import { OutlineToken, outlineState } from '@embedpdf/plugin-outline';
import type { OutlineCapability } from '@embedpdf/plugin-outline';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/**
 * The outline API (expand, select, activate, create, update, move, delete) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document, every method
 * throws `not-ready`. `canEdit()` is a read, so `disabled={!outline.canEdit()}` updates by itself.
 */
export function useOutline(): OutlineCapability {
  return useCapability(OutlineToken);
}

/**
 * The outline's items, the rows a tree view shows, the item for where the view is reading, the
 * selection, the load state and whether you may edit it (the page's State table, declared once in
 * `outlineState`), as a reactive object: `state.rows`. With a selector, the value it picks as
 * `{ current }`, which changes only when that value does.
 */
export const useOutlineState = stateReader(outlineState);

/** Subscribe to one outline event while the component lives: `useOutlineEvent((outline) => outline.onChanged, handler)`. */
export function useOutlineEvent<T>(
  select: (outline: OutlineCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(OutlineToken, select, handler);
}
