/** The capability's two event sources, disposed with the instance. */
import type { RedactionAppliedEvent, RedactionPendingChangedEvent } from '../contract';
import type { RedactionContext } from './context';

export function createEvents(ctx: RedactionContext) {
  return {
    applied: ctx.events.source<RedactionAppliedEvent>(),
    pendingChanged: ctx.events.source<RedactionPendingChangedEvent>(),
  };
}
export type RedactionEvents = ReturnType<typeof createEvents>;
