import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  checkAnyCapability,
  checkCapability,
  checkCollab,
  type CollabAction,
  type CollabTarget,
  type DocCapability,
  type PdfBits,
} from '@embedpdf/engine-core/runtime';
// checkResourceAccess + DocResourceId live in /wire (resource descriptor
// table is HTTP-wire surface, used by route guards on every read endpoint).
import { checkResourceAccess, type DocResourceId } from '@embedpdf/engine-core/wire';

import {
  createJwtVerifier,
  hasDocScope,
  hasTenantScope,
  isDocUserClaims,
  isTenantClaims,
  type DocScope,
  type IdentityClaims,
  type JwtClaims,
  type JwtVerifier,
  type JwtVerifierConfig,
  type TenantScope,
} from '../auth/JwtVerifier';

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: { id: string; sub: string; claims: JwtClaims };
  }
}

export interface JwtPluginOptions {
  /**
   * Verifier config. Pass `{ mode: 'hs256', secret }` for dev/test
   * (HS256 shared secret) or one of `asymmetric` / `jwks` for prod.
   *
   * Backward compat: passing a bare `{ secret }` is treated as HS256.
   */
  verifier: JwtVerifierConfig | { secret: string };
  /** Routes that should bypass authentication (e.g. health checks). */
  publicPaths?: ReadonlyArray<string>;
}

function asConfig(input: JwtPluginOptions['verifier']): JwtVerifierConfig {
  if ('mode' in input) return input;
  return { mode: 'hs256', secret: input.secret };
}

/**
 * preHandler-style auth: extracts Bearer token, verifies via the
 * configured `JwtVerifier`, attaches a tenant context to the
 * request. Routes use `requireTenant(req)` to read it.
 */
export async function registerJwtAuth(app: FastifyInstance, opts: JwtPluginOptions): Promise<void> {
  const verifier: JwtVerifier = createJwtVerifier(asConfig(opts.verifier));
  const publics = new Set(opts.publicPaths ?? []);

  app.addHook('onRequest', async (req, reply) => {
    if (publics.has(req.url)) return;
    if (req.url === '/healthz' || req.url === '/readyz') return;

    const auth = req.headers['authorization'];
    if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'missing bearer token' });
      return;
    }
    const token = auth.slice('Bearer '.length).trim();
    try {
      const claims = await verifier.verify(token);
      req.tenant = { id: claims.tenant_id, sub: claims.sub, claims };
    } catch (err) {
      reply.code(401).send({ error: `invalid token: ${(err as Error).message}` });
      return;
    }
  });
}

export function requireTenant(req: FastifyRequest): string {
  const t = req.tenant;
  if (!t) throw new Error('tenant not attached to request (auth bypass?)');
  return t.id;
}

/**
 * Tenant-route preHandler: asserts the request carries a tenant
 * token holding at least one of `wanted` scopes (or `*`). Throws a
 * typed error (`Forbidden`) the error handler maps to 403.
 *
 * Doc-scoped tokens are rejected — they live in a different scope
 * namespace and have no business reaching tenant-wide operations.
 */
export function requireScope(
  req: FastifyRequest,
  wanted: ReadonlyArray<TenantScope>,
): { tenantId: string; sub: string } {
  const t = req.tenant;
  if (!t) {
    const err = new Error('tenant token required') as Error & { code: string; status: number };
    err.code = 'Unauthenticated';
    err.status = 401;
    throw err;
  }
  if (isDocUserClaims(t.claims)) {
    const err = new Error('doc-scoped token cannot access tenant routes') as Error & {
      code: string;
      status: number;
    };
    err.code = 'Forbidden';
    err.status = 403;
    throw err;
  }
  if (!isTenantClaims(t.claims) || !hasTenantScope(t.claims, wanted)) {
    const err = new Error(`tenant scope required: one of [${wanted.join(', ')}]`) as Error & {
      code: string;
      status: number;
    };
    err.code = 'Forbidden';
    err.status = 403;
    throw err;
  }
  return { tenantId: t.id, sub: t.sub };
}

export type DocAccessMode = 'doc' | 'tenant';

