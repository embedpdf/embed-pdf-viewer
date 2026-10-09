/**
 * The React surface for @embedpdf/plugin-metadata: the capability, the state
 * declared once in `metadataState`, and its events. The plugin keeps the
 * metadata live off the document event stream, so the state updates after
 * your own edits and after other sessions'.
 *
 *   const metadata = useMetadata();
 *   const { metadata: fields, custom, status } = useMetadataState();
 *   await metadata.update({ title: 'New title' }); // resolves once the state shows it
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-metadata';
import { MetadataToken, metadataState, type MetadataCapability } from '@embedpdf/plugin-metadata';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime';
import { stateHook } from './state';

/**
 * The metadata capability (update, custom.update, refresh, canUpdate) of the
 * surrounding `<DocumentScope>`'s document, else the active one. Outside a
 * document, every method throws `not-ready`.
 */
export function useMetadata(): MetadataCapability {
  return useCapability(MetadataToken);
}

/**
 * The metadata's state: the standard fields, your own fields and the load
 * state (the page's State table, declared once in `metadataState`). Takes a
 * selector, and re-renders only when what it returns changes.
 */
export const useMetadataState = stateHook(metadataState);

/** Subscribe to one metadata event for the mounted lifetime: `useMetadataEvent((metadata) => metadata.onUpdated, handler)`. */
export function useMetadataEvent<T>(
  select: (metadata: MetadataCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MetadataToken, select, handler);
}
