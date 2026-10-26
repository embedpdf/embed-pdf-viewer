import {
  ShareGrantCreateRequestSchema,
  ShareGrantListQuerySchema,
  ShareGrantUpdateRequestSchema,
  ShareVisitorListQuerySchema,
  adminOperations,
  type AdminOperation,
} from '@cloudpdf/contract';
import { validateScopeArray } from '@embedpdf/engine-core/runtime';
import { DEFAULT_LAYER_NAME } from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { decodeListCursor, encodeListCursor } from './_cursor';
import { formatIssues } from './_issues';
import { requireTenantAccess } from '../../app/jwt-plugin';
import { hashSharePassword } from '../../auth/share-password';
import { isVisitorLayerName, VISITOR_LAYER_PREFIX } from '../../auth/visitor-handle';
import type { DocumentsRepo } from '../../db/repos/documents.repo';
import type { LayersRepo } from '../../db/repos/page_state.repo';
import type { ListedShareVisitor, ShareVisitorsRepo } from '../../db/repos/share_visitors.repo';
import type { SecurityEventsRepo } from '../../db/repos/security-events.repo';
import type {
  ShareGrantRow,
  ShareGrantsRepo,
  ShareLayerMode,
} from '../../db/repos/share_grants.repo';

export interface AdminSharesRoutesDeps {
  grants: ShareGrantsRepo;
  documents: DocumentsRepo;
  /** A link can't name a deleted layer: its name is refused for good. */
  layers: LayersRepo;
  /** A link with visitors is archived, never deleted. */
  visitors: ShareVisitorsRepo;
  /** `deleteVisitor` from `services/shareVisitors`: their answers and their own layer. */
  deleteVisitor: (visitor: {
    tenantId: string;
    grantId: string;
    visitorId: string;
    docId: string;
  }) => Promise<void>;
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
  const { grants, documents, layers, visitors, deleteVisitor, securityEvents } = deps;

