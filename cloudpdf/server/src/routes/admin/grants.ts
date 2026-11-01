import {
  GrantCreateRequestSchema,
  GrantListQuerySchema,
  GrantUpdateRequestSchema,
  GrantVisitorListQuerySchema,
  adminOperations,
  type AdminOperation,
} from '@cloudpdf/contract';
import { validateScopeArray, type Identity } from '@embedpdf/engine-core/runtime';
import { DEFAULT_LAYER_NAME } from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { decodeListCursor, encodeListCursor } from './_cursor';
import { formatIssues } from './_issues';
import { requireHeldScope, requireTenantAccess } from '../../app/jwt-plugin';
import { hashGrantPassphrase } from '../../auth/grant-passphrase';
import type { PermissionRegistry } from '../../auth/permission-registry';
import { isVisitorLayerName, VISITOR_LAYER_PREFIX } from '../../auth/visitor-handle';
import type { DocumentsRepo } from '../../db/repos/documents.repo';
import type { GrantVisitorsRepo, ListedGrantVisitor } from '../../db/repos/grant_visitors.repo';
import type { GrantLayerMode, GrantRow, GrantsRepo } from '../../db/repos/grants.repo';
import type { LayersRepo } from '../../db/repos/page_state.repo';
import type { SecurityEventsRepo } from '../../db/repos/security-events.repo';

export interface AdminGrantsRoutesDeps {
  grants: GrantsRepo;
  /** The installed plugins' permissions: a grant may give only those. */
  permissions: PermissionRegistry;
  documents: DocumentsRepo;
  /** A grant can't name a deleted layer: its name is refused for good. */
  layers: LayersRepo;
  /** A grant with visitors is archived, never deleted. */
  visitors: GrantVisitorsRepo;
  /** `deleteVisitor` from `services/grantVisitors`: their answers and their own layer. */
  deleteVisitor: (visitor: {
    tenantId: string;
    grantId: string;
    visitorId: string;
    docId: string;
  }) => Promise<void>;
  securityEvents: SecurityEventsRepo;
}

/**
 * Grant lifecycle under `/v1/tenants/:tenantId/grants` — the
 * management side of the no-backend embed flow. Everything here is a
 * stored authorization decision; the public consumption side lives in
 * `routes/grant-sessions.ts`. Mounted only when the deployment can
 * sign (alongside `tokens.issue` and the exchange route): a grant is a
 * standing mint capability, meaningless where minting is impossible.
 *
 * A grant's scope follows `tokens.issue`'s rule, because every visitor
 * gets it: a tenant JWT gives only document permissions it holds itself.
 *
 * Create, update, and revoke write `security_events` rows — a grant is
 * durable authority, so its lifecycle belongs in the same append-only
 * trail as token issuance. The grant id rides the `jti` column: it is
 * the credential identifier of the grant family.
 */
