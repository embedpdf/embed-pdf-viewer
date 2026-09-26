import { MetadataToken, type MetadataCapability } from '@embedpdf/plugin-metadata';
import type {
  DocumentMetadata,
  EventHook,
  MetadataPatch,
  MetadataUpdateResult,
  OperationOptions,
  ResourceStatus,
} from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useSelector } from './runtime';

/**
 * The document's metadata, bound to the surrounding `DocumentScope`. Reactive:
 * `metadata` updates from your own edits AND from other sessions — the plugin
 * keeps it live off the document event stream.
 *
 *   const { metadata, status, update } = useMetadata();
 *   await update({ title: 'New title' }); // resolves once `metadata` shows it
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-metadata';
export function useMetadata(): {
  metadata: DocumentMetadata | null;
  status: ResourceStatus;
  update: (patch: MetadataPatch, options?: OperationOptions) => Promise<MetadataUpdateResult>;
  refresh: (options?: OperationOptions) => Promise<void>;
  canEdit: () => boolean;
} {
  const cap = useCapability(MetadataToken);
  const metadata = useSelector(MetadataToken, (c) => c.getSnapshot());
  const status = useSelector(MetadataToken, (c) => c.getStatus());
  return { metadata, status, update: cap.update, refresh: cap.refresh, canEdit: cap.canEdit };
}

/** Subscribe to one metadata event for the mounted lifetime: `useMetadataEvent((c) => c.onUpdated, handler)`. */
export function useMetadataEvent<T>(
  select: (cap: MetadataCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MetadataToken, select, handler);
}
