/** The nine change hooks; disposed with the plugin. */
import { createEventHook, type ChangeOrigin } from '@embedpdf/core';

import type {
  SignatureFieldEvent,
  SignatureInspectionRequestedEvent,
  SignatureInvalidatingEvent,
  SignatureProtectionChangedEvent,
  SignatureSignedEvent,
  SignatureSignRequestedEvent,
  SignatureTargetChangedEvent,
  SignatureValidatedEvent,
} from '../contract';
import type { SignatureContext } from './context';

/** A change this session made through the public API. */
export const ORIGIN_API: ChangeOrigin = {
  locality: 'local',
  trigger: 'api',
  sessionId: null,
  actorId: null,
};

export function createEvents(ctx: SignatureContext) {
  const report = (error: unknown) =>
    globalThis.console?.error('[signature] listener failed:', error);
  const signed = createEventHook<SignatureSignedEvent>(report);
  const filled = createEventHook<SignatureFieldEvent>(report);
  const cleared = createEventHook<SignatureFieldEvent>(report);
  const validated = createEventHook<SignatureValidatedEvent>(report);
  const protectionChanged = createEventHook<SignatureProtectionChangedEvent>(report);
  const invalidating = createEventHook<SignatureInvalidatingEvent>(report);
  const targetChanged = createEventHook<SignatureTargetChangedEvent>(report);
  const signRequested = createEventHook<SignatureSignRequestedEvent>(report);
  const inspectionRequested = createEventHook<SignatureInspectionRequestedEvent>(report);
  ctx.cleanup(() => {
    for (const hook of [
      signed,
      filled,
      cleared,
      validated,
      protectionChanged,
      invalidating,
      targetChanged,
      signRequested,
      inspectionRequested,
    ])
      hook.dispose();
  });
  return {
    signed,
    filled,
    cleared,
    validated,
    protectionChanged,
    invalidating,
    targetChanged,
    signRequested,
    inspectionRequested,
  };
}
export type SignatureEvents = ReturnType<typeof createEvents>;