export async function registerAdminGrantsRoutes(
  app: FastifyInstance,
  deps: AdminGrantsRoutesDeps,
): Promise<void> {
  const { grants, documents, layers, visitors, deleteVisitor, securityEvents } = deps;

  /**
   * Why a grant can't take this layer, or `null`. A per-visitor grant names
   * none (each visitor gets their own); a shared one names a layer that
   * isn't a visitor's and wasn't deleted (`LayerDeleted` throws).
   */
  const refuseLayer = async (
    docId: string,
    layerMode: GrantLayerMode,
    layerName: string | undefined,
  ): Promise<string | null> => {
    if (layerMode === 'per-visitor') {
      return layerName === undefined
        ? null
        : 'layerName: a per-visitor grant names no layer; each visitor gets their own';
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

  const createOp = adminOperations['grants.create'];
  mount(createOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, createOp.scope);
    const parsed = GrantCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const body = parsed.data;
    try {
      validateScopeArray(body.scope);
      deps.permissions.assertGrantable(body.scope);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: (err as Error).message } });
    }
    requireHeldScope(req, body.scope);
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
      ...(body.name !== undefined ? { name: body.name } : {}),
      layerMode,
      ...(body.layerName !== undefined ? { layerName: body.layerName } : {}),
      ...(body.keepVisitorLayers !== undefined
        ? { keepVisitorLayers: body.keepVisitorLayers }
        : {}),
      ...(body.visitorIdleSeconds !== undefined
        ? { visitorIdleSeconds: body.visitorIdleSeconds }
        : {}),
      ...(body.visitorIdentity !== undefined ? { visitorIdentity: body.visitorIdentity } : {}),
      ...(body.identity !== undefined ? { identity: body.identity } : {}),
      scope: body.scope,
      ...(body.origins !== undefined ? { origins: body.origins } : {}),
      ...(body.passphrase !== undefined
        ? { passphraseHash: hashGrantPassphrase(body.passphrase) }
        : {}),
      ...(body.sessionTtlSeconds !== undefined
        ? { sessionTtlSeconds: body.sessionTtlSeconds }
        : {}),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
      createdBy: ctx.sub,
    });
    await securityEvents.append({
      tenantId,
      kind: 'grant.created',
      jti: grant.id,
      docId: grant.docId,
      scope: grant.scope,
      actor: ctx.sub,
      via: ctx.via,
      ...(grant.expiresAt !== null ? { expiresAt: grant.expiresAt } : {}),
    });
    return reply.send({ grant: grantPublic(grant) });
  });

  const listOp = adminOperations['grants.list'];
  mount(listOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    requireTenantAccess(req, tenantId, listOp.scope);
    const parsed = GrantListQuerySchema.safeParse(req.query ?? {});
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
    return reply.send({ grants: page.map(grantPublic), nextCursor });
  });

  const getOp = adminOperations['grants.get'];
  mount(getOp, async (req, reply) => {
    const { tenantId, grantId } = req.params as { tenantId: string; grantId: string };
    requireTenantAccess(req, tenantId, getOp.scope);
    const grant = await grants.findById(grantId);
    if (!grant || grant.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    return reply.send({ grant: grantPublic(grant) });
  });

  const updateOp = adminOperations['grants.update'];
  mount(updateOp, async (req, reply) => {
    const { tenantId, grantId } = req.params as { tenantId: string; grantId: string };
    const ctx = requireTenantAccess(req, tenantId, updateOp.scope);
    const parsed = GrantUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const body = parsed.data;
    if (body.scope !== undefined) {
      try {
        validateScopeArray(body.scope);
        deps.permissions.assertGrantable(body.scope);
      } catch (err) {
        return reply
          .code(400)
          .send({ error: { code: 'InvalidArg', message: (err as Error).message } });
      }
      requireHeldScope(req, body.scope);
    }
    const existing = await grants.findById(grantId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    if (existing.archivedAt !== null) return archivedConflict(reply, grantId);
    // The grant as it will be: what it asks and what it says are checked together.
    const settingsRefusal = refuseLinkSettings({
      visitorIdentity:
        body.visitorIdentity !== undefined ? body.visitorIdentity : existing.visitorIdentity,
      identity: body.identity !== undefined ? body.identity : existing.identity,
    });
    if (settingsRefusal) {
      return reply.code(400).send({ error: { code: 'InvalidArg', message: settingsRefusal } });
    }
    const layerMode = body.layerMode ?? existing.layerMode;
    const layerChanges = body.layerMode !== undefined || body.layerName !== undefined;
    if (layerChanges) {
      const refusal = await refuseLayer(existing.docId, layerMode, body.layerName);
      if (refusal) {
        return reply.code(400).send({ error: { code: 'InvalidArg', message: refusal } });
      }
    }
    const updated = await grants.update(grantId, tenantId, {
      ...(body.name !== undefined ? { name: body.name } : {}),
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
      ...(body.identity !== undefined ? { identity: body.identity } : {}),
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
      ...(body.origins !== undefined ? { origins: body.origins } : {}),
      ...(body.passphrase !== undefined
        ? {
            passphraseHash: body.passphrase === null ? null : hashGrantPassphrase(body.passphrase),
          }
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
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    await securityEvents.append({
      tenantId,
      kind: 'grant.updated',
      jti: updated.id,
      docId: updated.docId,
      scope: updated.scope,
      actor: ctx.sub,
      via: ctx.via,
      ...(updated.expiresAt !== null ? { expiresAt: updated.expiresAt } : {}),
    });
    return reply.send({ grant: grantPublic(updated) });
  });

  const archiveOp = adminOperations['grants.archive'];
  mount(archiveOp, async (req, reply) => {
    const { tenantId, grantId } = req.params as { tenantId: string; grantId: string };
    const ctx = requireTenantAccess(req, tenantId, archiveOp.scope);
    const existing = await grants.findById(grantId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    const archived = await grants.archive(grantId, tenantId);
    if (!archived) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    if (existing.archivedAt === null) {
      await securityEvents.append({
        tenantId,
        kind: 'grant.archived',
        jti: grantId,
        docId: archived.docId,
        scope: archived.scope,
        actor: ctx.sub,
        via: ctx.via,
      });
    }
    return reply.send({ grant: grantPublic(archived) });
  });

  const visitorsListOp = adminOperations['grants.visitors.list'];
  mount(visitorsListOp, async (req, reply) => {
    const { tenantId, grantId } = req.params as { tenantId: string; grantId: string };
    requireTenantAccess(req, tenantId, visitorsListOp.scope);
    const parsed = GrantVisitorListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const grant = await grants.findById(grantId);
    if (!grant || grant.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    const { limit, cursor } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);
    const rows = await visitors.list(grantId, { limit: limit + 1, ...(before ? { before } : {}) });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeListCursor({ createdAt: last.firstSeenAt, id: last.visitorId })
        : null;
    return reply.send({ visitors: page.map(visitorPublic), nextCursor });
  });

  const visitorsDeleteOp = adminOperations['grants.visitors.delete'];
  mount(visitorsDeleteOp, async (req, reply) => {
    const { tenantId, grantId, visitorId } = req.params as {
      tenantId: string;
      grantId: string;
      visitorId: string;
    };
    requireTenantAccess(req, tenantId, visitorsDeleteOp.scope);
    if (!VISITOR_ID.test(visitorId)) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: `not a visitor id: ${visitorId}` } });
    }
    // An archived grant's visitors can be deleted too: erasing someone's
    // answers never waits on the grant.
    const grant = await grants.findById(grantId);
    if (!grant || grant.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    await deleteVisitor({ tenantId, grantId, visitorId, docId: grant.docId });
    return reply.code(204).send();
  });

  const deleteOp = adminOperations['grants.delete'];
  mount(deleteOp, async (req, reply) => {
    const { tenantId, grantId } = req.params as { tenantId: string; grantId: string };
    const ctx = requireTenantAccess(req, tenantId, deleteOp.scope);
    const existing = await grants.findById(grantId);
    if (!existing || existing.tenantId !== tenantId) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `grant does not exist: ${grantId}` } });
    }
    // Deleting a grant never deletes its visitors (their answers, their
    // layers): one that has any is archived instead.
    const [visitorLayers, visitorCount] = await Promise.all([
      layers.countForGrant(grantId),
      visitors.countForGrant(grantId),
    ]);
    if (visitorLayers > 0 || visitorCount > 0) {
      return reply.code(409).send({
        error: {
          code: 'Conflict',
          message: `grant ${grantId} has visitors (${visitorCount}) or visitors' layers (${visitorLayers}): archive it instead, or delete them first`,
          details: { visitors: visitorCount, visitorLayers },
        },
      });
    }
    await grants.delete(grantId, tenantId);
    await securityEvents.append({
      tenantId,
      kind: 'grant.revoked',
      jti: grantId,
      docId: existing.docId,
      scope: existing.scope,
      actor: ctx.sub,
      via: ctx.via,
    });
    return reply.code(204).send();
  });
}

