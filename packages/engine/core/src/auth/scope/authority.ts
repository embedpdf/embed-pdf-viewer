import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { AnnotationRef } from '../../identity/AnnotationRef';
import { PermissionDenied } from './errors';
import { checkCollab, checkSetGroup, collabTargetOf } from './resolver';
import type { AnnotationActor, Identity, PdfBits } from './types';

/**
 * Who an annotation write acts for, and what they may do to the annotations
 * it changes. It travels with the write: the worker checks it against each
 * annotation the write finds, inside the write, so the check and the write
 * see one document and a refusal leaves nothing behind.
 */
export interface AnnotationAuthority {
  /** Who the write acts for: the attribution it stamps. */
  readonly identity: Identity;
  /**
   * What the caller may do to annotations, checked against each one the
   * write changes; `null` when nothing is checked (a tenant writing its
   * own document).
   */
  readonly grants: { readonly scope: readonly string[]; readonly pdfBits: PdfBits } | null;
}

/** Whose an annotation is, as the write reads it. */
interface Owned {
  userId?: string | null;
  groupId?: string | null;
}

/**
 * Check an update of the annotation `owner` describes and return the actor
 * the write stamps: the editor, and the group only when the patch reassigns
 * it. An existing group can be reassigned, never removed.
 */
export function authorizeAnnotationUpdate(
  authority: AnnotationAuthority,
  owner: Owned,
  patchGroupId: string | null | undefined,
): AnnotationActor | undefined {
  const { identity, grants } = authority;
  const target = collabTargetOf(owner);
  if (grants && !checkCollab('update', target, grants.scope, identity, grants.pdfBits)) {
    throw new PermissionDenied('annotations:update', 'target');
  }
  if (patchGroupId === null && target.groupId !== undefined) {
    throw new EngineError(EngineErrorCode.InvalidArg, "an annotation's group can't be removed");
  }
  const reassigning = typeof patchGroupId === 'string' && patchGroupId !== target.groupId;
  if (
    reassigning &&
    grants &&
    !checkSetGroup(patchGroupId, identity.groupId, grants.scope, grants.pdfBits)
  ) {
    throw new PermissionDenied(`annotations:set-group:group=${patchGroupId}`, 'target');
  }
  const actor: AnnotationActor = {
    ...(identity.userId !== undefined ? { userId: identity.userId } : {}),
    ...(identity.displayName !== undefined ? { displayName: identity.displayName } : {}),
    ...(reassigning ? { groupId: patchGroupId } : {}),
  };
  return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
}

/**
 * Check a delete of every annotation it removes (an annotation goes with its
 * thread and popups): all or nothing, `PermissionDenied` naming each one
 * refused.
 */
export function authorizeAnnotationDelete(
  authority: AnnotationAuthority,
  members: readonly (Owned & { ref: AnnotationRef })[],
): void {
  const { identity, grants } = authority;
  if (!grants) return;
  const refused = members.filter(
    (member) =>
      !checkCollab('delete', collabTargetOf(member), grants.scope, identity, grants.pdfBits),
  );
  if (refused.length > 0) {
    throw new PermissionDenied(
      'annotations:delete',
      'target',
      undefined,
      refused.map((member) => member.ref),
    );
  }
}
