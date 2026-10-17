import type { DocumentFieldLock } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, fieldLockFor } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { SignatureReader } from '../../signature/SignatureReader';

/** The lock a signature put on a field, by the field's fully qualified name. */
export type FieldLockLookup = (fieldName: string) => DocumentFieldLock | null;

/**
 * The field locks earlier signatures declared (their FieldMDP, or the /Lock
 * of a signed field), read once for a whole write; `null` when there are
 * none. Every write refuses a
 * locked field: document-derived authority, the same way encryption bits
 * are. Off under `signedDocumentPolicy: 'permit'`; a document whose
 * signature model cannot be built is not known to be locked.
 */
export function readFieldLocks(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
): FieldLockLookup | null {
  if (session.signedDocumentPolicy !== 'protect') return null;
  let protection;
  try {
    protection = new SignatureReader(runtime, session).readProtection();
  } catch {
    return null;
  }
  if (protection.fieldLocks.length === 0) return null;
  return (fieldName) => fieldLockFor(protection, fieldName);
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
