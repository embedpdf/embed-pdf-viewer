/** The metadata's readers: the API, the state declared once in `metadataState`, and its events. */
import type { EventHook } from '@embedpdf/core';
import { MetadataToken, metadataState } from '@embedpdf/plugin-metadata';
import type { MetadataCapability } from '@embedpdf/plugin-metadata';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/**
 * The metadata API (`update`, `custom.update`, `refresh`, `canUpdate`) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document, every method
 * throws `not-ready`. `canUpdate()` is a read, so `disabled={!metadata.canUpdate()}` updates by
 * itself.
 */
export function useMetadata(): MetadataCapability {
  return useCapability(MetadataToken);
}

/**
 * The standard fields, your own fields and their load state (the page's State table, declared
 * once in `metadataState`), as a reactive object: `state.metadata?.title`. With a selector, the
 * value it picks as `{ current }`, which changes only when that value does.
 */
export const useMetadataState = stateReader(metadataState);

/** Subscribe to one metadata event while the component lives: `useMetadataEvent((metadata) => metadata.onUpdated, handler)`. */
export function useMetadataEvent<T>(
  select: (metadata: MetadataCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MetadataToken, select, handler);
}