  /**
   * Why a link can't take this layer, or `null`. A per-visitor link names
   * none (each visitor gets their own); a shared one names a layer that
   * isn't a visitor's and wasn't deleted (`LayerDeleted` throws).
   */
  const refuseLayer = async (
    docId: string,
    layerMode: ShareLayerMode,
    layerName: string | undefined,
  ): Promise<string | null> => {
    if (layerMode === 'per-visitor') {
      return layerName === undefined
        ? null
        : 'layerName: a per-visitor link names no layer; each visitor gets their own';
    }
    if (layerName !== undefined && isVisitorLayerName(layerName)) {
      return `layerName: names starting with "${VISITOR_LAYER_PREFIX}" are for visitors' own layers`;
    }
    await layers.findByDocAndName(docId, layerName ?? DEFAULT_LAYER_NAME);
    return null;
  };

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
    const settingsRefusal = refuseLinkSettings(body);
    if (settingsRefusal) {
      return reply.code(400).send({ error: { code: 'InvalidArg', message: settingsRefusal } });
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
    const layerMode = body.layerMode ?? 'shared';
    const refusal = await refuseLayer(doc.id, layerMode, body.layerName);
    if (refusal) return reply.code(400).send({ error: { code: 'InvalidArg', message: refusal } });
    const grant = await grants.create({
      tenantId,
      docId: body.docId,
      layerMode,
      ...(body.layerName !== undefined ? { layerName: body.layerName } : {}),
      ...(body.keepVisitorLayers !== undefined
        ? { keepVisitorLayers: body.keepVisitorLayers }
        : {}),
      ...(body.visitorIdleSeconds !== undefined
        ? { visitorIdleSeconds: body.visitorIdleSeconds }
        : {}),
      ...(body.visitorIdentity !== undefined ? { visitorIdentity: body.visitorIdentity } : {}),
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
    const { limit, cursor, docId, archived } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);
    const rows = await grants.list({
      tenantId,
      ...(docId !== undefined ? { docId } : {}),
      ...(archived !== undefined ? { archived } : {}),
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
    const settingsRefusal = refuseLinkSettings(body);
    if (settingsRefusal) {
      return reply.code(400).send({ error: { code: 'InvalidArg', message: settingsRefusal } });
    }
    const existing = await grants.findById(shareId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    if (existing.archivedAt !== null) return archivedConflict(reply, shareId);
    const layerMode = body.layerMode ?? existing.layerMode;
    const layerChanges = body.layerMode !== undefined || body.layerName !== undefined;
    if (layerChanges) {
      const refusal = await refuseLayer(existing.docId, layerMode, body.layerName);
      if (refusal) {
        return reply.code(400).send({ error: { code: 'InvalidArg', message: refusal } });
      }
    }
    const updated = await grants.update(shareId, tenantId, {
      ...(layerChanges
        ? {
            layer:
              layerMode === 'shared'
                ? {
                    mode: 'shared' as const,
                    name: body.layerName ?? existing.layerName ?? DEFAULT_LAYER_NAME,
                  }
                : { mode: 'per-visitor' as const },
          }
        : {}),
      ...(body.keepVisitorLayers !== undefined
        ? { keepVisitorLayers: body.keepVisitorLayers }
        : {}),
      ...(body.visitorIdleSeconds !== undefined
        ? { visitorIdleSeconds: body.visitorIdleSeconds }
        : {}),
      ...(body.visitorIdentity !== undefined ? { visitorIdentity: body.visitorIdentity } : {}),
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

  const archiveOp = adminOperations['shares.archive'];
  mount(archiveOp, async (req, reply) => {
    const { tenantId, shareId } = req.params as { tenantId: string; shareId: string };
    const ctx = requireTenantAccess(req, tenantId, archiveOp.scope);
    const existing = await grants.findById(shareId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    const archived = await grants.archive(shareId, tenantId);
    if (!archived) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    if (existing.archivedAt === null) {
      await securityEvents.append({
        tenantId,
        kind: 'share.archived',
        jti: shareId,
        docId: archived.docId,
        scope: archived.scope,
        actor: ctx.sub,
        via: ctx.via,
      });
    }
    return reply.send({ share: sharePublic(archived) });
  });

  const visitorsListOp = adminOperations['shares.visitors.list'];
  mount(visitorsListOp, async (req, reply) => {
    const { tenantId, shareId } = req.params as { tenantId: string; shareId: string };
    requireTenantAccess(req, tenantId, visitorsListOp.scope);
    const parsed = ShareVisitorListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const grant = await grants.findById(shareId);
    if (!grant || grant.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    const { limit, cursor } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);
    const rows = await visitors.list(shareId, { limit: limit + 1, ...(before ? { before } : {}) });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeListCursor({ createdAt: last.firstSeenAt, id: last.visitorId })
        : null;
    return reply.send({ visitors: page.map(visitorPublic), nextCursor });
  });

  const visitorsDeleteOp = adminOperations['shares.visitors.delete'];
  mount(visitorsDeleteOp, async (req, reply) => {
    const { tenantId, shareId, visitorId } = req.params as {
      tenantId: string;
      shareId: string;
      visitorId: string;
    };
    requireTenantAccess(req, tenantId, visitorsDeleteOp.scope);
    if (!VISITOR_ID.test(visitorId)) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: `not a visitor id: ${visitorId}` } });
    }
    // An archived link's visitors can be deleted too: erasing someone's
    // answers never waits on the link.
    const grant = await grants.findById(shareId);
    if (!grant || grant.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `share does not exist: ${shareId}` } });
    }
    await deleteVisitor({ tenantId, grantId: shareId, visitorId, docId: grant.docId });
    return reply.code(204).send();
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
    // Deleting a link never deletes its visitors (their answers, their
    // layers): one that has any is archived instead.
    const [visitorLayers, visitorCount] = await Promise.all([
      layers.countForGrant(shareId),
      visitors.countForGrant(shareId),
    ]);
    if (visitorLayers > 0 || visitorCount > 0) {
      return reply.code(409).send({
        error: {
          code: 'Conflict',
          message: `share ${shareId} has visitors (${visitorCount}) or visitors' layers (${visitorLayers}): archive it instead, or delete them first`,
          details: { visitors: visitorCount, visitorLayers },
        },
      });
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

/**
 * Why a link's settings can't be taken, or `null`: a link that asks its
 * visitors asks at least one field, and links its privacy page over the web.
 */
function refuseLinkSettings(body: {
  visitorIdentity?: { fields: Record<string, unknown>; privacyUrl?: string } | null;
}): string | null {
  const identity = body.visitorIdentity;
  if (identity) {
    if (Object.values(identity.fields).every((asked) => asked === undefined)) {
      return 'visitorIdentity.fields: ask at least one field, or set visitorIdentity to null';
    }
    if (identity.privacyUrl !== undefined && !/^https?:\/\//.test(identity.privacyUrl)) {
      return 'visitorIdentity.privacyUrl: must be an http or https URL';
    }
  }
  return null;
}

const VISITOR_ID = /^[0-9a-f]{24}$/;

/** An archived link is final: it takes no more changes. */
function archivedConflict(reply: FastifyReply, shareId: string): FastifyReply {
  return reply.code(409).send({
    error: {
      code: 'Conflict',
      message: `share ${shareId} is archived: create a new link to share again`,
    },
  });
}

/** Wire shape of a visitor (`ShareVisitorRecord`). */
function visitorPublic(v: ListedShareVisitor): Record<string, unknown> {
  return {
    visitorId: v.visitorId,
    answers: v.answers,
    emailVerified: v.emailVerifiedAt !== null,
    consentedAt: v.consentedAt,
    firstSeenAt: v.firstSeenAt,
    lastSeenAt: v.lastSeenAt,
    layer: v.layer ? { layerName: v.layer.name, storageSizeBytes: v.layer.storageSizeBytes } : null,
  };
}

/** Wire shape: the scrypt envelope never leaves the row. */
function sharePublic(g: ShareGrantRow): Record<string, unknown> {
  return {
    id: g.id,
    tenantId: g.tenantId,
    docId: g.docId,
    layerMode: g.layerMode,
    layerName: g.layerName,
    keepVisitorLayers: g.keepVisitorLayers,
    visitorIdleSeconds: g.visitorIdleSeconds,
    visitorIdentity: g.visitorIdentity,
    scope: [...g.scope],
    origins: g.origins ? [...g.origins] : null,
    passwordProtected: g.passwordHash !== null,
    sessionTtlSeconds: g.sessionTtlSeconds,
    disabled: g.disabled,
    archivedAt: g.archivedAt,
    expiresAt: g.expiresAt,
    exchangeCount: g.exchangeCount,
    lastExchangedAt: g.lastExchangedAt,
    createdBy: g.createdBy,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}
