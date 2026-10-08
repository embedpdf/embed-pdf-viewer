import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  checkAnyCapability,
  checkCapability,
  checkCollab,
  describeProtection,
  EngineError,
  EngineErrorCode,
  protectedCapabilities,
  type AnnotationAuthority,
  type ChangeAuthority,
  type CollabAction,
  type CollabTarget,
  type DocCapability,
  type DocumentProtection,
  type Identity,
  type PdfBits,
  type ProtectableCapability,
  PermissionDenied,
} from '@embedpdf/engine-core/runtime';
import { checkResourceAccess, DOC_RESOURCES, type DocResourceId } from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyRequest } from 'fastify';
// checkResourceAccess + DocResourceId live in /wire (resource descriptor
// table is HTTP-wire surface, used by route guards on every read endpoint).

import { AuthFailureLimiter, type AuthFailureLimiterOptions } from './auth-failure-limiter';
import {
  createJwtVerifier,
  hasDocScope,
  hasTenantScope,
  isDocUserClaims,
  isTenantClaims,
  type DocScope,
  type JwtClaims,
  type JwtVerifier,
  type JwtVerifierConfig,
  type TenantScope,
} from '../auth/JwtVerifier';
import { matchesOrigin } from '../auth/origins';
import type { SuspendedTenantsGuard } from '../auth/SuspendedTenantsGuard';
import type { EditRequest } from '../services/LayerWriteObjectNumbers';
import { MAX_OBJECT_NUMBER_TOP_UP } from '../services/ObjectNumberService';

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: { id: string; sub: string; claims: JwtClaims };
    /**
     * True when the bearer matched a configured API auth token — the
     * deployment's root credential, valid on every surface. No tenant
     * context is attached; tenant-scoped guards take it from the URL,
     * doc-plane guards from the document row.
     */
    apiAuth?: boolean;
    /**
     * Decoded `X-Document-Password`, set by the doc-plane API-token
     * hook. Never logged; carried into `RequestJwtContext.docPassword`.
     */
    docPassword?: string;
    /**
     * The request's editing session asks (see `editSessionOf`): set by the
     * layer guards, read back for the `EmbedPDF-Object-Numbers` response
     * header.
     */
    editRequest?: EditRequest;
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
  /**
   * Static API auth tokens (the deployment's root credential). A
   * bearer that matches any of these — compared in constant time via
   * process-local keyed digests — authenticates as `req.apiAuth`
   * without JWT verification. A list so rotation is overlap-then-retire.
   * Empty or absent disables the credential (JWT-only deployment).
   */
  apiAuthTokens?: ReadonlyArray<string>;
  /**
   * Throttle on authentication failures per client IP (never on
   * successful traffic — valid tokens are not counted). A source over
   * budget gets `429` + `Retry-After` until its window expires; note this
   * covers every request from that IP for the remainder of the window,
   * so clients sharing a NAT with an attacker are throttled too — the
   * price of not spending verify CPU on a known-hostile source. Deploys
   * behind a proxy/LB must set Fastify's `trustProxy` for `request.ip`
   * to be the real client. Defaults to 30 failures / 60s; `false`
   * disables (e.g. when the edge already rate-limits).
   */
  authFailureLimit?: Partial<AuthFailureLimiterOptions> | false;
  /**
   * Tenant-suspension gate. JWT-authenticated requests for a suspended
   * tenant fail 403 after signature verification; API-token requests
   * are exempt by construction (they carry no tenant claims), so the
   * operator can always reach a suspended tenant.
   */
  suspendedTenants?: SuspendedTenantsGuard;
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
  const apiTokens = (opts.apiAuthTokens ?? []).filter((t) => t.length > 0);
  const matchesApiToken = createApiTokenMatcher(apiTokens);
  const limiter =
    opts.authFailureLimit === false
      ? null
      : new AuthFailureLimiter({ maxFailures: 30, windowMs: 60_000, ...opts.authFailureLimit });

  app.addHook('onRequest', async (req, reply) => {
    // Compare on the pathname: `req.url` carries the querystring, which
    // must not defeat a public-path or health-check match.
    const pathname = req.url.split('?', 1)[0] ?? req.url;
    if (publics.has(pathname)) return;
    if (pathname === '/healthz' || pathname === '/readyz') return;

    if (limiter) {
      const retryAfterMs = limiter.retryAfterMs(req.ip);
      if (retryAfterMs > 0) {
        reply
          .code(429)
          .header('retry-after', String(Math.ceil(retryAfterMs / 1000)))
          .send({ error: 'too many failed authentication attempts' });
        return;
      }
    }

    const auth = req.headers['authorization'];
    if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      limiter?.recordFailure(req.ip);
      reply.code(401).send({ error: 'missing bearer token' });
      return;
    }
    const token = auth.slice('Bearer '.length).trim();

    if (matchesApiToken(token)) {
      req.apiAuth = true;
      return;
    }

    let claims: JwtClaims;
    try {
      claims = await verifier.verify(token);
    } catch (err) {
      limiter?.recordFailure(req.ip);
      // The reason (bad signature vs expired vs rejected scope) is for the
      // operator's logs, not the anonymous caller.
      req.log.info({ err }, 'jwt verification rejected');
      reply.code(401).send({ error: 'invalid token' });
      return;
    }

    // Origin lock: enforced whenever the browser identifies itself.
    // Absent Origin = non-browser caller, governed by the token itself
    // (the lock's threat model is hotlink embedding, which always
    // arrives cross-origin from a browser, which always sends Origin).
    if (isDocUserClaims(claims) && claims.origins) {
      const origin = req.headers['origin'];
      if (typeof origin === 'string' && !matchesOrigin(origin, claims.origins)) {
        limiter?.recordFailure(req.ip);
        reply.code(403).send({ error: 'origin not allowed for this token' });
        return;
      }
    }

    // Suspension gates every JWT after signature verification: the
    // caller was authentic, the namespace is closed. Deliberately not
    // a verify failure — it neither counts against the failure limiter
    // nor hides behind a generic 401.
    if (opts.suspendedTenants && (await opts.suspendedTenants.isSuspended(claims.tenant_id))) {
      reply
        .code(403)
        .header('x-cloudpdf-tenant-status', 'suspended')
        .send({ error: 'tenant suspended' });
      return;
    }

    req.tenant = { id: claims.tenant_id, sub: claims.sub, claims };
  });
}

