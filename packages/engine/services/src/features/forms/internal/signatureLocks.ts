import type { DocumentFieldLock } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, fieldLockFor } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { SignatureReader } from '../../signature/SignatureReader';

/** The lock a signature put on a field, by the field's fully qualified name. */
export type FieldLockLookup = (fieldName: string) => DocumentFieldLock | null;

const LOCKS = new WeakMap<DocumentSession, { seq: number; locks: FieldLockLookup | null }>();

/**
 * The field locks the document's signed signatures declare (their FieldMDP,
 * or the /Lock of a signed field), whatever the session's policy: what a
 * field read reports (`FormField.lockedBy`). `null` when there are none, or
 * when the signature model can't be built, which is not known to be locked.
 * Read once for each version of the document (`cacheSeq`).
 */
export function fieldLocksOf(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
): FieldLockLookup | null {
  const seq = session.cacheSeq();
  const hit = LOCKS.get(session);
  if (hit && hit.seq === seq) return hit.locks;
  let locks: FieldLockLookup | null = null;
  try {
    const protection = new SignatureReader(runtime, session).readProtection();
    if (protection.fieldLocks.length > 0) locks = (name) => fieldLockFor(protection, name);
  } catch {
    locks = null;
  }
  LOCKS.set(session, { seq, locks });
  return locks;
}

/**
 * The field locks a write refuses (see {@link fieldLocksOf}); `null` when
 * there are none. Every write refuses a locked field: document-derived
 * authority, the same way encryption bits are. Off under
 * `signedDocumentPolicy: 'permit'`.
 */
export function readFieldLocks(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
): FieldLockLookup | null {
  if (session.signedDocumentPolicy !== 'protect') return null;
  return fieldLocksOf(runtime, session);
}

/** `ProtectedDocument` when a signature locked the field. */
export function assertFieldNotLocked(fieldName: string, locks: FieldLockLookup | null): void {
  const lock = locks?.(fieldName);
  if (!lock) return;
  throw new EngineError(
    EngineErrorCode.ProtectedDocument,
    `form field "${fieldName}" is locked by signature ${lock.signatureIndex} (${lock.source === 'fieldmdp' ? 'FieldMDP' : '/Lock'})`,
  );
}
