import type { Coordinates } from '../../pageSpace/coordinates';
import type { DocumentFieldLock, ModificationLevel, Signature } from '../types';
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
 *     conservative until observed otherwise), as does a /Lock's /P. One
 *     case is observed otherwise: a document timestamp added after a
 *     certification that allows no changes. The timestamp breaks that
 *     certification, and Acrobat still judges the timestamp on its own, valid
 *     with validation data and unchanged objects written after it (fixtures
 *     `signature-long-term`). So that certification doesn't bind the
 *     timestamp's window.
 *   - no `judged` (a revision-anchored analysis): every signed signature's
 *     locks and levels apply.
 */
export function restrictionsFor(
  before: RevisionStructure,
  judged: Signature | null,
): { anchors: RestrictionAnchor[]; level: ModificationLevel; locks: DocumentFieldLock[] } {
  const anchors: RestrictionAnchor[] = [];
  const locks: DocumentFieldLock[] = [];
  let enforced: ModificationLevel | null = null;
  let signed = false;
  for (const sig of before.signatures) {
    if (!sig.signed || sig.revisionIndex === null) continue;
    signed = true;
    const own = judged !== null && sig.index === judged.index;
    const timestampAfterNoChanges =
      judged !== null && !own && judged.kind === 'timestamp' && sig.docMdp === 1;
    if (sig.catalogCertification && sig.docMdp !== null && !timestampAfterNoChanges) {
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