/**
 * Doc-route preHandler: asserts the request carries a token
 * authorised to perform at least one of `needed` doc-scopes on the
 * URL's `docId`. Two legal paths:
 *
 *   1. **Doc-scoped token**: `doc_id` claim matches the URL, AND
 *      the token's `DocScope[]` contains one of `needed` (or `*`).
 *   2. **Tenant token**: `scope` contains `docs.read` (or `*`).
 *      The doc-tenant binding is enforced one layer down by
 *      `DocumentsRepo.requireOwned(docId, tenantId)` — the service
 *      layer refuses to load a doc that doesn't belong to the
 *      token's tenant.
 *
 * Returns the resolved tenant context plus a `mode` flag for audit
 * logging (so we can see whether a request reached a doc via the
 * tight doc-scope path or the wider tenant-scope path).
 */
export interface RequestJwtContext {
  claims: JwtClaims;
  jti: string | null;
  exp: number | null;
  unlockKey: string | null;
  scope: ReadonlyArray<string>;
  identity: IdentityClaims;
}

export function requireDocAccess(
  req: FastifyRequest,
  docId: string,
  needed: ReadonlyArray<DocScope>,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const t = req.tenant;
  if (!t) {
    const err = new Error('doc-access token required') as Error & { code: string; status: number };
    err.code = 'Unauthenticated';
    err.status = 401;
    throw err;
  }

  if (isDocUserClaims(t.claims)) {
    if (t.claims.doc_id !== docId) {
      const err = new Error('token grants access to a different document') as Error & {
        code: string;
        status: number;
      };
      err.code = 'Forbidden';
      err.status = 403;
      throw err;
    }
    if (!hasDocScope(t.claims, needed)) {
      const err = new Error(`doc scope required: one of [${needed.join(', ')}]`) as Error & {
        code: string;
        status: number;
      };
      err.code = 'Forbidden';
      err.status = 403;
      throw err;
    }
    return { tenantId: t.id, sub: t.sub, mode: 'doc', jwt: jwtContext(t.claims) };
  }

  // TenantClaims path. The tenant owns every doc in their tenant
  // and the service-layer requireOwned enforces the doc-tenant
  // match, so we only need to know the bearer is authorised for
  // tenant-level doc reads.
  if (!hasTenantScope(t.claims, ['*', 'docs.read'])) {
    const err = new Error('tenant scope required: one of [*, docs.read]') as Error & {
      code: string;
      status: number;
    };
    err.code = 'Forbidden';
    err.status = 403;
    throw err;
  }
  return { tenantId: t.id, sub: t.sub, mode: 'tenant', jwt: jwtContext(t.claims) };
}

export function requireLayerDocAccess(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  needed: ReadonlyArray<DocScope>,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccess(req, docId, needed);
  enforceLayerPin(req, layerName);
  return ctx;
}

// ============================================================================
// Capability + collab helpers (engine-core scope vocabulary)
// ============================================================================
//
// These replace the `requireDocAccess(req, docId, ['doc.read'])` style.
// Route handlers migrate to them in two stages:
//   1. Read routes call `requireResource(req, docId, '<id>', pdfBits)` — the
//      DOC_RESOURCES table is the source of truth for capability checks
//      AND CDN coverage.
//   2. Mutation routes that have collab semantics call `requireCollab(...)`
//      with the target row's userId/groupId.
//
// Tenant tokens still bypass capability checks here — a tenant owns every
// doc in their tenant, and the service-layer `requireOwned` enforces the
// doc-tenant binding. This mirrors the existing `requireDocAccess` policy
// for the tenant branch.

/**
 * Doc-scope-only preHandler that performs NO capability check. Verifies
 * the JWT is doc-scoped to this `docId` (or that the bearer is a tenant
 * token with `docs.read`). Used by the next-layer capability/collab
 * helpers; the tenant branch they exit through is the same as the legacy
 * `requireDocAccess`.
 *
 * Reading is implicit only in the sense that having a valid doc-scoped
 * token gets you THIS far — the capability/collab/resource helper layered
 * on top then decides whether the actual operation is allowed.
 */
