import type { MutationMeta } from './MutationMeta';
import type { CustomMetadata } from '../dto/CustomMetadata';

/**
 * Result of a `metadata.custom.update()`: the keys as they are after the
 * write, the shape `metadata.custom.get()` returns. Like a standard-field
 * write, it rewrites the Info dict, so on the cloud `meta.cacheDelta`
 * advances `docVersion` and `metadataVersion`.
 */
export interface CustomMetadataUpdateResult {
  custom: CustomMetadata;
  meta: MutationMeta;
}
