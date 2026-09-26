import type { DocumentFieldLock, ModificationLevel, SignatureDTO } from '../types';
import { APPROVAL_BASELINE, levelFromPermission, minLevel } from '../protection';
import type { RestrictionAnchor, RevisionStructure } from './types';

/**
 * The restrictions a window is judged under, read from the sealed
 * revision's structure (what that revision declared, not what the final
 * file says).
 *
 *   - `judged` given (a signature-anchored analysis): its own FieldMDP and
 *     /Lock bind the window; other signatures' locks do not (corpus v3/85:
 *     a second signature is valid with a fill of a field the first locked).
 *     Every certification's level, own or earlier, applies (inherited:
 *     conservative until observed otherwise), as does a /Lock's /P.
 *   - no `judged` (a revision-anchored analysis): every signed signature's
 *     locks and levels apply.
 */
export function restrictionsFor(
  before: RevisionStructure,
  judged: SignatureDTO | null,
): { anchors: RestrictionAnchor[]; level: ModificationLevel; locks: DocumentFieldLock[] } {
  const anchors: RestrictionAnchor[] = [];
  const locks: DocumentFieldLock[] = [];
  let enforced: ModificationLevel | null = null;
  let signed = false;
  for (const sig of before.signatures) {
    if (!sig.signed || sig.revisionIndex === null) continue;
    signed = true;
    const own = judged !== null && sig.index === judged.index;
    if (sig.catalogCertification && sig.docMdp !== null) {
      anchors.push({
        signatureIndex: sig.index,
        revisionIndex: sig.revisionIndex,
        source: 'docmdp',
        own,
        permission: sig.docMdp,
      });
      enforced = minLevel(enforced ?? 'annotate', levelFromPermission(sig.docMdp));
    }
    if (sig.lock?.permission !== undefined) {
      enforced = minLevel(enforced ?? 'annotate', levelFromPermission(sig.lock.permission));
    }
    if (judged !== null && !own) continue;
    if (sig.fieldMdp) {
      anchors.push({
        signatureIndex: sig.index,
        revisionIndex: sig.revisionIndex,
        source: 'fieldmdp',
        own,
        fields: sig.fieldMdp,
      });
      locks.push({ signatureIndex: sig.index, source: 'fieldmdp', spec: sig.fieldMdp });
    }
    if (sig.lock) {
      anchors.push({
        signatureIndex: sig.index,
        revisionIndex: sig.revisionIndex,
        source: 'lock',
        own,
        fields: sig.lock,
      });
      locks.push({ signatureIndex: sig.index, source: 'lock', spec: sig.lock });
    }
  }
  const level = signed ? (enforced ?? APPROVAL_BASELINE) : 'annotate';
  return { anchors, level, locks };
}
