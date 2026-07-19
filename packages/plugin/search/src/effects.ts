/**
 * Keeps results honest across document mutations. Every confirmed
 * mutation (own or remote) bumps the engine's mutation sequence, which
 * invalidates search cursors AND can change what's findable (redaction,
 * page delete, import). The correct reaction is always the same: re-run
 * the current query from scratch. Reruns are coalesced — a burst of
 * events (multi-part mutation, SSE catch-up) triggers one rescan.
 */
import type { EffectContext } from '@embedpdf/core';

import { SearchToken } from './types';
import type { SearchAction, SearchState } from './types';

const RERUN_DELAY_MS = 250;

export function registerSearchEffects(ctx: EffectContext<SearchState, SearchAction>): void {
  const doc = ctx.doc;
  if (!doc) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = doc.events.subscribe(() => {
    if (ctx.getState().status === 'idle') return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      ctx.get(SearchToken).rerun();
    }, RERUN_DELAY_MS);
  });

  ctx.cleanup(() => {
    if (timer !== null) clearTimeout(timer);
    unsubscribe();
  });
}
