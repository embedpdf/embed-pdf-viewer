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
 * `metadata` updates from your own edits and from other sessions — the plugin
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
  refresh: () => Promise<void>;
  canEdit: () => boolean;
} {
  const metadata = useCapability(MetadataToken);
  const snapshot = useSelector(MetadataToken, (current) => current.getSnapshot());
  const status = useSelector(MetadataToken, (current) => current.getStatus());
  return {
    metadata: snapshot,
    status,
    update: metadata.update,
    refresh: metadata.refresh,
    canEdit: metadata.canEdit,
  };
}

/** Subscribe to one metadata event for the mounted lifetime: `useMetadataEvent((metadata) => metadata.onUpdated, handler)`. */
export function useMetadataEvent<T>(
  select: (metadata: MetadataCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(MetadataToken, select, handler);
}