/**
 * Why a grant's settings can't be taken, or `null`: a grant that asks its
 * visitors asks at least one field, and grants its privacy page over the web;
 * a grant that says who its visitors are says something, and never also asks
 * a field it sets (the answer would be ignored).
 */
function refuseLinkSettings(body: {
  visitorIdentity?: { fields: Record<string, unknown>; privacyUrl?: string } | null;
  identity?: Identity | null;
}): string | null {
  const asks = body.visitorIdentity;
  if (asks) {
    if (Object.values(asks.fields).every((asked) => asked === undefined)) {
      return 'visitorIdentity.fields: ask at least one field, or set visitorIdentity to null';
    }
    if (asks.privacyUrl !== undefined && !/^https?:\/\//.test(asks.privacyUrl)) {
      return 'visitorIdentity.privacyUrl: must be an http or https URL';
    }
  }
  const says = body.identity;
  if (says) {
    const set = Object.entries(says)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);
    if (set.length === 0) return 'identity: set at least one field, or set identity to null';
    const both = asks ? set.filter((field) => asks.fields[field] !== undefined) : [];
    if (both.length > 0) {
      return `visitorIdentity.fields: the grant's identity sets ${both.join(', ')}, so it can't ask for it`;
    }
  }
  return null;
}

const VISITOR_ID = /^[0-9a-f]{24}$/;

/** An archived grant is final: it takes no more changes. */
function archivedConflict(reply: FastifyReply, grantId: string): FastifyReply {
  return reply.code(409).send({
    error: {
      code: 'Conflict',
      message: `grant ${grantId} is archived: create a new grant to give access again`,
    },
  });
}

/** Wire shape of a visitor (`GrantVisitorRecord`). */
function visitorPublic(v: ListedGrantVisitor): Record<string, unknown> {
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
function grantPublic(g: GrantRow): Record<string, unknown> {
  return {
    id: g.id,
    tenantId: g.tenantId,
    docId: g.docId,
    name: g.name,
    layerMode: g.layerMode,
    layerName: g.layerName,
    keepVisitorLayers: g.keepVisitorLayers,
    visitorIdleSeconds: g.visitorIdleSeconds,
    visitorIdentity: g.visitorIdentity,
    identity: g.identity,
    scope: [...g.scope],
    origins: g.origins ? [...g.origins] : null,
    passphraseProtected: g.passphraseHash !== null,
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
