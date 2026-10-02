import type { CustomMetadata } from '../dto/CustomMetadata';
import type { CustomMetadataPatch } from '../dto/CustomMetadataPatch';
import type { CustomMetadataUpdateResult } from '../mutation/CustomMetadataUpdateResult';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * The document's own Info-dict keys, as an object of their own: each key is
 * a top-level field, so an update follows the one write rule (a key left
 * out stays, `null` removes it, a string sets it).
 */
export interface CustomMetadataService {
  get(): AbortablePromise<CustomMetadata>;
  /**
   * Set and remove keys via a {@link CustomMetadataPatch}. Returns the keys
   * as they are after the write plus cloud coherence pins (`null` for local
   * engines). Gated by `doc.metadata.modify` on the cloud.
   */
  update(patch: CustomMetadataPatch): AbortablePromise<CustomMetadataUpdateResult>;
}
