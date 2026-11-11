import type { CustomMetadataService } from './CustomMetadataService';
import type { DocumentFileInfo } from '../dto/DocumentFileInfo';
import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface MetadataService {
  get(): AbortablePromise<DocumentMetadata>;
  /**
   * Rewrite the standard Info-dict fields via a three-state
   * {@link MetadataPatch} (undefined=leave, null=clear, value=set). Returns
   * the re-read metadata plus cloud coherence pins (`null` for local
   * engines). Gated by `doc.metadata.modify` on the cloud.
   */
  update(patch: MetadataPatch, options?: WriteOptions): AbortablePromise<MetadataUpdateResult>;
  /**
   * What the file's header, trailer and catalog say about it: its version,
   * `/ID`, `/Lang`, `/PageMode`, XMP packet and the Info dictionary as
   * written. A read; no page is loaded.
   */
  file(): AbortablePromise<DocumentFileInfo>;
  /** The Info dict's other keys: an object of their own. */
  readonly custom: CustomMetadataService;
}
