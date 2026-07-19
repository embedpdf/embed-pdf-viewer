import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface MetadataService {
  read(): AbortablePromise<DocumentMetadata>;
  /**
   * Rewrite the document Info dict via a three-state {@link MetadataPatch}
   * (undefined=leave, null=clear, value=set). Returns the re-read metadata
   * plus cloud coherence pins (`null` for local engines). Gated by
   * `doc.metadata.modify` on the cloud.
   */
  update(patch: MetadataPatch): AbortablePromise<MetadataUpdateResult>;
}
