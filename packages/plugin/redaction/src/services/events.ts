/** The two change hooks; disposed with the plugin. */
import { createEventHook, type ChangeOrigin } from '@embedpdf/core';

import type { RedactionAppliedEvent, RedactionPendingChangedEvent } from '../contract';
import type { RedactionContext } from './context';

/** A change this session made through the public API. */
export const ORIGIN_API: ChangeOrigin = {
  locality: 'local',
  trigger: 'api',
  sessionId: null,
  actorId: null,
};

export function createEvents(ctx: RedactionContext) {
  const report = (error: unknown) =>
    globalThis.console?.error('[redaction] listener failed:', error);
  const applied = createEventHook<RedactionAppliedEvent>(report);
  const pendingChanged = createEventHook<RedactionPendingChangedEvent>(report);
  ctx.cleanup(() => {
    applied.dispose();
    pendingChanged.dispose();
  });
  return { applied, pendingChanged };
}
export type RedactionEvents = ReturnType<typeof createEvents>;
