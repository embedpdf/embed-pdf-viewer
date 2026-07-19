import {
  PermissionDenied,
  checkAnyCapability,
  checkCapability,
  checkCollab,
  checkSetGroup,
  expandRawScope,
  type AnnotationActor,
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
  constructor(private readonly ctx: HandleScopeContext) {}

  /** Identity claims (user_id, group_id, groups, display_name). */
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
    return [...expandRawScope(this.ctx.scope, this.ctx.pdfBits)].sort() as DocCapability[];
  }

  /**
   * Non-throwing capability check — the same predicate `assertCapability`
   * uses, exposed for UI gating (`DocumentSecurityService.allows`). Honors
   * the `*` wildcard and `pdf.permissions` bits, so a gated control mirrors
   * exactly what `assertCapability` would let through.
   */
  can(cap: DocCapability): boolean {
    return checkCapability(cap, this.ctx.scope, this.ctx.pdfBits);
  }

  /** Throws `PermissionDenied` if the scope doesn't grant `cap`. */
  assertCapability(cap: DocCapability): void {
    if (!this.can(cap)) {
      throw new PermissionDenied(cap, 'engine-local');
    }
  }

  /**
   * Throws `PermissionDenied` if the scope grants NONE of `caps`. Used
   * by routes whose underlying endpoint is satisfied by more than one
   * capability (currently unused locally; reserved for future shapes
   * like `/text` which the cloud gates on `doc.text.copy OR doc.text.search`).
   */
  assertAnyCapability(caps: ReadonlyArray<DocCapability>): void {
    if (!checkAnyCapability(caps, this.ctx.scope, this.ctx.pdfBits)) {
      throw new PermissionDenied(`one of: ${caps.join(', ')}`, 'engine-local');
    }
  }

  /**
   * Throws `PermissionDenied` if the scope doesn't grant the collab
   * action against `target`. POST handlers compute `target` from
   * the caller's identity (effective userId/groupId, possibly with
   * draft overrides); PATCH/DELETE handlers compute it from the
   * existing annotation row.
   */
  assertCollab(action: CollabAction, target: CollabTarget): void {
    if (!checkCollab(action, target, this.ctx.scope, this.ctx.identity, this.ctx.pdfBits)) {
      throw new PermissionDenied(`annotations:${action}`, 'engine-local');
    }
  }

  /**
   * Throws `PermissionDenied` if the scope doesn't grant set-group
   * authority for `newGroupId`. No-op when `newGroupId` matches the
   * caller's JWT-default group (no reassignment is happening).
   */
  assertSetGroup(newGroupId: string | undefined): void {
    if (newGroupId === undefined) return;
    if (!checkSetGroup(newGroupId, this.ctx.identity.group_id, this.ctx.scope, this.ctx.pdfBits)) {
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
   * Returns `undefined` when the handle has no identity fields at all
   * (anonymous local handle) — the worker still writes /M but skips
   * both /T and /EMBD_Metadata.
   */
  actorForCreate(): AnnotationActor | undefined {
    const id = this.ctx.identity;
    const actor: AnnotationActor = {
      ...(id.user_id !== undefined ? { userId: id.user_id } : {}),
      ...(id.group_id !== undefined ? { groupId: id.group_id } : {}),
      ...(id.display_name !== undefined ? { displayName: id.display_name } : {}),
    };
    return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
  }

  /**
   * Build the CollabTarget for CREATE — the handle's own identity.
   * Fed to `assertCollab('create', target)` so `:self`/`:all` trivially
   * pass and `:group=X` is meaningful (matches when the handle's
   * default group is X).
   */
  targetForSelfCreate(): CollabTarget {
    const id = this.ctx.identity;
    return {
      ...(id.user_id !== undefined ? { userId: id.user_id } : {}),
      ...(id.group_id !== undefined ? { groupId: id.group_id } : {}),
    };
  }

  /**
   * Build the actor for an annotation UPDATE.
   *   - userId      → caller's identity (UpdatedBy stamp)
   *   - groupId     → ONLY when the patch reassigns it (differs from current)
   *   - displayName → caller's display_name (for the modification trail;
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
      ...(id.user_id !== undefined ? { userId: id.user_id } : {}),
      ...(id.display_name !== undefined ? { displayName: id.display_name } : {}),
      ...(isReassigning ? { groupId: patchGroupId } : {}),
    };
    return actor.userId || actor.groupId || actor.displayName ? actor : undefined;
  }
}
