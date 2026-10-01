import {
  PluginError,
  type PluginContext,
  type CustomMetadata,
  type DocCapability,
  type DocumentMetadata,
  type OperationOptions,
} from '@embedpdf/core';

import type {
  CustomMetadataCapability,
  CustomMetadataResyncedEvent,
  CustomMetadataUpdatedEvent,
  MetadataCapability,
  MetadataResyncedEvent,
  MetadataUpdatedEvent,
} from './contract';
import { changedKeys } from './model';

const METADATA_MODIFY: DocCapability = 'doc.metadata.modify';

/**
 * The metadata controller. Both halves of the Info dict are mirrors: each
 * changes only when a load lands or its confirmed document event arrives
 * (`metadata.updated`, `metadata.customUpdated`), whoever caused the edit,
 * and that is also the one place its `onUpdated` and `onResynced` fire.
 */
export function createMetadataController(ctx: PluginContext<void>) {
  const updated = ctx.events.source<MetadataUpdatedEvent>();
  const resynced = ctx.events.source<MetadataResyncedEvent>();
  const customUpdated = ctx.events.source<CustomMetadataUpdatedEvent>();
  const customResynced = ctx.events.source<CustomMetadataResyncedEvent>();

  const metadata = ctx.mirror<DocumentMetadata | null>({
    name: 'metadata',
    initial: () => null,
    load: async (doc) => ({ value: await doc.metadata.get() }),
    fold: (value, event) => (event.type === 'metadata.updated' ? event.metadata : value),
    changed: ({ cause, event, previous, next }) => {
      if (!next) return;
      if (cause === 'load') {
        resynced.emit({ metadata: next });
      } else if (event && 'origin' in event) {
        updated.emit({
          metadata: next,
          previous,
          changedKeys: changedKeys(previous, next),
          origin: event.origin,
        });
      }
    },
  });

  const custom = ctx.mirror<CustomMetadata | null>({
    name: 'customMetadata',
    initial: () => null,
    load: async (doc) => ({ value: await doc.metadata.custom.get() }),
    fold: (value, event) => (event.type === 'metadata.customUpdated' ? event.custom : value),
    changed: ({ cause, event, previous, next }) => {
      if (!next) return;
      if (cause === 'load') {
        customResynced.emit({ custom: next });
      } else if (event && 'origin' in event) {
        customUpdated.emit({
          custom: next,
          previous,
          changedKeys: changedKeys(previous, next),
          origin: event.origin,
        });
      }
    },
  });

  const canEdit = () => ctx.allows(METADATA_MODIFY);

  /** Both writes refuse the same way before reaching the engine (the verbs are async, so it rejects). */
  const refuseWrite = (verb: string, options?: OperationOptions): void => {
    if (options?.signal?.aborted) {
      throw new PluginError('operation-cancelled', 'metadata', `${verb} was cancelled`);
    }
    ctx.assertAllowed(METADATA_MODIFY, verb);
  };

  const customApi: CustomMetadataCapability = {
    getSnapshot: custom.get,
    getStatus: custom.getStatus,
    update: async (patch, options) => {
      refuseWrite('metadata.custom.update', options);
      return ctx.doc.metadata.custom.update(patch);
    },
    refresh: () => custom.refresh(),
    onUpdated: customUpdated.on,
    onResynced: customResynced.on,
  };

  const api: MetadataCapability = {
    getSnapshot: metadata.get,
    getStatus: metadata.getStatus,
    canEdit,
    update: async (patch, options) => {
      refuseWrite('metadata.update', options);
      return ctx.doc.metadata.update(patch);
    },
    refresh: () => metadata.refresh(),
    onUpdated: updated.on,
    onResynced: resynced.on,
    custom: customApi,
  };

  return { api };
}
