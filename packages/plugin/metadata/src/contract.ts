import {
  type ChangeOrigin,
  type CustomMetadata,
  type CustomMetadataPatch,
  type CustomMetadataUpdateResult,
  type DocumentMetadata,
  type EventHook,
  type MetadataPatch,
  type MetadataUpdateResult,
  type OperationOptions,
  type ResourceStatus,
} from '@embedpdf/core';

/**
 * A confirmed change of the Info dict's standard fields. Local edits, other
 * plugins, scripts and other sessions all reach the same confirmed
 * `metadata.updated` document event, which is the one path that updates the
 * snapshot and fires this.
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

/** A confirmed change of the custom keys (`metadata.customUpdated`), whoever caused it. */
export interface CustomMetadataUpdatedEvent {
  readonly custom: CustomMetadata;
  readonly previous: CustomMetadata | null;
  /** The keys that were added, changed or removed. */
  readonly changedKeys: readonly string[];
  readonly origin: ChangeOrigin;
}

/** The custom keys were (re)loaded from the engine. */
export interface CustomMetadataResyncedEvent {
  readonly custom: CustomMetadata;
}

/**
 * The Info dict's custom keys: the same reads and verbs as the standard
 * fields, on an object of their own. Editing needs the same capability, so
 * `canEdit()` on the metadata capability answers for both.
 */
export interface CustomMetadataCapability {
  /** The current keys, reference-stable until they change; `null` until the first read lands. */
  getSnapshot(): CustomMetadata | null;
  /** Load state: `idle` → `loading` → `ready`, or `forbidden` / `error`. */
  getStatus(): ResourceStatus;
  /**
   * Set and remove keys: a key left out stays, `null` removes it, a string
   * sets it. Resolves once the snapshot reflects the write and `onUpdated`
   * has fired. Rejects with `permission-denied`, `instance-closed` or
   * `operation-cancelled`.
   */
  update(
    patch: CustomMetadataPatch,
    options?: OperationOptions,
  ): Promise<CustomMetadataUpdateResult>;
  /** Re-read from the engine. Rarely needed: the event stream keeps the snapshot fresh. */
  refresh(): Promise<void>;
  /** A confirmed change, whoever caused it. Fires after the snapshot changed. */
  readonly onUpdated: EventHook<CustomMetadataUpdatedEvent>;
  /** The keys were loaded or reloaded from the engine. */
  readonly onResynced: EventHook<CustomMetadataResyncedEvent>;
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
   * Whether this caller may edit the Info dict (`doc.metadata.modify`), its
   * custom keys included. The engine enforces the same capability; this is
   * the UI mirror of that guard.
   */
  canEdit(): boolean;
  /**
   * Patch the standard fields: `undefined` leaves a field, `null` clears it,
   * a value sets it. Writes to the layer. Resolves with the engine result; by
   * then the snapshot reflects the write and `onUpdated` has fired. Rejects
   * with `permission-denied`, `instance-closed` or `operation-cancelled`.
   */
  update(patch: MetadataPatch, options?: OperationOptions): Promise<MetadataUpdateResult>;
  /** Re-read from the engine. Rarely needed: the event stream keeps the snapshot fresh. */
  refresh(): Promise<void>;
  /** A confirmed change, whoever caused it. Fires after the snapshot changed. */
  readonly onUpdated: EventHook<MetadataUpdatedEvent>;
  /** The metadata was loaded or reloaded from the engine. */
  readonly onResynced: EventHook<MetadataResyncedEvent>;
  /** The Info dict's other keys. */
  readonly custom: CustomMetadataCapability;
}

export { MetadataToken } from './token';
