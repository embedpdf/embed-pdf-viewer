/**
 * The signature facts, mirrored from the engine: every signature field with
 * its signed state, the protection in force, and the parked two-phase
 * signing. They change only by loads and by confirmed document events,
 * whoever caused them, and this is the one place the fact events fire
 * (`onSigned`, `onProtectionChanged`). The judgement reacts here too: a
 * load re-judges at once when anything is signed; a changed snapshot and
 * every edit of the working copy re-judge once the edits pause.
 */
import { originOf, type Mirror } from '@embedpdf/core';
import type { DocumentEvent, DocumentProtection } from '@embedpdf/engine-core/runtime';

import {
  completeResultOf,
  emptySignatureRecord,
  foldSignatureEvent,
  hasSignedField,
  type SignatureRecord,
} from '../model';
import type { SignatureContext, SignatureServices } from '../services';
import type { SignatureValidation } from './validation';

/** Edits of the working copy: what a save would write changed, so a verdict may have too. */
const WORKING_COPY_EDITS: ReadonlySet<DocumentEvent['type']> = new Set([
  'annotation.created',
  'annotation.updated',
  'annotation.deleted',
  'annotation.moved',
  'form.valueChanged',
  'form.fieldUpdated',
  'form.effectsApplied',
]);

const sameProtection = (
  left: DocumentProtection | null,
  right: DocumentProtection | null,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export function createSignaturesMirror(
  ctx: SignatureContext,
  { events }: Pick<SignatureServices, 'events'>,
  { validateNow, revalidateSoon }: Pick<SignatureValidation, 'validateNow' | 'revalidateSoon'>,
) {
  const { signed, protectionChanged } = events;

  /** Parked signings the engine answered it does not know: no event will clear them. */
  const disowned = new Set<string>();

  const mirror: Mirror<SignatureRecord> = ctx.mirror<SignatureRecord>({
    name: 'signatures',
    initial: emptySignatureRecord,
    // The engine's snapshot says nothing about a parked signing: a load
    // keeps the one the events announced, unless the engine disowned it.
    load: async (doc) => {
      const snapshot = doc.signatures ? await doc.signatures.list() : null;
      const pending = mirror.get().pending;
      return {
        value: {
          snapshot,
          pending: pending && !disowned.has(pending.signingId) ? pending : null,
        },
      };
    },
    fold: foldSignatureEvent,
    changed: ({ cause, event, previous, next }) => {
      const protection = next.snapshot?.protection ?? null;
      if (protection && !sameProtection(previous.snapshot?.protection ?? null, protection)) {
        protectionChanged.emit({ protection });
      }
      if (event?.type === 'signature.completed') {
        signed.emit({
          field: event.signature.field,
          result: completeResultOf(event),
          origin: originOf(event),
        });
      }
      if (!hasSignedField(next.snapshot)) return;
      if (cause === 'load') validateNow();
      else if (previous.snapshot !== next.snapshot) revalidateSoon();
    },
  });

  return {
    mirror,
    /**
     * The engine does not know this parked signing (its abort answered
     * `unknown`), so no event will ever clear it: reload without it.
     */
    disown(signingId: string): Promise<void> {
      disowned.add(signingId);
      return mirror.refresh();
    },
    connect(): void {
      ctx.listen(ctx.doc.events, (event) => {
        if (WORKING_COPY_EDITS.has(event.type) && hasSignedField(mirror.get().snapshot)) {
          revalidateSoon();
        }
      });
    },
  };
}
export type SignaturesMirror = ReturnType<typeof createSignaturesMirror>;
