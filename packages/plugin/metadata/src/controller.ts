import {
  originOf,
  PluginError,
  type PluginContext,
  type DocCapability,
  type DocumentMetadata,
} from '@embedpdf/core';

import type {
  MetadataCapability,
  MetadataResyncedEvent,
  MetadataUpdatedEvent,
} from './contract';
import { changedKeys } from './model';

const METADATA_MODIFY: DocCapability = 'doc.metadata.modify';

/**
 * The metadata controller. The Info dict is a mirror: it changes only when a
 * load lands or a confirmed `metadata.updated` event arrives, whoever caused
 * the edit, and that is also the one place `onUpdated` and `onResynced` fire.
 */
export function createMetadataController(ctx: PluginContext<void>) {
  const updated = ctx.events.source<MetadataUpdatedEvent>();
  const resynced = ctx.events.source<MetadataResyncedEvent>();

  const metadata = ctx.mirror<DocumentMetadata | null>({
    name: 'metadata',
    initial: () => null,
    load: async (doc) => ({ value: await doc.metadata.read() }),
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
          origin: originOf(event),
        });
      }
    },
  });

  const api: MetadataCapability = {
    getSnapshot: metadata.get,
    getStatus: metadata.getStatus,
    canEdit: () => ctx.doc.security.allows(METADATA_MODIFY),
    update(patch, options) {
      if (options?.signal?.aborted) {
        return Promise.reject(
          new PluginError('operation-cancelled', 'metadata', 'metadata.update was cancelled'),
        );
      }
      if (!api.canEdit()) {
        return Promise.reject(
          new PluginError(
            'permission-denied',
            'metadata',
            `metadata.update requires ${METADATA_MODIFY}`,
            { details: { required: METADATA_MODIFY } },
          ),
        );
      }
      return ctx.doc.metadata.update(patch);
    },
    refresh: () => metadata.refresh(),
    onUpdated: updated.on,
    onResynced: resynced.on,
  };

  return { api };
}
