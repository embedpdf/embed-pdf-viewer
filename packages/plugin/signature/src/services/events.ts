/**
 * The capability's events, minted on the instance so they are disposed with
 * it. The state-change events (`onTargetChanged`, `onInvalidationPredicted`)
 * are derived here, in one place, from each committed state change.
 */
import type {
  SignatureClearedEvent,
  SignatureFilledEvent,
  SignatureInspectionRequestedEvent,
  SignatureInvalidationPredictedEvent,
  SignatureProtectionChangedEvent,
  SignatureSignedEvent,
  SignatureSignRequestedEvent,
  SignatureTargetChangedEvent,
  SignatureValidatedEvent,
} from '../contract';
import { newlyInvalidated } from '../model';
import type { SignatureContext } from './context';

export function createEvents(ctx: SignatureContext) {
  const events = {
    signed: ctx.events.source<SignatureSignedEvent>(),
    filled: ctx.events.source<SignatureFilledEvent>(),
    cleared: ctx.events.source<SignatureClearedEvent>(),
    validated: ctx.events.source<SignatureValidatedEvent>(),
    protectionChanged: ctx.events.source<SignatureProtectionChangedEvent>(),
    invalidationPredicted: ctx.events.source<SignatureInvalidationPredictedEvent>(),
    targetChanged: ctx.events.source<SignatureTargetChangedEvent>(),
    signRequested: ctx.events.source<SignatureSignRequestedEvent>(),
    inspectionRequested: ctx.events.source<SignatureInspectionRequestedEvent>(),
  };

  ctx.state.onChange(({ previous, next }) => {
    if (previous.target !== next.target) events.targetChanged.emit({ field: next.target });
    if (previous.verdicts !== next.verdicts && next.verdicts) {
      // Acrobat's warning, after the fact and only on the edge: a signature
      // that held (or was never judged) now reads invalid because of unsaved edits.
      for (const verdict of newlyInvalidated(previous.verdicts, next.verdicts)) {
        events.invalidationPredicted.emit({
          field: verdict.signature.field,
          detail: verdict.modifications.detail ?? '',
        });
      }
    }
  });

  return events;
}
export type SignatureEvents = ReturnType<typeof createEvents>;
