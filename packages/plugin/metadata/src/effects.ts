import type { DocumentEvent, EffectContext } from '@embedpdf/core';
import type { MetadataAction, MetadataState } from './types';

/**
 * Makes metadata REACTIVE — the reason this is a plugin, not a kernel IO call.
 *
 *  1. Seed: read the Info dict once when the document opens.
 *  2. Live: subscribe to the document event stream. A `metadata.updated` event
 *     carries the full re-read metadata and fires for OWN edits AND for remote
 *     edits delivered over SSE (another session) — both just become `setState`.
 *
 * The handle's stream is synchronous fan-out, so this coexists with the kernel's
 * own subscription (page registry) on the same handle.
 */
export function registerMetadataEffects(ctx: EffectContext<MetadataState, MetadataAction>): void {
  const doc = ctx.doc;
  if (!doc) return;

  // 1. seed
  void doc.metadata.read().then(
    (metadata) => ctx.dispatch({ type: 'SET', metadata }),
    () => {}, // doc closed / read aborted — ignore
  );

  // 2. live updates (own edits + remote SSE edits)
  const unsubscribe = doc.events.subscribe((event: DocumentEvent) => {
    if (event.type === 'metadata.updated') {
      ctx.dispatch({ type: 'SET', metadata: event.metadata });
    }
  });
  ctx.cleanup(unsubscribe);
}
