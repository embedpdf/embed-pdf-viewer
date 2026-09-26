import {
  EngineError,
  EngineErrorCode,
  protectedCapabilities,
  type DocumentProtection,
  PermissionDenied,
  checkAnyCapability,
  checkCapability,
  checkCollab,
  checkSetGroup,
  collabTargetOf,
  decodePdfBits,
  expandRawScope,
  type AnnotationActor,
  type AnnotationOwner,
  type AnnotationRef,
  type CollabAction,
  type CollabTarget,
  type DocCapability,
} from '@embedpdf/engine-core/runtime';

import type { HandleScopeContext } from './HandleScopeContext';

/**
 * Per-handle authorization helper. Wraps the shared scope resolver
 * (`@embedpdf/engine-core/runtime`) bound to one handle's scope +
 * identity + PDF bits, and exposes assertion-style methods that throw
 * `PermissionDenied` on deny.
 *
 * Services constructed by `LocalDocumentHandle` take a `ScopeGuard`
 * the same way they already take a `DocClosedView` — a small adapter
 * with focused methods, easy to mock in tests.
 *
 * Cloud parity: every method here corresponds to a check the cloud
 * route layer performs in `jwt-plugin.ts` / `routes/annotations.ts`.
 * The same scope string produces the same allow/deny on both engines.
 */
export class ScopeGuard {
  private protection: DocumentProtection | null;

  constructor(private ctx: HandleScopeContext) {
    this.protection = ctx.signedDocumentPolicy === 'protect' ? ctx.protection : null;
  }

  /**
   * Replace the file's own permission bits after an unlock loaded it with
   * another password: the owner password lifts the file's restrictions,
   * and a file opened locked only now has bits at all. What `pdf.permissions`
   * grants follows.
   */
  setPdfPermissions(pdfPermissionsBits: number | null): void {
    this.ctx = { ...this.ctx, pdfBits: decodePdfBits(pdfPermissionsBits) };
  }

  /** The signature-derived restrictions this guard subtracts (`null` when none apply). */
  currentProtection(): DocumentProtection | null {
    return this.protection;
  }

  /**
   * Replace the protection after the document's signatures changed (an
   * unlock probed them, a signing completed). Ignored under
   * `signedDocumentPolicy: 'permit'`.
   */
  setProtection(protection: DocumentProtection | null): void {
    this.protection = this.ctx.signedDocumentPolicy === 'protect' ? protection : null;
  }

  /** Who the handle acts for, as supplied to `open()`. */
  identity(): HandleScopeContext['identity'] {
    return this.ctx.identity;
  }

  /** Raw scope array as supplied to `open()`. */
  rawScope(): ReadonlyArray<string> {
    return this.ctx.scope;
  }

  /**
   * Concrete capability set after `pdf.permissions` expansion plus the
   * resolver's implication rules. Useful for surfaces that want to
   * report "what can this handle actually do" (mirrors the cloud's
   * `/access` effectiveScope).
   */
  effectiveScope(): DocCapability[] {
    return [
      ...expandRawScope(this.ctx.scope, this.ctx.pdfBits, this.protection),
    ].sort() as DocCapability[];
  }

  /**
   * Non-throwing capability check — the same predicate `assertCapability`
   * uses, exposed for UI gating (`DocumentSecurityService.allows`). Honors
   * the `*` wildcard and `pdf.permissions` bits, so a gated control mirrors
   * exactly what `assertCapability` would let through.
   */
  can(cap: DocCapability): boolean {
    return checkCapability(cap, this.ctx.scope, this.ctx.pdfBits, this.protection);
  }

  /**
   * Throws if `cap` is not available: `ProtectedDocument` when a signature
   * in the document took it away (the message names the restriction),
   * `PermissionDenied` when the scope never granted it.
   */
  assertCapability(cap: DocCapability): void {
    if (!this.can(cap)) {
      if (protectedCapabilities(this.protection).has(cap)) {
        throw new EngineError(
          EngineErrorCode.ProtectedDocument,
          describeProtection(cap, this.protection!),
        );
      }
      throw new PermissionDenied(cap, 'engine-local');
    }
  }

  /**
   * Throws `PermissionDenied` if the scope grants none of `caps`. Used
   * by routes whose underlying endpoint is satisfied by more than one
   * capability (currently unused locally; reserved for future shapes
   * like `/text` which the cloud gates on `doc.text.copy OR doc.text.search`).
   */
  assertAnyCapability(caps: ReadonlyArray<DocCapability>): void {
    if (!checkAnyCapability(caps, this.ctx.scope, this.ctx.pdfBits, this.protection)) {
      throw new PermissionDenied(caps[0] ?? 'doc.open', 'engine-local', caps);
    }
  }

  /**
   * Throws `PermissionDenied` if the scope doesn't grant the collab
   * action against `target`. POST handlers compute `target` from
   * the caller's identity (effective userId/groupId, possibly with
   * draft overrides); PATCH/DELETE handlers compute it from the
   * existing annotation row.
   */
  /**
   * Non-throwing collab check — the same predicate `assertCollab`
   * enforces with, surfaced so the security service can mirror
   * per-record authorization for UI gating.
   */
  canCollab(action: CollabAction, target: CollabTarget): boolean {
    // A declared signature constraint outranks the caller's collab
    // authority, exactly as it outranks a capability grant.
    if (protectedCapabilities(this.protection).has('doc.annotate.modify')) return false;
    return checkCollab(action, target, this.ctx.scope, this.ctx.identity, this.ctx.pdfBits);
  }

