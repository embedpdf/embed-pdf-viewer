import {
  PluginError,
  isPluginError,
  originOf,
  type ChangeOrigin,
  type ControllerContext,
  type DocCapability,
  type DocumentMetadata,
} from '@embedpdf/core';
import type { MetadataCapability, MetadataUpdatedEvent } from './contract';
import { changedKeys, type MetadataAction, type MetadataState } from './model';

const METADATA_MODIFY: DocCapability = 'doc.metadata.modify';
const SYSTEM_ORIGIN: ChangeOrigin = {
  locality: 'local',
  trigger: 'system',
  sessionId: null,
  actorId: null,
};

/**
 * The metadata controller — the reference for the v3 authoring pattern.
 * Two habits make it read top to bottom without opening the kernel:
 *
 *   - `publish` is the ONE place the value changes and `onUpdated` fires.
 *   - `load` reads, then applies only if nothing newer arrived meanwhile.
 *
 * Lifetime, cancellation and error mapping are the kernel's: `ctx.doc` is the
 * guarded handle, `ctx.dispatch` the lease commit.
 */
export function createMetadataController(ctx: ControllerContext<MetadataState, MetadataAction>) {
  const updated = ctx.events.source<MetadataUpdatedEvent>();

  function publish(metadata: DocumentMetadata, origin: ChangeOrigin): void {
    const previous = ctx.getState().value;
    ctx.dispatch({ type: 'set', metadata });
    updated.emit({ metadata, previous, changedKeys: changedKeys(previous, metadata), origin });
  }

  let loading: Promise<void> | null = null;
  function load(): Promise<void> {
    return (loading ??= (async () => {
      const seen = ctx.getState().revision;
      ctx.dispatch({ type: 'loading' });
      try {
        const metadata = await ctx.doc.metadata.read();
        // A confirmed value that landed while we were reading is newer than this read.
        if (ctx.getState().revision === seen) publish(metadata, SYSTEM_ORIGIN);
      } catch (error) {
        if (isPluginError(error, 'instance-closed')) return;
        ctx.dispatch({ type: 'error', forbidden: isPluginError(error, 'permission-denied') });
        throw error;
      } finally {
        loading = null;
      }
    })());
  }

  const api: MetadataCapability = {
    getSnapshot: () => ctx.getState().value,
    getStatus: () => ctx.getState().status,
    canEdit: () => ctx.doc.security.allows(METADATA_MODIFY),

    async update(patch, options) {
      if (!api.canEdit()) {
        throw new PluginError(
          'permission-denied',
          'metadata',
          `metadata.update requires ${METADATA_MODIFY}`,
          {
            details: { required: METADATA_MODIFY },
          },
        );
      }
      const seen = ctx.getState().revision;
      const result = await ctx.doc.metadata.update(patch);
      // The confirmed `metadata.updated` event (see connect) applies the value and
      // fires onUpdated; resolve only once that has happened, so the caller's next
      // getSnapshot() is fresh.
      await ctx.waitFor(() => ctx.getState().revision > seen, options);
      return result;
    },

    refresh: () => load(),
    onUpdated: updated.on,
  };

  return {
    api,
    connect() {
      // Every confirmed change: this plugin, another plugin, a script, a remote session.
      ctx.listen(ctx.doc.events, (event) => {
        if (event.type === 'metadata.updated') publish(event.metadata, originOf(event));
      });
      void load().catch(() => {
        /* reported through getStatus(); nothing to await at boot */
      });
    },
  };
}