/**
 * Build a constant-time membership check once at registration. HMAC gives
 * `timingSafeEqual` fixed-size inputs without treating an API credential as
 * a stored password hash. The random comparison key and candidate digests
 * live only for this app instance, and every candidate is checked on every
 * request (no early exit on match).
 */
function createApiTokenMatcher(tokens: ReadonlyArray<string>): (presented: string) => boolean {
  if (tokens.length === 0) return () => false;

  const comparisonKey = randomBytes(32);
  const digest = (token: string): Buffer =>
    createHmac('sha256', comparisonKey).update(token).digest();
  const candidateDigests = tokens.map(digest);

  return (presented: string): boolean => {
    const presentedDigest = digest(presented);
    let matched = false;
    for (const candidateDigest of candidateDigests) {
      if (timingSafeEqual(presentedDigest, candidateDigest)) matched = true;
    }
    return matched;
  };
}

export interface TenantAccessContext {
  tenantId: string;
  sub: string;
  via: 'api-token' | 'tenant-jwt';
}

/**
 * The one-rule auth model for tenant-scoped routes: the API token is
 * valid for any tenant; a tenant JWT only for the tenant its
 * `tenant_id` names — the path tenant must match, and at least one of
 * `wanted` scopes (or `*`) must be held. Doc-scoped tokens are always
 * rejected.
 */