export function requireDocAccessOnly(
  req: FastifyRequest,
  docId: string,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const t = req.tenant;
  if (!t) {
    const err = new Error('doc-access token required') as Error & {
      code: string;
      status: number;
    };
    err.code = 'Unauthenticated';
    err.status = 401;
    throw err;
  }

  if (isDocUserClaims(t.claims)) {
    if (t.claims.doc_id !== docId) {
      const err = new Error('token grants access to a different document') as Error & {
        code: string;
        status: number;
      };
      err.code = 'Forbidden';
      err.status = 403;
      throw err;
    }
    return { tenantId: t.id, sub: t.sub, mode: 'doc', jwt: jwtContext(t.claims) };
  }

  // Tenant branch — same policy as the legacy requireDocAccess.
  if (!hasTenantScope(t.claims, ['*', 'docs.read'])) {
    const err = new Error('tenant scope required: one of [*, docs.read]') as Error & {
      code: string;
      status: number;
    };
    err.code = 'Forbidden';
    err.status = 403;
    throw err;
  }
  return { tenantId: t.id, sub: t.sub, mode: 'tenant', jwt: jwtContext(t.claims) };
}

/**
 * Assert the bearer's scope grants the named capability for the given
 * document. Throws `Forbidden` on deny.
 *
 * Tenant tokens bypass the capability check entirely (existing policy:
 * tenant owns every doc in the tenant). Doc-scoped tokens evaluate the
 * capability against their JWT scope array + the document's PDF bits
 * (the bits matter for `pdf.permissions` expansion only).
 */
export function requireCapability(
  req: FastifyRequest,
  docId: string,
  capability: DocCapability,
  pdfBits: PdfBits,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  if (ctx.mode === 'tenant') return ctx;
  if (!checkCapability(capability, ctx.jwt.scope, pdfBits)) {
    throwForbidden(`capability required: ${capability}`);
  }
  return ctx;
}

/**
 * Assert the bearer's scope grants AT LEAST ONE of the listed capabilities.
 * Currently unused by the resource table (every entry maps to a single cap),
 * but kept available for routes that need the disjunction directly.
 */
export function requireAnyCapability(
  req: FastifyRequest,
  docId: string,
  capabilities: ReadonlyArray<DocCapability>,
  pdfBits: PdfBits,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  if (ctx.mode === 'tenant') return ctx;
  if (!checkAnyCapability(capabilities, ctx.jwt.scope, pdfBits)) {
    throwForbidden(`one of: ${capabilities.join(', ')}`);
  }
  return ctx;
}

/**
 * Resource-table-driven guard. Routes pass the resource id (e.g.
 * `'page-render'`) and the helper looks up the requirement in
 * DOC_RESOURCES. Keeps the route→capability mapping in one place
 * shared with the CDN signer.
 */
export function requireResource(
  req: FastifyRequest,
  docId: string,
  resourceId: DocResourceId,
  pdfBits: PdfBits,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  if (ctx.mode === 'tenant') return ctx;
  if (!checkResourceAccess(resourceId, ctx.jwt.scope, pdfBits)) {
    throwForbidden(`resource access denied: ${resourceId}`);
  }
  return ctx;
}

/**
 * Annotation collab guard. PATCH/DELETE routes fetch the target
 * annotation's `userId` / `groupId` from the EMBD_Metadata reader
 * first, then call this. POST (create) passes the caller's own
 * identity as the target since creators always act as themselves.
 */
export function requireCollabAction(
  req: FastifyRequest,
  docId: string,
  action: CollabAction,
  target: CollabTarget,
  pdfBits: PdfBits,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  if (ctx.mode === 'tenant') return ctx;
  if (!checkCollab(action, target, ctx.jwt.scope, ctx.jwt.identity, pdfBits)) {
    throwForbidden(`annotations:${action} denied for target`);
  }
  return ctx;
}

// Layer-scoped variants — wrap the doc-only versions with the existing
// layer pin check (the token's `layer_name` claim, defaulting to
// 'default', must match the URL).

/**
 * Layer-scoped equivalent of `requireDocAccessOnly`. Verifies the JWT
 * is doc-scoped to this `docId` AND that its `layer_name` claim (if
 * present, defaulting to 'default') matches the URL layer. Performs
 * NO capability check — used by /access and other endpoints where
 * the work itself defines what's authorized.
 */
export function requireLayerDocAccessOnly(
  req: FastifyRequest,
  docId: string,
  layerName: string,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  enforceLayerPin(req, layerName);
  return ctx;
}

