import type { MutationMeta } from './MutationMeta';
import type { DocumentMetadata } from '../dto/DocumentMetadata';

/**
 * Result of a `metadata.update()`. A metadata write is a layer mutation
 * (it rewrites the Info dict into the layer artifact, like `pages.move`),
 * so the result returns the re-read `metadata` (the same shape
 * `metadata.get()` returns). Callers holding a previously-read
 * `DocumentMetadata` swap it for `result.metadata`. On the cloud,
 * `meta.cacheDelta` advances `docVersion` and `metadataVersion` and no
 * per-page pin.
 */
export interface MetadataUpdateResult {
  /** The post-write document metadata — what a metadata edit changes. */
  metadata: DocumentMetadata;
  meta: MutationMeta;
}
