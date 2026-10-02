/**
 * @embedpdf/vue/metadata: the Vue view of `@embedpdf/plugin-metadata`. The
 * plugin keeps the metadata live off the document's event stream, so the state
 * follows your own edits and other sessions' alike.
 *
 *   const metadata = useMetadata();
 *   const { metadata: fields, custom, status } = useMetadataState();
 *   await metadata.update({ title: 'New title' }); // resolves once the state shows it
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-metadata';
import { MetadataToken, metadataState } from '@embedpdf/plugin-metadata';
import type { MetadataCapability } from '@embedpdf/plugin-metadata';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { stateComposable } from './state';

/**
 * The metadata API (`update`, `custom.update`, `refresh`, `canUpdate`) of the
 * nearest `<DocumentScope>`'s document, else the active one. The object never
 * changes; outside a document every method throws `not-ready`.
 */
export function useMetadata(): MetadataCapability {
  return useCapability(MetadataToken);
}

/**
 * The metadata's state as refs: the standard fields, your own fields and the
 * load state (the page's State table, declared once in `metadataState`). With
 * a selector, one ref for the value it picks, which updates only when that
 * value changes.
 */
export const useMetadataState = stateComposable(metadataState);

/** Subscribe to one metadata event while the component lives: `useMetadataEvent((metadata) => metadata.onUpdated, handler)`. */
export function useMetadataEvent<Event>(
  select: (metadata: MetadataCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(MetadataToken, select, handler);
}
