import {
  ShareGrantCreateRequestSchema,
  ShareGrantListQuerySchema,
  ShareGrantUpdateRequestSchema,
  adminOperations,
  type AdminOperation,
} from '@cloudpdf/contract';
import { validateScopeArray } from '@embedpdf/engine-core/runtime';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { decodeListCursor, encodeListCursor } from './_cursor';
import { requireTenantAccess } from '../../app/jwt-plugin';
import { hashSharePassword } from '../../auth/share-password';
import type { DocumentsRepo } from '../../db/repos/documents.repo';
import type { SecurityEventsRepo } from '../../db/repos/security-events.repo';
import type { ShareGrantRow, ShareGrantsRepo } from '../../db/repos/share_grants.repo';

export interface AdminSharesRoutesDeps {
  grants: ShareGrantsRepo;
  documents: DocumentsRepo;
  securityEvents: SecurityEventsRepo;
}

/**
 * Share-grant lifecycle under `/v1/tenants/:tenantId/shares` — the
 * management side of the no-backend embed flow. Everything here is a
 * stored authorization decision; the public consumption side lives in
 * `routes/share-sessions.ts`. Mounted only when the deployment can
 * sign (alongside `tokens.issue` and the exchange route): a grant is a
 * standing mint capability, meaningless where minting is impossible.
 *
 * Create, update, and revoke write `security_events` rows — a grant is
 * durable authority, so its lifecycle belongs in the same append-only
 * trail as token issuance. The grant id rides the `jti` column: it is
 * the credential identifier of the share family.
 */
export async function registerAdminSharesRoutes(
  app: FastifyInstance,
  deps: AdminSharesRoutesDeps,
): Promise<void> {
  const { grants, documents, securityEvents } = deps;

  const mount = (
    op: AdminOperation,
    handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  ): void => {
    app.route({ method: op.method, url: op.path, handler });
  };

  const createOp = adminOperations['shares.create'];
  mount(createOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, createOp.scope);
    const parsed = ShareGrantCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const body = parsed.data;
    try {
      validateScopeArray(body.scope);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: (err as Error).message } });
    }
    const doc = await documents.findById(body.docId);
    if (!doc) {
      return reply.code(404).send({
        error: { code: 'NotFound', message: `document does not exist: ${body.docId}` },
      });
    }
    if (doc.tenantId !== tenantId) {
      return reply.code(403).send({
        error: { code: 'Forbidden', message: 'document does not belong to this tenant' },
      });
    }
    const grant = await grants.create({
      tenantId,
      docId: body.docId,
      ...(body.layerName !== undefined ? { layerName: body.layerName } : {}),
      scope: body.scope,
      ...(body.origins !== undefined ? { origins: body.origins } : {}),
      ...(body.password !== undefined ? { passwordHash: hashSharePassword(body.password) } : {}),
      ...(body.sessionTtlSeconds !== undefined
        ? { sessionTtlSeconds: body.sessionTtlSeconds }
        : {}),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
      createdBy: ctx.sub,
    });
    await securityEvents.append({
      tenantId,
      kind: 'share.created',
      jti: grant.id,
      docId: grant.docId,
      scope: grant.scope,
      actor: ctx.sub,
      via: ctx.via,
      ...(grant.expiresAt !== null ? { expiresAt: grant.expiresAt } : {}),
    });
    return reply.send({ share: sharePublic(grant) });
  });

  const listOp = adminOperations['shares.list'];
  mount(listOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    requireTenantAccess(req, tenantId, listOp.scope);
    const parsed = ShareGrantListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const { limit, cursor, docId } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);
    const rows = await grants.list({
      tenantId,
      ...(docId !== undefined ? { docId } : {}),
      limit: limit + 1,
      ...(before ? { before } : {}),
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeListCursor(last) : null;
    return reply.send({ shares: page.map(sharePublic), nextCursor });
  });

  const getOp = adminOperations['shares.get'];
  mount(getOp, async (req, reply) => {
    const { tenantId, shareId } = req.params as { tenantId: string; shareId: string };
    requireTenantAccess(req, tenantId, getOp.scope);
    const grant = await grants.findById(shareId);
    if (!grant || grant.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    return reply.send({ share: sharePublic(grant) });
  });

  const updateOp = adminOperations['shares.update'];
  mount(updateOp, async (req, reply) => {
    const { tenantId, shareId } = req.params as { tenantId: string; shareId: string };
    const ctx = requireTenantAccess(req, tenantId, updateOp.scope);
    const parsed = ShareGrantUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const body = parsed.data;
    if (body.scope !== undefined) {
      try {
        validateScopeArray(body.scope);
      } catch (err) {
        return reply
          .code(400)
          .send({ error: { code: 'InvalidArg', message: (err as Error).message } });
      }
    }
    const existing = await grants.findById(shareId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    const updated = await grants.update(shareId, tenantId, {
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
      ...(body.origins !== undefined ? { origins: body.origins } : {}),
      ...(body.password !== undefined
        ? { passwordHash: body.password === null ? null : hashSharePassword(body.password) }
        : {}),
      ...(body.sessionTtlSeconds !== undefined
        ? { sessionTtlSeconds: body.sessionTtlSeconds }
        : {}),
      ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
    });
    if (!updated) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    await securityEvents.append({
      tenantId,
      kind: 'share.updated',
      jti: updated.id,
      docId: updated.docId,
      scope: updated.scope,
      actor: ctx.sub,
      via: ctx.via,
      ...(updated.expiresAt !== null ? { expiresAt: updated.expiresAt } : {}),
    });
    return reply.send({ share: sharePublic(updated) });
  });

  const deleteOp = adminOperations['shares.delete'];
  mount(deleteOp, async (req, reply) => {
    const { tenantId, shareId } = req.params as { tenantId: string; shareId: string };
    const ctx = requireTenantAccess(req, tenantId, deleteOp.scope);
    const existing = await grants.findById(shareId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    await grants.delete(shareId, tenantId);
    await securityEvents.append({
      tenantId,
      kind: 'share.revoked',
      jti: shareId,
      docId: existing.docId,
      scope: existing.scope,
      actor: ctx.sub,
      via: ctx.via,
    });
    return reply.code(204).send();
  });
}

/** Wire shape: the scrypt envelope never leaves the row. */
function sharePublic(g: ShareGrantRow): Record<string, unknown> {
  return {
    id: g.id,
    tenantId: g.tenantId,
    docId: g.docId,
    layerName: g.layerName,
    scope: [...g.scope],
    origins: g.origins ? [...g.origins] : null,
    passwordProtected: g.passwordHash !== null,
    sessionTtlSeconds: g.sessionTtlSeconds,
    disabled: g.disabled,
    expiresAt: g.expiresAt,
    exchangeCount: g.exchangeCount,
    lastExchangedAt: g.lastExchangedAt,
    createdBy: g.createdBy,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function formatIssues(issues: Array<{ path: Array<string | number>; message: string }>): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
