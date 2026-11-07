import {
  AdminTenantCreateRequestSchema,
  AdminTenantListQuerySchema,
  AdminTenantUpdateRequestSchema,
  TenantSuspendRequestSchema,
  TenantUsageQuerySchema,
  adminOperations,
  type AdminOperation,
  type AdminTenantRecord,
  type TenantUsageResponse,
} from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { decodeListCursor, encodeListCursor } from './_cursor';
import { formatIssues } from './_issues';
import { requireApiToken, requireTenantAccess } from '../../app/jwt-plugin';
import type { SuspendedTenantsGuard } from '../../auth/SuspendedTenantsGuard';
import type { TenantFeaturesGuard } from '../../auth/TenantFeaturesGuard';
import type { SecurityEventsRepo } from '../../db/repos/security-events.repo';
import {
  monthWindow,
  utcDay,
  type TenantUsageRepo,
  type UsageWindow,
} from '../../db/repos/tenant_usage.repo';
import type { TenantRow, TenantsRepo } from '../../db/repos/tenants.repo';
import { StorageKeys } from '../../storage/keys';
import type { ObjectStore } from '../../storage/ObjectStore';
import { errorBody } from '../_helpers';
import { isoTime } from '../../time';

export interface AdminTenantsRouteDeps {
  tenants: TenantsRepo;
  storage: ObjectStore;
  securityEvents: SecurityEventsRepo;
  suspendedTenants: SuspendedTenantsGuard;
  tenantFeatures: TenantFeaturesGuard;
  tenantUsage: TenantUsageRepo;
  /** The ids of the installed modules: the features a tenant may be given. */
  modules: ReadonlyArray<string>;
  /** The installed modules' meters (`protected-display.views`): usage reports each one. */
  moduleMeters: ReadonlyArray<string>;
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
  const { tenants, storage, securityEvents, suspendedTenants, tenantFeatures, tenantUsage } = deps;
  const installed = new Set(deps.modules);

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
      return reply.code(400).send(errorBody('InvalidArg', formatIssues(parsed.error.issues)));
    }
    const { tenant, created } = await tenants.ensureExplicit(parsed.data);
    return reply.send({ tenant: tenantPublic(tenant), created });
  });

  const listOp = adminOperations['tenants.list'];
  mount(listOp, async (req, reply) => {
    requireApiToken(req);
    const parsed = listOp.query.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody('InvalidArg', formatIssues(parsed.error.issues)));
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
      return reply.code(404).send(errorBody('NotFound', `tenant does not exist: ${tenantId}`));
    }
    return reply.send({ tenant: tenantPublic(tenant) });
  });

  const updateOp = adminOperations['tenants.update'];
  mount(updateOp, async (req, reply) => {
    requireApiToken(req);
    const { tenantId } = req.params as { tenantId: string };
    const parsed = AdminTenantUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(errorBody('InvalidArg', formatIssues(parsed.error.issues)));
    }
    const { features } = parsed.data;
    // A feature switches a module, so it names one this server runs: a typo
    // never passes for a module that's on.
    const unknown = features.find((feature) => !installed.has(feature.id));
    if (unknown) {
      const modules = installed.size > 0 ? [...installed].join(', ') : 'none';
      return reply
        .code(400)
        .send(
          errorBody('InvalidArg', `no installed module is ${unknown.id} (installed: ${modules})`),
        );
    }
    const existed = await tenants.setFeatures(tenantId, features);
    const tenant = existed ? await tenants.findById(tenantId) : null;
    if (!tenant) {
      return reply.code(404).send(errorBody('NotFound', `tenant does not exist: ${tenantId}`));
    }
    // Prime this replica so the next module request sees the change;
    // siblings converge within the guard's TTL.
    tenantFeatures.prime(tenantId, features);
    return reply.send({ tenant: tenantPublic(tenant) });
  });

  const deleteOp = adminOperations['tenants.delete'];
  mount(deleteOp, async (req, reply) => {
    requireApiToken(req);
    const { tenantId } = req.params as { tenantId: string };
    const existing = await tenants.findById(tenantId);
    if (!existing) {
      return reply.code(404).send(errorBody('NotFound', `tenant does not exist: ${tenantId}`));
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
      return reply.code(400).send(errorBody('InvalidArg', formatIssues(parsed.error.issues)));
    }
    const existed = await tenants.setStatus(tenantId, 'suspended');
    if (!existed) {
      return reply.code(404).send(errorBody('NotFound', `tenant does not exist: ${tenantId}`));
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
      return reply.code(404).send(errorBody('NotFound', `tenant does not exist: ${tenantId}`));
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
      return reply.code(400).send(errorBody('InvalidArg', formatIssues(parsed.error.issues)));
    }
    const tenant = await tenants.findById(tenantId);
    if (!tenant) {
      return reply.code(404).send(errorBody('NotFound', `tenant does not exist: ${tenantId}`));
    }
    const window = usageWindow(parsed.data);
    if (typeof window === 'string') {
      return reply.code(400).send(errorBody('InvalidArg', window));
    }
    const usage: TenantUsageResponse = await tenantUsage.snapshot(
      tenantId,
      window,
      deps.moduleMeters,
    );
    return reply.send(usage);
  });
}

/** The longest window a usage request may ask for: a year, leap day included. */
const MAX_USAGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The days a usage request asks for: `from` to `to`, `period`'s month, or
 * this month. A string says what's wrong with the request.
 */
function usageWindow(query: {
  period?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): UsageWindow | string {
  const { period, from, to } = query;
  if (from === undefined && to === undefined) {
    return monthWindow(period ? new Date(`${period}-01T00:00:00Z`) : new Date());
  }
  if (period !== undefined) return 'ask for a period or for from and to, not both';
  if (from === undefined || to === undefined) return 'from and to go together';
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  // `2026-02-31` matches the pattern but isn't a day.
  const isDay = (ms: number, day: string) => !Number.isNaN(ms) && utcDay(new Date(ms)) === day;
  if (!isDay(start, from) || !isDay(end, to)) {
    return 'from and to are days on the calendar';
  }
  if (end <= start) return 'to is after from';
  if ((end - start) / DAY_MS > MAX_USAGE_DAYS) {
    return `a window is at most ${MAX_USAGE_DAYS} days`;
  }
  return { from, to };
}

function tenantPublic(t: TenantRow): AdminTenantRecord {
  return {
    id: t.id,
    name: t.name,
    autoProvisioned: t.autoProvisioned,
    status: t.status,
    features: t.features,
    createdAt: isoTime(t.createdAt),
  };
}