export function requireTenantAccess(
  req: FastifyRequest,
  tenantId: string,
  wanted: ReadonlyArray<TenantScope>,
): TenantAccessContext {
  if (req.apiAuth) {
    return { tenantId, sub: 'api-token', via: 'api-token' };
  }
  const ctx = requireScope(req, wanted);
  if (ctx.tenantId !== tenantId) {
    const err = new Error(
      `token is for tenant "${ctx.tenantId}", path names tenant "${tenantId}"`,
    ) as Error & { code: string; status: number };
    err.code = 'Forbidden';
    err.status = 403;
    throw err;
  }
  return { tenantId, sub: ctx.sub, via: 'tenant-jwt' };
}

/** Deployment-surface guard: the root credential only, never a JWT. */
export function requireApiToken(req: FastifyRequest): void {
  if (!req.apiAuth) {
    const err = new Error('api token required') as Error & { code: string; status: number };
    err.code = 'Forbidden';
    err.status = 403;
    throw err;
  }
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
 *   1. **Doc-scoped token**: `doc_id` claim matches the URL, and
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
  identity: Identity;
  /**
   * Per-request document password (decoded `X-Document-Password`),
   * present only on API-token requests — backends supply the password
   * per call instead of holding a KMS-bound viewer session.
   */
  docPassword?: string;
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
    return { tenantId: t.id, sub: t.sub, mode: 'doc', jwt: requestJwtContext(req, t.claims) };
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
  return { tenantId: t.id, sub: t.sub, mode: 'tenant', jwt: requestJwtContext(req, t.claims) };
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
//      and CDN coverage.
//   2. Mutation routes that have collab semantics call `requireCollab(...)`
//      with the target row's userId/groupId.
//
// Tenant tokens still bypass capability checks here — a tenant owns every
// doc in their tenant, and the service-layer `requireOwned` enforces the
// doc-tenant binding. This mirrors the existing `requireDocAccess` policy
// for the tenant branch.

/**
 * Doc-scope-only preHandler that performs no capability check. Verifies
 * the JWT is doc-scoped to this `docId` (or that the bearer is a tenant
 * token with `docs.read`). Used by the next-layer capability/collab
 * helpers; the tenant branch they exit through is the same as the legacy
 * `requireDocAccess`.
 *
 * Reading is implicit only in the sense that having a valid doc-scoped
 * token gets you this far — the capability/collab/resource helper layered
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
    return { tenantId: t.id, sub: t.sub, mode: 'doc', jwt: requestJwtContext(req, t.claims) };
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
  return { tenantId: t.id, sub: t.sub, mode: 'tenant', jwt: requestJwtContext(req, t.claims) };
}

/** A capability no signature can take away: its check never needs the document's protection. */
export type UnprotectableCapability = Exclude<DocCapability, ProtectableCapability>;

/**
 * The protection a capability's check takes: required exactly when a
 * signature can take the capability away, so a route can't forget it.
 */
type ProtectionArg<C extends DocCapability> = C extends ProtectableCapability
  ? [protection: DocumentProtection | null]
  : [];

const protectionOf = (rest: readonly unknown[]): DocumentProtection | null =>
  (rest[0] as DocumentProtection | null | undefined) ?? null;

/**
 * `ProtectedDocument` when the document's signatures forbid `capability`.
 * Document-derived, like the file's own permission bits: it binds every
 * caller, tenant tokens included, and comes before the scope, exactly as the
 * local engine's scope guard orders it.
 */
function refuseProtected(capability: DocCapability, protection: DocumentProtection | null): void {
  if (protection && protectedCapabilities(protection).has(capability)) {
    throw new EngineError(
      EngineErrorCode.ProtectedDocument,
      describeProtection(capability, protection),
    );
  }
}

/**
 * Assert the bearer's scope grants the named capability for the given
 * document. Throws `Forbidden` on deny.
 *
 * A capability a signature can take away also takes the document's
 * protection (`DocumentService.getProtection`), checked first, for every
 * caller. Tenant tokens then bypass the scope check (existing policy:
 * tenant owns every doc in the tenant). Doc-scoped tokens evaluate the
 * capability against their JWT scope array + the document's PDF bits
 * (the bits matter for `pdf.permissions` expansion only).
 */
export function requireCapability<C extends DocCapability>(
  req: FastifyRequest,
  docId: string,
  capability: C,
  pdfBits: PdfBits,
  ...protection: ProtectionArg<C>
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  refuseProtected(capability, protectionOf(protection));
  if (ctx.mode === 'tenant') return ctx;
  if (!checkCapability(capability, ctx.jwt.scope, pdfBits)) {
    throw new PermissionDenied(capability);
  }
  return ctx;
}

/**
 * Assert the bearer's scope grants at least one of the listed capabilities.
 * Currently unused by the resource table (every entry maps to a single cap),
 * but kept available for routes that need the disjunction directly.
 */
export function requireAnyCapability(
  req: FastifyRequest,
  docId: string,
  capabilities: ReadonlyArray<UnprotectableCapability>,
  pdfBits: PdfBits,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  if (ctx.mode === 'tenant') return ctx;
  if (!checkAnyCapability(capabilities, ctx.jwt.scope, pdfBits)) {
    throw new PermissionDenied(capabilities[0] ?? 'doc.open', undefined, capabilities);
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
    throwResourceDenied(resourceId, ctx.jwt.scope, pdfBits);
  }
  return ctx;
}

/**
 * Annotation collab guard. PATCH/DELETE routes fetch the target
 * annotation's `userId` / `groupId` from the EMBD_Metadata reader
 * first, then call this. POST (create) passes the caller's own
 * identity as the target since creators always act as themselves.
 * A signature that forbids annotation writes refuses them first, for
 * every caller.
 */
export function requireCollabAction(
  req: FastifyRequest,
  docId: string,
  action: CollabAction,
  target: CollabTarget,
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
): { tenantId: string; sub: string; mode: DocAccessMode; jwt: RequestJwtContext } {
  const ctx = requireDocAccessOnly(req, docId);
  refuseProtected('doc.annotate.modify', protection);
  if (ctx.mode === 'tenant') return ctx;
  if (!checkCollab(action, target, ctx.jwt.scope, ctx.jwt.identity, pdfBits)) {
    throw new PermissionDenied(`annotations:${action}`, 'target');
  }
  return ctx;
}

/**
 * Whether the token may make new objects on the document, so its editing
 * session is handed object numbers: create annotations (as itself, in its
 * own group), insert pages, or add form fields. What the document's
 * signatures forbid doesn't count. A tenant owns its documents.
 */
export function mayCreateObjects(
  ctx: { mode: DocAccessMode; jwt: RequestJwtContext },
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
): boolean {
  if (ctx.mode === 'tenant') return true;
  const { scope, identity } = ctx.jwt;
  if (checkAnyCapability(['doc.pages.assemble', 'doc.forms.modify'], scope, pdfBits, protection)) {
    return true;
  }
  if (protection && protectedCapabilities(protection).has('doc.annotate.modify')) return false;
  const self: CollabTarget = {
    ...(identity.userId !== undefined ? { userId: identity.userId } : {}),
    ...(identity.groupId !== undefined ? { groupId: identity.groupId } : {}),
  };
  return checkCollab('create', self, scope, identity, pdfBits);
}

/**
 * Whether the token holds `capability` on the document: what
 * `requireCapability` checks, as a yes or no, for a write that leaves out
 * what the caller may not write instead of refusing it.
 */
export function holdsCapability(
  ctx: { mode: DocAccessMode; jwt: RequestJwtContext },
  capability: DocCapability,
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
): boolean {
  if (protection && protectedCapabilities(protection).has(capability)) return false;
  return ctx.mode === 'tenant' || checkCapability(capability, ctx.jwt.scope, pdfBits);
}

// Layer-scoped variants — wrap the doc-only versions with the existing
// layer pin check (the token's `layer_name` claim, defaulting to
// 'default', must match the URL).

/**
 * Layer-scoped equivalent of `requireDocAccessOnly`. Verifies the JWT
 * is doc-scoped to this `docId` and that its `layer_name` claim (if
 * present, defaulting to 'default') matches the URL layer. Performs
 * no capability check — used by /access and other endpoints where
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

type LayerGuardContext = {
  tenantId: string;
  sub: string;
  mode: DocAccessMode;
  jwt: RequestJwtContext;
  originSessionId: string | null;
  edit?: EditRequest;
  idempotencyKey?: string;
};

export function requireLayerCapability<C extends DocCapability>(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  capability: C,
  pdfBits: PdfBits,
  ...protection: ProtectionArg<C>
): LayerGuardContext {
  const ctx = requireCapability(
    req,
    docId,
    capability as ProtectableCapability,
    pdfBits,
    protectionOf(protection),
  );
  enforceLayerPin(req, layerName);
  return { ...ctx, ...writeRequestOf(req) };
}

/**
 * The request's editing session. `originSessionId` is the client's session
 * id (X-Engine-Session-Id, one per open document), stored on the audit row
 * so SSE subscribers can drop their own echoes; it is length-capped, not
 * validated. With it, `edit` says how many object numbers to top the session
 * up by (EmbedPDF-Reserve-Object-Numbers, at most 32) and collects what a
 * write hands out, for the response's `EmbedPDF-Object-Numbers`. Object
 * numbers belong to the session id and the token's subject together, so
 * the id alone grants nothing.
 */
export function editSessionOf(req: FastifyRequest): {
  originSessionId: string | null;
  edit?: EditRequest;
} {
  const raw = req.headers['x-engine-session-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return { originSessionId: null };
  req.editRequest ??= { topUp: reserveCountOf(req), issued: [] };
  return { originSessionId: value.slice(0, 128), edit: req.editRequest };
}

/** What a layer request carries for a write: its editing session and its `Idempotency-Key`. */
function writeRequestOf(req: FastifyRequest): {
  originSessionId: string | null;
  edit?: EditRequest;
  idempotencyKey?: string;
} {
  const idempotencyKey = idempotencyKeyOf(req);
  return { ...editSessionOf(req), ...(idempotencyKey ? { idempotencyKey } : {}) };
}

/** The `Idempotency-Key` header: printable ASCII, 1 to 255 characters. */
function idempotencyKeyOf(req: FastifyRequest): string | undefined {
  const header = req.headers['idempotency-key'];
  if (header === undefined) return undefined;
  if (typeof header !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(header)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'Idempotency-Key must be 1 to 255 printable ASCII characters',
    );
  }
  return header;
}

/** `EmbedPDF-Reserve-Object-Numbers`: how many numbers to top the session up by, at most 32. */
function reserveCountOf(req: FastifyRequest): number {
  const raw = req.headers['embedpdf-reserve-object-numbers'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === '') return 0;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'EmbedPDF-Reserve-Object-Numbers must be a whole number of object numbers',
    );
  }
  return Math.min(count, MAX_OBJECT_NUMBER_TOP_UP);
}

