import type { DocCapability } from '../auth/scope/types';
import type {
  DocMdpPermission,
  DocumentFieldLock,
  DocumentProtection,
  FieldLockSpec,
  ModificationLevel,
  SignatureDTO,
} from './types';

/**
 * Bumped whenever the derivation below (or a judgement rule) changes meaning.
 * Rides every protection and every analysis, and keys the cloud's immutable
 * analysis URLs. The current policy is calibrated on the 91 Acrobat
 * observations in `packages/engine/main/test/fixtures/signature-compat`:
 * each signature is judged on the net state of the document against the
 * revision it sealed; an object written again with the sealed value is not
 * a modification; an approval signature permits commenting; field
 * properties are judged per level; a lock binds only the signature that
 * declares it; a changed shared resource must be allowed by every use.
 */
export const SIGNATURE_POLICY_VERSION = 4;

/**
 * How a validator reads an approval signature. ISO 32000 defines permitted
 * changes only for certification signatures; Acrobat reads an approval
 * signature as "Form Fill-in, Signing and Commenting are allowed" (its own
 * permission text under every such signature) and keeps it valid through a
 * Square annotation added, deleted or recoloured afterwards (fixtures
 * `signature-compat/v3/88`, `/90` and `/91`: "Annotations Created/Deleted/
 * Modified", signature valid). pyHanko judges stricter (fill only); Acrobat
 * is the validator recipients use, so the baseline is `annotate`.
 */
export const APPROVAL_BASELINE: ModificationLevel = 'annotate';

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
 * Derive what the signatures already in a document mean for what comes
 * after. Pure and versioned (`SIGNATURE_POLICY_VERSION`); the same function
 * runs in the browser worker, on the native server, and in the conformance
 * suite.
 *
 *   enforced = min(certification P, every signed field's /Lock /P), or null
 *              when nothing was declared. What the engine refuses.
 *   judged   = enforced, or the approval baseline when signatures exist
 *              without a declaration, or null when nothing is signed. What
 *              the revision analysis judges later changes against. A
 *              declaration governs the judgement too: a P=3 certifier really
 *              did allow annotations.
 *   fieldLocks = every signed signature's FieldMDP and the /Lock of every
 *              signed field. Unsigned fields' /Lock entries describe a
 *              future signature and lock nothing yet.
 */
export function deriveProtection(signatures: ReadonlyArray<SignatureDTO>): DocumentProtection {
  let signed = false;
  let enforced: ModificationLevel | null = null;
  let certification: DocumentProtection['certification'] = null;
  const fieldLocks: DocumentFieldLock[] = [];

  for (const sig of signatures) {
    if (!sig.signed) continue;
    signed = true;
    if (sig.catalogCertification && sig.docMdp !== null && certification === null) {
      certification = { signatureIndex: sig.index, permission: sig.docMdp };
      enforced = minLevel(enforced ?? 'annotate', levelFromPermission(sig.docMdp));
    }
    if (sig.fieldMdp) {
      fieldLocks.push({ signatureIndex: sig.index, source: 'fieldmdp', spec: sig.fieldMdp });
    }
    if (sig.lock) {
      fieldLocks.push({ signatureIndex: sig.index, source: 'lock', spec: sig.lock });
      if (sig.lock.permission !== undefined) {
        enforced = minLevel(enforced ?? 'annotate', levelFromPermission(sig.lock.permission));
      }
    }
  }

  const judged = signed ? (enforced ?? APPROVAL_BASELINE) : null;
  return { enforced, judged, certification, fieldLocks, policyVersion: SIGNATURE_POLICY_VERSION };
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
 *
 * Only what was declared is refused: a refusal is a promise a signer made,
 * never a guess about a validator. A certification (or a lock with /P)
 * declares what may follow, and everything outside that — page edits,
 * redaction, field authoring, attachments, and below P=3 annotations, below
 * P=2 form fill — is refused. A plain approval signature declares nothing:
 * the same edits stay possible and are then judged, the verdict saying the
 * signature no longer holds, exactly as Acrobat does. The one exception is a
 * rewrite: it does not invalidate signatures, it erases them, so any signed
 * document refuses it. Per-field locks are enforced by the form mutator.
 */
export function protectedCapabilities(protection: DocumentProtection | null): Set<DocCapability> {
  const out = new Set<DocCapability>();
  if (!protection || protection.judged === null) return out;
  out.add('doc.download.flattened');
  if (protection.enforced === null) return out; // nothing declared: judged, not refused
  out.add('doc.pages.modify');
  out.add('doc.pages.assemble');
  out.add('doc.redact');
  out.add('doc.attachments.modify');
  out.add('doc.forms.modify');
  if (!levelAllows(protection.enforced, 'annotate')) out.add('doc.annotate.modify');
  if (!levelAllows(protection.enforced, 'fill')) out.add('doc.forms.fill');
  return out;
}
