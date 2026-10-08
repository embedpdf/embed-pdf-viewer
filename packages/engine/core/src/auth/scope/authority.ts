import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { AnnotationRef } from '../../identity/AnnotationRef';
import { PermissionDenied } from './errors';
import { checkCapability, checkCollab, checkSetGroup, collabTargetOf } from './resolver';
import type { AnnotationActor, DocCapability, Identity, PdfBits } from './types';
import { describeProtection, protectedCapabilities } from '../../signature/protection';
import type { DocumentProtection } from '../../signature/types';

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

/**
 * Everything a change is checked against, inside the write, op by op (the
 * ops of an undo included): who it acts for, their grants, and what the
 * document's signatures forbid.
 */
export interface ChangeAuthority extends AnnotationAuthority {
  /** What the signatures in the document forbid; `null` when nothing is enforced. */
  readonly protection: DocumentProtection | null;
}

/**
 * Check that the caller may use `capability`: `ProtectedDocument` when a
 * signature in the document took it away, `PermissionDenied` when the
 * grants never gave it.
 */
export function authorizeCapability(authority: ChangeAuthority, capability: DocCapability): void {
  authorizeUnprotected(authority, capability);
  const { grants, protection } = authority;
  if (grants && !checkCapability(capability, grants.scope, grants.pdfBits, protection)) {
    throw new PermissionDenied(capability, 'target');
  }
}

/**
 * Check only that no signature in the document took `capability` away
 * (`ProtectedDocument`). Annotation creates, updates and deletes take this
 * for `doc.annotate.modify`; their grants are checked per annotation.
 */
export function authorizeUnprotected(authority: ChangeAuthority, capability: DocCapability): void {
  const { protection } = authority;
  if (protection && protectedCapabilities(protection).has(capability)) {
    throw new EngineError(
      EngineErrorCode.ProtectedDocument,
      describeProtection(capability, protection),
    );
  }
}

/** What an annotation is and whose, as the write reads it. */
interface Owned {
  subtype?: string;
  userId?: string | null;
  groupId?: string | null;
}

/**
 * The capability writing an annotation of `subtype` takes. A widget belongs
 * to a form field, so creating, changing, moving or deleting one is
 * designing the form: `doc.forms.modify`. The annotation scopes
 * (`annotations:*`) never apply to it, and it has no group of its own.
 */
export function annotationWriteCapability(subtype: string | undefined): DocCapability {
  return subtype === 'widget' ? 'doc.forms.modify' : 'doc.annotate.modify';
}

/** The capabilities writing all of `annotations` takes, each once. */
export function annotationWriteCapabilities(
  annotations: readonly { readonly subtype?: string }[],
): DocCapability[] {
  return [
    ...new Set(annotations.map((annotation) => annotationWriteCapability(annotation.subtype))),
  ];
}

/**
 * Check a widget write (see {@link annotationWriteCapability}): form design,
 * and no group to set. Returns the actor the write stamps: the editor.
 */
function authorizeWidgetWrite(
  authority: AnnotationAuthority,
  groupId: string | null | undefined,
): AnnotationActor | undefined {
  const { identity, grants } = authority;
  if (grants && !checkCapability('doc.forms.modify', grants.scope, grants.pdfBits)) {
    throw new PermissionDenied('doc.forms.modify', 'target');
  }
  if (typeof groupId === 'string') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a widget has no group of its own: a form field's group is the field's",
    );
  }
  const actor: AnnotationActor = {
    ...(identity.userId !== undefined ? { userId: identity.userId } : {}),
    ...(identity.displayName !== undefined ? { displayName: identity.displayName } : {}),
  };
  return actor.userId || actor.displayName ? actor : undefined;
}

/**
 * Check a create of a `subtype` annotation in `groupId` (the identity's own
 * group without one) and return the actor the write stamps: the creator, in
 * that group. A group other than the identity's takes the authority a
 * reassignment takes. A widget takes form design instead, in no group.
 */
export function authorizeAnnotationCreate(
  authority: AnnotationAuthority,
  subtype: string,
  groupId: string | null | undefined,
): AnnotationActor | undefined {
  if (subtype === 'widget') return authorizeWidgetWrite(authority, groupId);
  const { identity, grants } = authority;
  const group = groupId ?? identity.groupId;
  if (grants) {
    if (
      group !== undefined &&
      !checkSetGroup(group, identity.groupId, grants.scope, grants.pdfBits)
    ) {
      throw new PermissionDenied(`annotations:set-group:group=${group}`, 'target');
    }
    const target = collabTargetOf({ userId: identity.userId, groupId: group });
    if (!checkCollab('create', target, grants.scope, identity, grants.pdfBits)) {
      throw new PermissionDenied('annotations:create', 'target');
    }
  }
  const actor: AnnotationActor = {
    ...(identity.userId !== undefined ? { userId: identity.userId } : {}),
    ...(group !== undefined ? { groupId: group } : {}),
    ...(identity.displayName !== undefined ? { displayName: identity.displayName } : {}),
  };
  return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
}

/**
 * Check an update of the annotation `owner` describes and return the actor
 * the write stamps: the editor, and the group only when the patch reassigns
 * it. An existing group can be reassigned, never removed. A widget takes form
 * design instead, and its patch sets no group.
 */
export function authorizeAnnotationUpdate(
  authority: AnnotationAuthority,
  owner: Owned,
  patchGroupId: string | null | undefined,
): AnnotationActor | undefined {
  if (owner.subtype === 'widget') return authorizeWidgetWrite(authority, patchGroupId);
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
 * refused. A widget takes form design, never the annotation scopes.
 */
export function authorizeAnnotationDelete(
  authority: AnnotationAuthority,
  members: readonly (Owned & { ref: AnnotationRef })[],
): void {
  const { identity, grants } = authority;
  if (!grants) return;
  const mayDesign = checkCapability('doc.forms.modify', grants.scope, grants.pdfBits);
  const refused = members.filter((member) =>
    member.subtype === 'widget'
      ? !mayDesign
      : !checkCollab('delete', collabTargetOf(member), grants.scope, identity, grants.pdfBits),
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