export function requireLayerAnyCapability(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  capabilities: ReadonlyArray<UnprotectableCapability>,
  pdfBits: PdfBits,
): LayerGuardContext {
  const ctx = requireAnyCapability(req, docId, capabilities, pdfBits);
  enforceLayerPin(req, layerName);
  return { ...ctx, ...writeRequestOf(req) };
}

export function requireLayerResource(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  resourceId: DocResourceId,
  pdfBits: PdfBits,
): LayerGuardContext {
  const ctx = requireResource(req, docId, resourceId, pdfBits);
  enforceLayerPin(req, layerName);
  return { ...ctx, ...writeRequestOf(req) };
}

export function requireLayerCollabAction(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  action: CollabAction,
  target: CollabTarget,
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
): LayerGuardContext {
  const ctx = requireCollabAction(req, docId, action, target, pdfBits, protection);
  enforceLayerPin(req, layerName);
  return { ...ctx, ...writeRequestOf(req) };
}

/**
 * An annotation write whose permission the worker checks against what the
 * write finds, inside the write (an update, a delete): the token reaches
 * this document's layer, no signature forbids annotation writes, and the
 * authority the write carries names who it acts for and the token's grants
 * (none to check for a tenant, which owns its documents).
 */
export function requireLayerAnnotationWrite(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
): LayerGuardContext & { authority: AnnotationAuthority } {
  const ctx = requireLayerDocAccessOnly(req, docId, layerName);
  refuseProtected('doc.annotate.modify', protection);
  return {
    ...ctx,
    ...writeRequestOf(req),
    authority: {
      identity: ctx.jwt.identity,
      grants: ctx.mode === 'tenant' ? null : { scope: ctx.jwt.scope, pdfBits },
    },
  };
}

