/**
 * The signature plugin's state, in two kinds. Session state (the last
 * validation, the sign-here target, the busy flag) changes only through the
 * pure transitions below. The signature facts (the snapshot and the parked
 * two-phase signing) are engine data: a mirror folds them from confirmed
 * document events with {@link foldSignatureEvent}.
 */
import { reload, type MirrorReload } from '@embedpdf/core';
import type { SignatureVerdict } from '@embedpdf/core-signature';
import type {
  DocumentEvent,
  FormFieldRef,
  SignatureCompleteResult,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';

import type { SignaturePending } from './contract';

export interface SignatureState {
  /** The last validation; null until one ran. */
  readonly verdicts: readonly SignatureVerdict[] | null;
  /** The field the user chose to sign next ("select the field, then pick a mark"). */
  readonly target: FormFieldRef | null;
  /** A sign or fill call is in flight. */
  readonly busy: boolean;
}

export const initialSignatureState = (): SignatureState => ({
  verdicts: null,
  target: null,
  busy: false,
});

export const sameFieldRef = (left: FormFieldRef, right: FormFieldRef): boolean =>
  left.kind === 'objectNumber' && right.kind === 'objectNumber'
    ? left.fieldObjectNumber === right.fieldObjectNumber
    : left.kind === 'fqn' && right.kind === 'fqn'
      ? left.name === right.name
      : false;

// ── transitions ──

export function setVerdicts(
  state: SignatureState,
  verdicts: readonly SignatureVerdict[] | null,
): SignatureState {
  return state.verdicts === verdicts ? state : { ...state, verdicts };
}

/** Name the sign-here target; the same field (by ref) changes nothing. */
export function setTarget(state: SignatureState, field: FormFieldRef | null): SignatureState {
  const current = state.target;
  if (current === field || (current && field && sameFieldRef(current, field))) return state;
  return { ...state, target: field };
}

export function setBusy(state: SignatureState, busy: boolean): SignatureState {
  return state.busy === busy ? state : { ...state, busy };
}

// ── projections ──

/**
 * The verdicts that turned invalid because of unsaved edits: judged on the
 * working copy, invalid now, and not already invalid in the previous
 * validation (a signature that held, or was never judged).
 */
export function newlyInvalidated(
  previous: readonly SignatureVerdict[] | null,
  next: readonly SignatureVerdict[],
): SignatureVerdict[] {
  return next.filter((verdict) => {
    if (verdict.modifications.basis !== 'working-copy' || verdict.summary !== 'invalid') {
      return false;
    }
    const before = previous?.find((earlier) => earlier.signature.index === verdict.signature.index);
    return !before || before.summary !== 'invalid';
  });
}

// ── the signatures mirror ──

/** The mirrored signature facts: every signature field, and the parked signing. */
export interface SignatureRecord {
  /** Every signature field and its facts; null until the first load, or without engine support. */
  readonly snapshot: SignatureSnapshot | null;
  /** A signing candidate is parked (here or, on the cloud, elsewhere): the document is read-only. */
  readonly pending: SignaturePending | null;
}

export const emptySignatureRecord = (): SignatureRecord => ({ snapshot: null, pending: null });

export const hasSignedField = (snapshot: SignatureSnapshot | null): boolean =>
  snapshot?.signatures.some((signature) => signature.signed) ?? false;

type SignatureCompletedEvent = Extract<DocumentEvent, { type: 'signature.completed' }>;

/** The result a `signature.completed` event carries, without the event envelope. */
export const completeResultOf = (event: SignatureCompletedEvent): SignatureCompleteResult => ({
  status: event.status,
  signature: event.signature,
  version: event.version,
  previous: event.previous,
  protection: event.protection,
  meta: event.meta,
});

/**
 * A completed signing, applied to the snapshot: the sealed field's facts and
 * the protection now in force. The revisions change as well; the
 * `document.versioned` event that follows every completion reloads them.
 */
function withCompletedSignature(
  snapshot: SignatureSnapshot | null,
  event: SignatureCompletedEvent,
): SignatureSnapshot | null {
  if (!snapshot) return null;
  const sealed = event.signature;
  return {
    ...snapshot,
    signatures: snapshot.signatures.map((signature) =>
      sameFieldRef(signature.field, sealed.field) ? sealed : signature,
    ),
    protection: event.protection,
  };
}

/** Events that change which signature fields exist; the snapshot lists fields, so it is re-read. */
const FIELD_SET_EVENTS: ReadonlySet<DocumentEvent['type']> = new Set([
  'form.fieldCreated',
  'form.fieldDeleted',
  'form.widgetAttached',
  'form.widgetDetached',
  'form.imported',
  'form.repaired',
]);

/** Apply one confirmed document event to the signature facts. Pure, the same for every origin. */
export function foldSignatureEvent(
  record: SignatureRecord,
  event: DocumentEvent,
): SignatureRecord | MirrorReload {
  switch (event.type) {
    case 'signature.prepared':
      return { ...record, pending: { signingId: event.signingId, field: event.field } };
    case 'signature.aborted':
      return record.pending ? { ...record, pending: null } : record;
    case 'signature.completed':
      return { snapshot: withCompletedSignature(record.snapshot, event), pending: null };
    default:
      return FIELD_SET_EVENTS.has(event.type) ? reload() : record;
  }
}
