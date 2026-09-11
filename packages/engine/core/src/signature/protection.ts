import type { DocCapability } from '../auth/scope/types';
import type {
  DocMdpPermission,
  DocumentFieldLock,
  DocumentProtection,
  FieldLockSpec,
  ModificationLevel,
  SignatureDTO,
} from './types';

/** Bumped whenever the derivation below changes meaning. Rides every protection. */
export const SIGNATURE_POLICY_VERSION = 1;

const LEVEL_RANK: Record<ModificationLevel, number> = { none: 0, lta: 1, fill: 2, annotate: 3 };

/** DocMDP `/P` → the modification level it permits. */
export function levelFromPermission(permission: DocMdpPermission): ModificationLevel {
  return permission === 1 ? 'lta' : permission === 2 ? 'fill' : 'annotate';
}

export function minLevel(a: ModificationLevel, b: ModificationLevel): ModificationLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

/** Whether `level` (null = unsigned, everything allowed) permits changes of kind `needed`. */
export function levelAllows(level: ModificationLevel | null, needed: ModificationLevel): boolean {
  return level === null || LEVEL_RANK[level] >= LEVEL_RANK[needed];
}

/** Hierarchical name match: `group` covers `group.total`. */
export function lockNameCovers(lockedName: string, fieldName: string): boolean {
  return fieldName === lockedName || fieldName.startsWith(`${lockedName}.`);
}

export function lockCovers(spec: FieldLockSpec, fieldName: string): boolean {
  switch (spec.action) {
    case 'all':
      return true;
    case 'include':
      return spec.fields.some((name) => lockNameCovers(name, fieldName));
    case 'exclude':
      return !spec.fields.some((name) => lockNameCovers(name, fieldName));
  }
}

/**
 * Derive what the signatures already in a document forbid. Pure and
 * versioned (`SIGNATURE_POLICY_VERSION`); the same function runs in the
 * browser worker, on the native server, and in the conformance suite.
 *
 *   level = min(certification P, every signed field's /Lock /P), or the
 *           approval baseline (`annotate`) when signatures exist without
 *           a certification, or null when nothing is signed.
 *   fieldLocks = every signed signature's FieldMDP and the /Lock of every
 *           signed field. Unsigned fields' /Lock entries describe a
 *           FUTURE signature and lock nothing yet.
 */
export function deriveProtection(signatures: ReadonlyArray<SignatureDTO>): DocumentProtection {
  let level: ModificationLevel | null = null;
  let certification: DocumentProtection['certification'] = null;
  const fieldLocks: DocumentFieldLock[] = [];

  for (const sig of signatures) {
    if (!sig.signed) continue;
    // Any signed signature establishes at least the approval baseline.
    level = level === null ? 'annotate' : level;
    if (sig.catalogCertification && sig.docMdp !== null && certification === null) {
      certification = { signatureIndex: sig.index, permission: sig.docMdp };
      level = minLevel(level, levelFromPermission(sig.docMdp));
    }
    if (sig.fieldMdp) {
      fieldLocks.push({ signatureIndex: sig.index, source: 'fieldmdp', spec: sig.fieldMdp });
    }
    if (sig.lock) {
      fieldLocks.push({ signatureIndex: sig.index, source: 'lock', spec: sig.lock });
      if (sig.lock.permission !== undefined) {
        level = minLevel(level, levelFromPermission(sig.lock.permission));
      }
    }
  }

  return { level, certification, fieldLocks, policyVersion: SIGNATURE_POLICY_VERSION };
}

/** The lock that freezes `fieldName`, if any. */
export function fieldLockFor(
  protection: DocumentProtection,
  fieldName: string,
): DocumentFieldLock | null {
  for (const lock of protection.fieldLocks) {
    if (lockCovers(lock.spec, fieldName)) return lock;
  }
  return null;
}

/**
 * The capabilities a protection removes from every caller, admin scope
 * included — document-derived authority, exactly like encryption bits.
 * Per-field locks are enforced by the form mutator, not here.
 */
export function protectedCapabilities(protection: DocumentProtection | null): Set<DocCapability> {
  const out = new Set<DocCapability>();
  if (!protection || protection.level === null) return out;
  // Any signature: no structural or destructive edits, no rewrites.
  out.add('doc.pages.modify');
  out.add('doc.pages.assemble');
  out.add('doc.redact');
  out.add('doc.attachments.modify');
  out.add('doc.download.flattened');
  out.add('doc.forms.modify');
  if (!levelAllows(protection.level, 'annotate')) out.add('doc.annotate.modify');
  if (!levelAllows(protection.level, 'fill')) {
    out.add('doc.forms.fill');
  }
  return out;
}