/**
 * A request's changes (`POST …/changes`): the token reaches this document's
 * layer, and the authority the changes carry names who they act for, the
 * token's grants (none for a tenant, which owns its documents) and what the
 * document's signatures forbid. The worker checks each op against it inside
 * the write, the ops of an undo included.
 */
export function requireLayerChangeWrite(
  req: FastifyRequest,
  docId: string,
  layerName: string,
  pdfBits: PdfBits,
  protection: DocumentProtection | null,
): LayerGuardContext & { authority: ChangeAuthority } {
  const ctx = requireLayerDocAccessOnly(req, docId, layerName);
  return {
    ...ctx,
    ...writeRequestOf(req),
    authority: {
      identity: ctx.jwt.identity,
      grants: ctx.mode === 'tenant' ? null : { scope: ctx.jwt.scope, pdfBits },
      protection,
    },
  };
}

/**
 * The layer a doc-user token is pinned to (`layer_name`, default
 * `'default'`). The one reader of the claim: origin plane guards, password
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

/** A resource the scope doesn't grant, naming what it needs as a local refusal does. */
function throwResourceDenied(
  resourceId: DocResourceId,
  scope: ReadonlyArray<string>,
  pdfBits: PdfBits,
): never {
  const { requirement } = DOC_RESOURCES[resourceId];
  if (requirement.kind === 'single') throw new PermissionDenied(requirement.capability, resourceId);
  const capabilities = requirement.capabilities;
  if (requirement.kind === 'any') {
    throw new PermissionDenied(capabilities[0] ?? 'doc.open', resourceId, capabilities);
  }
  // All of them: name the first one the scope lacks.
  const missing = capabilities.find((cap) => !checkCapability(cap, scope, pdfBits));
  throw new PermissionDenied(missing ?? capabilities[0] ?? 'doc.open', resourceId);
}

/**
 * Context builder for the doc-plane guards: the claims-derived context
 * plus the per-request document password when the API-token hook
 * attached one.
 */
function requestJwtContext(req: FastifyRequest, claims: JwtClaims): RequestJwtContext {
  const base = jwtContext(claims);
  return req.docPassword ? { ...base, docPassword: req.docPassword } : base;
}

function jwtContext(claims: JwtClaims): RequestJwtContext {
  return {
    claims,
    jti: typeof claims.jti === 'string' && claims.jti.length > 0 ? claims.jti : null,
    exp: typeof claims.exp === 'number' ? claims.exp : null,
    unlockKey: readUnlockKey(claims),
    scope: claims.scope,
    identity: claims.identity
      ? {
          ...claims.identity,
          ...(claims.identity.groups ? { groups: [...claims.identity.groups] } : {}),
        }
      : {},
  };
}

function readUnlockKey(claims: JwtClaims): string | null {
  return claims.embedpdf?.unlock_key && claims.embedpdf.unlock_key.length > 0
    ? claims.embedpdf.unlock_key
    : null;
}
