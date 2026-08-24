import {
  AdminTenantCreateRequestSchema,
  AdminTenantListQuerySchema,
  TenantSuspendRequestSchema,
  TenantUsageQuerySchema,
  adminOperations,
  type AdminOperation,
} from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { decodeListCursor, encodeListCursor } from './_cursor';
import { requireApiToken, requireTenantAccess } from '../../app/jwt-plugin';
import type { SuspendedTenantsGuard } from '../../auth/SuspendedTenantsGuard';
import type { SecurityEventsRepo } from '../../db/repos/security-events.repo';
import type { TenantUsageRepo } from '../../db/repos/tenant_usage.repo';
import type { TenantRow, TenantsRepo } from '../../db/repos/tenants.repo';
import { StorageKeys } from '../../storage/keys';
import type { ObjectStore } from '../../storage/ObjectStore';

export interface AdminTenantsRouteDeps {
  tenants: TenantsRepo;
  storage: ObjectStore;
  securityEvents: SecurityEventsRepo;
  suspendedTenants: SuspendedTenantsGuard;
  tenantUsage: TenantUsageRepo;
}

/**
 * The `/v1/tenants` collection — tenant lifecycle, API-token only.
 * Creation is ensure-style (idempotent); deletion is the namespace
 * cascade: one storage prefix sweep (base PDFs, layer artifacts,
 * derived renders, event logs — everything under `tenantRoot`), then
 * the DB rows children-before-parents. Storage goes first so a failed
 * sweep leaves the DB intact and the delete retryable; bulk-wiping
 * rather than per-document ceremony is deliberate — destruction
 * semantics, concurrent readers see 404s.
 */
export async function registerAdminTenantsRoutes(
  app: FastifyInstance,
  deps: AdminTenantsRouteDeps,
): Promise<void> {
  const { tenants, storage, securityEvents, suspendedTenants, tenantUsage } = deps;

  const mount = (
    op: AdminOperation,
    handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  ): void => {
    app.route({ method: op.method, url: op.path, handler });
  };

  const createOp = adminOperations['tenants.create'];
  mount(createOp, async (req, reply) => {
    requireApiToken(req);
    const parsed = AdminTenantCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const { tenant, created } = await tenants.ensureExplicit(parsed.data);
    return reply.send({ tenant: tenantPublic(tenant), created });
  });

  const listOp = adminOperations['tenants.list'];
  mount(listOp, async (req, reply) => {
    requireApiToken(req);
    const parsed = listOp.query.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const { limit, cursor } = parsed.data;
    const before = cursor === undefined ? undefined : decodeListCursor(cursor);
    const rows = await tenants.list({ limit: limit + 1, before });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeListCursor(last) : null;
    return reply.send({ tenants: page.map(tenantPublic), nextCursor });
  });

  const getOp = adminOperations['tenants.get'];
  mount(getOp, async (req, reply) => {
    requireApiToken(req);
    const { tenantId } = req.params as { tenantId: string };
    const tenant = await tenants.findById(tenantId);
    if (!tenant) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `tenant does not exist: ${tenantId}` } });
    }
    return reply.send({ tenant: tenantPublic(tenant) });
  });

  const deleteOp = adminOperations['tenants.delete'];
  mount(deleteOp, async (req, reply) => {
    requireApiToken(req);
    const { tenantId } = req.params as { tenantId: string };
    const existing = await tenants.findById(tenantId);
    if (!existing) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `tenant does not exist: ${tenantId}` } });
    }
    await storage.deletePrefix(StorageKeys.tenantRoot(tenantId));
    await tenants.deleteCascadeDb(tenantId);
    return reply.code(204).send();
  });

  const suspendOp = adminOperations['tenants.suspend'];
  mount(suspendOp, async (req, reply) => {
    requireApiToken(req);
    const { tenantId } = req.params as { tenantId: string };
    const parsed = TenantSuspendRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const existed = await tenants.setStatus(tenantId, 'suspended');
    if (!existed) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `tenant does not exist: ${tenantId}` } });
    }
    // Prime this replica synchronously so the very next request 403s;
    // siblings converge within the guard's TTL.
    suspendedTenants.prime(tenantId, true);
    await securityEvents.append({
      tenantId,
      kind: 'tenant.suspended',
      scope: [],
      actor: 'api-token',
      via: 'api-token',
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    });
    return reply.code(204).send();
  });

  const resumeOp = adminOperations['tenants.resume'];
  mount(resumeOp, async (req, reply) => {
    requireApiToken(req);
    const { tenantId } = req.params as { tenantId: string };
    const existed = await tenants.setStatus(tenantId, 'active');
    if (!existed) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `tenant does not exist: ${tenantId}` } });
    }
    suspendedTenants.prime(tenantId, false);
    await securityEvents.append({
      tenantId,
      kind: 'tenant.resumed',
      scope: [],
      actor: 'api-token',
      via: 'api-token',
    });
    return reply.code(204).send();
  });

  const usageOp = adminOperations['tenants.usage'];
  mount(usageOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    requireTenantAccess(req, tenantId, usageOp.scope);
    const parsed = TenantUsageQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'InvalidArg', message: formatIssues(parsed.error.issues) } });
    }
    const tenant = await tenants.findById(tenantId);
    if (!tenant) {
      return reply
        .code(404)
        .send({ error: { code: 'NotFound', message: `tenant does not exist: ${tenantId}` } });
    }
    // `period=YYYY-MM` reports a historical month; monthPeriod works
    // from any date inside it.
    const at = parsed.data.period ? new Date(`${parsed.data.period}-01T00:00:00Z`) : new Date();
    return reply.send(await tenantUsage.snapshot(tenantId, at));
  });
}

function tenantPublic(t: TenantRow): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    autoProvisioned: t.autoProvisioned,
    status: t.status,
    createdAt: t.createdAt,
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
