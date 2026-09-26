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
 * A confirmed change of the Info dict. Local edits, other plugins, scripts and
 * other sessions all reach the same confirmed `metadata.updated` document
 * event, which is the one path that updates the snapshot and fires this.
 */
export interface MetadataUpdatedEvent {
  readonly metadata: DocumentMetadata;
  readonly previous: DocumentMetadata | null;
  readonly changedKeys: readonly (keyof DocumentMetadata)[];
  readonly origin: ChangeOrigin;
}

/** The metadata was (re)loaded from the engine. */
export interface MetadataResyncedEvent {
  readonly metadata: DocumentMetadata;
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
   * sets it. Writes to the layer. Resolves with the engine result; by then the
   * snapshot reflects the write and `onUpdated` has fired. Rejects with
   * `permission-denied`, `instance-closed` or `operation-cancelled`.
   */
  update(patch: MetadataPatch, options?: OperationOptions): Promise<MetadataUpdateResult>;
  /** Re-read from the engine. Rarely needed: the event stream keeps the snapshot fresh. */
  refresh(): Promise<void>;
  /** A confirmed change, whoever caused it. Fires after the snapshot changed. */
  readonly onUpdated: EventHook<MetadataUpdatedEvent>;
  /** The metadata was loaded or reloaded from the engine. */
  readonly onResynced: EventHook<MetadataResyncedEvent>;
}

export { MetadataToken } from './token';
