import {
  type ChangeOrigin,
  type DocumentMetadata,
  type EventHook,
  type MetadataPatch,
  type MetadataUpdateResult,
  type OperationOptions,
  type ResourceStatus,
} from '@embedpdf/core';

/**
 * The document's Info-dict metadata as REACTIVE state. It changes from local
 * edits, from other plugins and scripts, and from other sessions (a remote edit
 * arrives over the document event stream), and every one of those reaches
 * the same confirmed `metadata.updated` event, which is the one path that
 * updates the snapshot and fires `onUpdated`.
 */
export interface MetadataUpdatedEvent {
  readonly metadata: DocumentMetadata;
  readonly previous: DocumentMetadata | null;
  readonly changedKeys: readonly (keyof DocumentMetadata)[];
  readonly origin: ChangeOrigin;
}

export interface MetadataCapability {
  /**
   * The current metadata, reference-stable until it changes; `null` until
   * the first read lands or while reading is forbidden — see `getStatus()`.
   */
  getSnapshot(): DocumentMetadata | null;
  /** Load state: `idle` → `loading` → `ready`, or `forbidden` / `error`. */
  getStatus(): ResourceStatus;
  /**
   * Whether this caller may edit the Info dict (`doc.metadata.modify`). The
   * engine enforces the same capability; this is the UI mirror of that guard.
   */
  canEdit(): boolean;
  /**
   * Patch the Info dict: `undefined` leaves a key, `null` clears it, a value
   * sets it. Writes to the layer. Resolves with the engine result after the
   * snapshot reflects the write and `onUpdated` has fired. Rejects with
   * `permission-denied`, `instance-closed` or `operation-cancelled`.
   */
  update(patch: MetadataPatch, options?: OperationOptions): Promise<MetadataUpdateResult>;
  /** Re-read from the engine. Rarely needed: the event stream keeps the snapshot fresh. */
  refresh(options?: OperationOptions): Promise<void>;
  /** A confirmed change, whoever caused it. Fires after the snapshot changed. */
  readonly onUpdated: EventHook<MetadataUpdatedEvent>;
}

export { MetadataToken } from './token';