  /** Non-throwing destination-group check — see `assertSetGroup`. */
  canSetGroup(newGroupId: string): boolean {
    return checkSetGroup(newGroupId, this.ctx.identity.groupId, this.ctx.scope, this.ctx.pdfBits);
  }

  assertCollab(action: CollabAction, target: CollabTarget): void {
    this.assertAnnotationsUnprotected();
    if (!this.canCollab(action, target)) {
      throw new PermissionDenied(`annotations:${action}`, 'engine-local');
    }
  }

  /**
   * {@link assertCollab} over annotations one write changes together (a
   * thread's delete): all or nothing, `PermissionDenied` naming every one
   * refused.
   */
  assertCollabEach(
    action: CollabAction,
    annotations: readonly (AnnotationOwner & { ref: AnnotationRef })[],
  ): void {
    this.assertAnnotationsUnprotected();
    const refused = annotations.filter(
      (annotation) => !this.canCollab(action, collabTargetOf(annotation)),
    );
    if (refused.length > 0) {
      throw new PermissionDenied(
        `annotations:${action}`,
        'engine-local',
        undefined,
        refused.map((annotation) => annotation.ref),
      );
    }
  }

  private assertAnnotationsUnprotected(): void {
    if (protectedCapabilities(this.protection).has('doc.annotate.modify')) {
      throw new EngineError(
        EngineErrorCode.ProtectedDocument,
        describeProtection('doc.annotate.modify', this.protection!),
      );
    }
  }

  /**
   * Throws `PermissionDenied` if the scope doesn't grant set-group
   * authority for `newGroupId`. No-op when `newGroupId` matches the
   * caller's JWT-default group (no reassignment is happening).
   */
  assertSetGroup(newGroupId: string | undefined): void {
    if (newGroupId === undefined) return;
    if (!this.canSetGroup(newGroupId)) {
      throw new PermissionDenied(`annotations:set-group:group=${newGroupId}`, 'engine-local');
    }
  }

  /**
   * Build the actor that the worker stamps onto a newly created
   * annotation. Identity is sourced from the handle's open-time
   * identity (parity with the cloud's `doc.annotate.create`
   * capability, which stamps the caller's JWT identity).
   *
   *   userId      → /EMBD_Metadata/UserID,CreatedBy,UpdatedBy
   *   groupId     → /EMBD_Metadata/GroupID
   *   displayName → /T (the standard PDF "author" display field)
   *
   * `groupId` is the group the caller chose for the annotation, checked
   * with {@link assertSetGroup} beforehand; it defaults to the identity's.
   *
   * Returns `undefined` when the handle has no identity fields at all
   * (anonymous local handle) — the worker still writes /M but skips
   * both /T and /EMBD_Metadata.
   */
  actorForCreate(
    groupId: string | undefined = this.ctx.identity.groupId,
  ): AnnotationActor | undefined {
    const id = this.ctx.identity;
    const actor: AnnotationActor = {
      ...(id.userId !== undefined ? { userId: id.userId } : {}),
      ...(groupId !== undefined ? { groupId } : {}),
      ...(id.displayName !== undefined ? { displayName: id.displayName } : {}),
    };
    return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
  }

  /**
   * Build the CollabTarget for create — the handle's own identity, in
   * the group the annotation is created in (the identity's unless the
   * caller chose one). Fed to `assertCollab('create', target)` so
   * `:self`/`:all` trivially pass and `:group=X` is meaningful.
   */
  targetForSelfCreate(groupId: string | undefined = this.ctx.identity.groupId): CollabTarget {
    const id = this.ctx.identity;
    return {
      ...(id.userId !== undefined ? { userId: id.userId } : {}),
      ...(groupId !== undefined ? { groupId } : {}),
    };
  }

  /**
   * Build the actor for an annotation update.
   *   - userId      → caller's identity (UpdatedBy stamp)
   *   - groupId     → only when the patch reassigns it (differs from current)
   *   - displayName → caller's displayName (for the modification trail;
   *                   the worker does not touch /T on update)
   *
   * No set-group check here — call `assertSetGroup` separately first,
   * before producing the actor.
   */
  actorForUpdate(
    currentGroupId: string | undefined,
    patchGroupId: string | undefined,
  ): AnnotationActor | undefined {
    const id = this.ctx.identity;
    const isReassigning = patchGroupId !== undefined && patchGroupId !== currentGroupId;
    const actor: AnnotationActor = {
      ...(id.userId !== undefined ? { userId: id.userId } : {}),
      ...(id.displayName !== undefined ? { displayName: id.displayName } : {}),
      ...(isReassigning ? { groupId: patchGroupId } : {}),
    };
    return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
  }
}

function describeProtection(cap: DocCapability, protection: DocumentProtection): string {
  const cause = protection.certification
    ? `certification signature ${protection.certification.signatureIndex} (permission ${protection.certification.permission})`
    : `an existing signature (declared level '${protection.enforced ?? 'none declared'}')`;
  return `the document is signed: ${cause} forbids '${cap}'`;
}