export function requireLayerCapability(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  capability: DocCapability,
  pdfBits: PdfBits,
): {
  tenantId: string;
  sub: string;
  mode: DocAccessMode;
  jwt: RequestJwtContext;
  originSessionId: string | null;
} {
  const ctx = requireCapability(req, docId, capability, pdfBits);
  enforceLayerPin(req, layerName);
  // The mutating client's engine-instance id (X-Engine-Session-Id). Stored on
  // the audit row so SSE subscribers can drop their own echoes. Advisory only
  // — it never participates in auth — so it's length-capped, not validated.
  return { ...ctx, originSessionId: originSessionIdFromRequest(req) };
}

function originSessionIdFromRequest(req: FastifyRequest): string | null {
  const raw = req.headers['x-engine-session-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.slice(0, 128);
}

export function requireLayerAnyCapability(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  capabilities: ReadonlyArray<DocCapability>,
  pdfBits: PdfBits,
): {
  tenantId: string;
  sub: string;
  mode: DocAccessMode;
  jwt: RequestJwtContext;
  originSessionId: string | null;
} {
  const ctx = requireAnyCapability(req, docId, capabilities, pdfBits);
  enforceLayerPin(req, layerName);
  return { ...ctx, originSessionId: originSessionIdFromRequest(req) };
}

export function requireLayerResource(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  resourceId: DocResourceId,
  pdfBits: PdfBits,
): {
  tenantId: string;
  sub: string;
  mode: DocAccessMode;
  jwt: RequestJwtContext;
  originSessionId: string | null;
} {
  const ctx = requireResource(req, docId, resourceId, pdfBits);
  enforceLayerPin(req, layerName);
  return { ...ctx, originSessionId: originSessionIdFromRequest(req) };
}

export function requireLayerCollabAction(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  action: CollabAction,
  target: CollabTarget,
  pdfBits: PdfBits,
): {
  tenantId: string;
  sub: string;
  mode: DocAccessMode;
  jwt: RequestJwtContext;
  originSessionId: string | null;
} {
  const ctx = requireCollabAction(req, docId, action, target, pdfBits);
  enforceLayerPin(req, layerName);
  return { ...ctx, originSessionId: originSessionIdFromRequest(req) };
}

/**
 * The layer a doc-user token is pinned to (`layer_name`, default
 * `'default'`). THE one reader of the claim: origin plane guards, password
 * bindings, and the `/v1/access` scope computation all route through here so
 * "which layer does this caller claim to be" has exactly one answer.
 * Tenant/admin contexts are not layer-pinned — callers branch on `mode`
 * before asking; for them this returns `'default'`, matching the historic
 * fallback.
 */
export function pinnedLayerName(ctx: { jwt?: RequestJwtContext }): string {
  return (ctx.jwt?.claims as { layer_name?: string } | undefined)?.layer_name ?? 'default';
}

// ----------------------------------------------------------------------
// internal helpers
// ----------------------------------------------------------------------

function enforceLayerPin(req: FastifyRequest, layerName: string): void {
  const claims = req.tenant?.claims;
  if (claims && isDocUserClaims(claims)) {
    const expected = claims.layer_name ?? 'default';
    if (expected !== layerName) {
      const err = new Error('token grants access to a different layer') as Error & {
        code: string;
        status: number;
      };
      err.code = 'Forbidden';
      err.status = 403;
      throw err;
    }
  }
}

function throwForbidden(message: string): never {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = 'Forbidden';
  err.status = 403;
  throw err;
}

function jwtContext(claims: JwtClaims): RequestJwtContext {
  return {
    claims,
    jti: typeof claims.jti === 'string' && claims.jti.length > 0 ? claims.jti : null,
    exp: typeof claims.exp === 'number' ? claims.exp : null,
    unlockKey: readUnlockKey(claims),
    scope: claims.scope,
    identity: {
      ...(claims.user_id ? { user_id: claims.user_id } : {}),
      ...(claims.group_id ? { group_id: claims.group_id } : {}),
      ...(claims.display_name ? { display_name: claims.display_name } : {}),
      ...(claims.groups ? { groups: [...claims.groups] } : {}),
    },
  };
}

function readUnlockKey(claims: JwtClaims): string | null {
  return claims.embedpdf?.unlock_key && claims.embedpdf.unlock_key.length > 0
    ? claims.embedpdf.unlock_key
    : null;
}
