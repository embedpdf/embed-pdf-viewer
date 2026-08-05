import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidScope, validateScopeArray } from '@embedpdf/engine-core/runtime';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  importSPKI,
  jwtVerify,
  type JWK,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

// jose@5+ removed the public `KeyLike` alias. The verifier holds a
// reference to whatever `importSPKI` returns (a `CryptoKey` /
// `KeyObject`); derive the type structurally so we don't depend on a
// private export name that may change between minor versions.
type ImportedKey = Awaited<ReturnType<typeof importSPKI>>;

/**
 * Fields every token carries regardless of class. The class-specific
 * fields (`scope`, `doc_id`, `layer_name`) live on the subtypes
 * below; the union `JwtClaims` ties them together with compile-time
 * mutual exclusion (`?: never`).
 */
export interface IdentityClaims {
  user_id?: string;
  group_id?: string;
  display_name?: string;
  groups?: ReadonlyArray<string>;
}

export interface BaseClaims extends IdentityClaims {
  sub: string;
  tenant_id: string;
  iat: number;
  exp: number;
  /**
   * Optional opaque token id. Required for revocation; verifiers
   * configured with a `RevokedJtisGuard` reject any token whose
   * `jti` is in the denylist.
   */
  jti?: string;
  /**
   * Optional per-token unlock secret used to bind encrypted PDF
   * password sessions to this JWT. Kept as an extension claim so the
   * server can encrypt/decrypt password-session rows without treating
   * `jti` itself as secret material.
   */
  embedpdf?: {
    unlock_key?: string;
  };
}

/**
 * Tenant-scoped token. Represents an authenticated principal of one
 * tenant: a regular end-user (`scope: ['docs.read']`), a tenant
 * admin (`scope: ['*']`), or anything in between. The `scope` field
 * names the tenant-level operations the bearer is authorised for;
 * the token is implicitly tied to a tenant by `tenant_id` and
 * grants access to any document in that tenant matching its scope.
 *
 * MUST NOT carry `doc_id` / `layer_name` — those belong to the
 * `DocUserClaims` audience. Class is determined by the presence of
 * `doc_id` and the `?: never` discriminator makes the union
 * exhaustive at compile time.
 *
 * Note: "platform admin" (the SaaS operator who can create tenants)
 * is a different audience entirely and is not represented here.
 */
export interface TenantClaims extends BaseClaims {
  /**
   * Operations the bearer is authorised for on the tenant. Empty
   * array means authenticated-but-no-permissions and is rejected by
   * every scope-checking route guard.
   */
  scope: ReadonlyArray<TenantScope>;
  doc_id?: never;
  layer_name?: never;
}

/**
 * Doc-scoped end-user token. Minted by the customer's backend on
 * behalf of an end user (short-lived; typically minutes), carried in
 * the browser by `@cloudpdf/engine`. Pinned to one document so
 * an exfiltrated token can't be replayed against other docs.
 *
 * Carries its own `scope` of doc-level operations (`doc.read`,
 * `doc.annotate`, `doc.edit-pages`, ...). This is a different
 * namespace from `TenantScope` — the verifier preserves whatever
 * strings are in the wire payload; route guards enforce that the
 * scope value-set matches the audience the route serves.
 */
export interface DocUserClaims extends BaseClaims {
  doc_id: string;
  /** Doc-level operations this token can perform on `doc_id`. */
  scope: ReadonlyArray<DocScope>;
  /** Phase 5: pin a specific layer. Optional. */
  layer_name?: string;
}

/**
 * The verified-and-typed claims object. A `JwtClaims` is *always*
 * exactly one of tenant / doc — class is determined by the presence
 * of `doc_id`. Both classes carry a `scope` field, but the value
 * type differs (TenantScope vs DocScope); TypeScript narrows it
 * correctly after a class-guard call (`isTenantClaims` /
 * `isDocUserClaims`).
 *
 * Route helpers narrow with `isDocUserClaims(claims)` /
 * `isTenantClaims(claims)` rather than reading fields directly.
 */
export type JwtClaims = TenantClaims | DocUserClaims;

/**
 * Operations a tenant principal can be authorised for. `*` is a
 * superset wildcard. New scopes go here and have to be plumbed
 * through `requireScope` at every tenant route guard.
 */
export type TenantScope = '*' | 'docs.create' | 'docs.read' | 'docs.delete' | 'tokens.mint';

/**
 * Doc-scope strings on the wire. After the scope-vocabulary migration
 * this type is intentionally loose (`string`) — the closed enum lives
 * in `@embedpdf/engine-core/auth/scope` as `DocCapability`, and the
 * authoritative check is `validateScopeArray()` called from
 * `coerceClaims()` at verify time. Any string makes it through the
 * type system; only valid scope-vocabulary strings make it through
 * verification.
 *
 * Legacy values (`doc.read`, `doc.edit-pages`, `doc.save`) are no
 * longer recognised and cause verification to fail with a clear
 * error naming the offending scope.
 *
 * @deprecated Routes should use `DocCapability` from engine-core and
 * the resource/capability/collab helpers in `jwt-plugin.ts`. This
 * alias remains only for legacy callers that haven't migrated yet.
 */
export type DocScope = string;

export type JwtClaimsExtras = Record<string, unknown>;

/**
 * Optional revocation hook: the verifier asks `isRevoked(jti)` after
 * signature verification. Returning `true` causes the verifier to
 * throw — the JWT plugin then turns that into a 401.
 *
 * The guard is intentionally async: production impls back the LRU
 * with a DB query. Tests pass a sync wrapper.
 */
export interface RevocationCheck {
  isRevoked(jti: string): Promise<boolean>;
}

/**
 * Per-issuer/audience validation profile. Applied by every verifier
 * implementation, regardless of mode. Mirrors `jose.JWTVerifyOptions`
 * but stripped to the subset we always set.
 */
export interface JwtAudienceProfile {
  /** Required `iss` claim value(s). */
  issuer?: string | ReadonlyArray<string>;
  /** Required `aud` claim value(s). */
  audience?: string | ReadonlyArray<string>;
  /** `exp` clock skew tolerance in seconds. Defaults to 30. */
  clockSkewSeconds?: number;
}

/**
 * Mode-specific configuration.
 *
 * - `hs256`: Shared-secret JWT. Existing dev/test path.
 * - `asymmetric`: RS256 / RS384 / RS512 / ES256 / ES384 / ES512 with a
 *   single PEM public key. Configured for `single-tenant` deploys.
 * - `jwks`: Multi-tenant SaaS — keys fetched from `jwksUri`, cached.
 *   The `cacheStore` adapter persists JWKS across restarts.
 *
 * The factory `createJwtVerifier(config)` picks the right impl.
 */
export type JwtVerifierConfig =
  | (JwtAudienceProfile & {
      mode: 'hs256';
      secret: string | Buffer;
      revocation?: RevocationCheck;
    })
  | (JwtAudienceProfile & {
      mode: 'asymmetric';
      /** PEM SPKI public key (the `-----BEGIN PUBLIC KEY-----` block). */
      publicKeyPem: string;
      /** Algorithm to enforce; must match the key type. */
      algorithm: 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
      revocation?: RevocationCheck;
    })
  | (JwtAudienceProfile & {
      mode: 'jwks';
      jwksUri: string;
      /** Algorithms accepted from the issuer. Empty => accept any RS/ES. */
      algorithms?: ReadonlyArray<string>;
      /** Persistent JWKS cache adapter. Optional. */
      cacheStore?: JwksCacheStore;
      /** TTL for the in-memory + persistent cache. Defaults to 10 min. */
      cacheTtlMs?: number;
      revocation?: RevocationCheck;
    });

/**
 * Persistent JWKS cache. Backed by the `jwks_cache` table; injected
 * by the JWT plugin so the verifier stays DB-agnostic at the type
 * level.
 */
export interface JwksCacheStore {
  get(issuer: string): Promise<{ jwks: { keys: JWK[] }; expiresAt: number } | null>;
  set(issuer: string, jwks: { keys: JWK[] }, ttlMs: number): Promise<void>;
}

/**
 * Common verifier interface. All modes return a fully-validated
 * `JwtClaims`; the caller can then attach to the request context.
 */
export interface JwtVerifier {
  verify(token: string): Promise<JwtClaims>;
}

/** Algorithms a `jwks` verifier accepts when `algorithms` is omitted. */
const DEFAULT_JWKS_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'] as const;

/**
 * Factory: returns the right `JwtVerifier` impl for the supplied
 * config. The JWT plugin only ever calls this — individual classes
 * are exported for tests and for advanced wiring.
 */
export function createJwtVerifier(config: JwtVerifierConfig): JwtVerifier {
  switch (config.mode) {
    case 'hs256':
      return new Hs256Verifier(config);
    case 'asymmetric':
      return new AsymmetricVerifier(config);
    case 'jwks':
      return new JwksVerifier(config);
  }
}

// ----------------- impls -----------------

const HEADER_HS256 = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

/**
 * Lightweight HS256 verifier — kept as a hand-rolled impl rather than
 * delegating to jose, because tests sign tokens with this same module
 * (no Web Crypto SubtleCrypto dance on every test). Behaviourally
 * identical to jose for the HS256 subset we use.
 */
export class Hs256Verifier implements JwtVerifier {
  private readonly secret: string | Buffer;
  private readonly skew: number;
  private readonly profile: JwtAudienceProfile;
  private readonly revocation: RevocationCheck | undefined;

  constructor(
    opts: { secret: string | Buffer; revocation?: RevocationCheck } & JwtAudienceProfile,
  ) {
    this.secret = opts.secret;
    this.skew = opts.clockSkewSeconds ?? 30;
    this.profile = opts;
    this.revocation = opts.revocation;
  }

  async verify(token: string): Promise<JwtClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('malformed jwt');
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    const expected = signHmac(this.secret, `${headerB64}.${payloadB64}`);
    const got = Buffer.from(sigB64, 'base64url');
    const want = Buffer.from(expected, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new Error('invalid jwt signature');
    }
    // Single canonical coercion path for every verifier: this is
    // where the token-class mutex check (Layer 2) lives.
    const rawPayload = decodePayloadJson(payloadB64);
    const claims = coerceClaims(rawPayload);
    validateClaims(claims, this.profile, this.skew);
    await checkRevocation(claims, this.revocation);
    return claims;
  }
}

/**
 * RS256/ES256-style verifier with a single static public key. Lower
 * operational complexity than JWKS; right call when the customer has
 * one stable signing key and rotates manually.
 */
export class AsymmetricVerifier implements JwtVerifier {
  private readonly keyPromise: Promise<ImportedKey>;
  private readonly algorithm: string;
  private readonly profile: JwtAudienceProfile;
  private readonly revocation: RevocationCheck | undefined;

  constructor(
    opts: {
      publicKeyPem: string;
      algorithm: 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
      revocation?: RevocationCheck;
    } & JwtAudienceProfile,
  ) {
    this.algorithm = opts.algorithm;
    this.profile = opts;
    this.revocation = opts.revocation;
    this.keyPromise = importSPKI(opts.publicKeyPem, opts.algorithm);
  }

  async verify(token: string): Promise<JwtClaims> {
    const key = await this.keyPromise;
    const { payload } = await jwtVerify(token, key, {
      algorithms: [this.algorithm],
      issuer: this.profile.issuer as string | string[] | undefined,
      audience: this.profile.audience as string | string[] | undefined,
      clockTolerance: (this.profile.clockSkewSeconds ?? 30) + 's',
    });
    const claims = coerceClaims(payload);
    await checkRevocation(claims, this.revocation);
    return claims;
  }
}

/**
 * Remote-JWKS verifier with two-tier cache:
 *   1. In-memory `keys` set, refreshed on TTL or `kid` miss.
 *   2. Persistent `JwksCacheStore` (DB table) for cold-boot.
 *
 * On every verify we resolve the key set via `getKey`:
 *   - If memory cache is fresh, use it.
 *   - Else, fetch from `jwksUri`, refresh both caches.
 *
 * If verification fails with "no key for kid", we hard-refresh from
 * the network exactly once (covers key rotation).
 */
export class JwksVerifier implements JwtVerifier {
  private readonly jwksUri: string;
  private readonly profile: JwtAudienceProfile;
  private readonly algorithms: ReadonlyArray<string>;
  private readonly cacheStore: JwksCacheStore | undefined;
  private readonly cacheTtlMs: number;
  private readonly revocation: RevocationCheck | undefined;

  private inMemory: { keys: JWK[]; expiresAt: number } | null = null;
  private localGetKey: JWTVerifyGetKey | null = null;
  private remoteGetKey: JWTVerifyGetKey | null = null;

  constructor(
    opts: {
      jwksUri: string;
      algorithms?: ReadonlyArray<string>;
      cacheStore?: JwksCacheStore;
      cacheTtlMs?: number;
      revocation?: RevocationCheck;
    } & JwtAudienceProfile,
  ) {
    this.jwksUri = opts.jwksUri;
    this.profile = opts;
    this.algorithms = opts.algorithms ?? DEFAULT_JWKS_ALGS;
    this.cacheStore = opts.cacheStore;
    this.cacheTtlMs = opts.cacheTtlMs ?? 10 * 60 * 1000;
    this.revocation = opts.revocation;
  }

  async verify(token: string): Promise<JwtClaims> {
    const getKey = await this.resolveGetKey();
    let result: { payload: JWTPayload };
    try {
      result = await jwtVerify(token, getKey, {
        algorithms: [...this.algorithms],
        issuer: this.profile.issuer as string | string[] | undefined,
        audience: this.profile.audience as string | string[] | undefined,
        clockTolerance: (this.profile.clockSkewSeconds ?? 30) + 's',
      });
    } catch (err) {
      // Key rotation: if the JWT references an unknown kid, jose's
      // remote JWKS already retries via the standard cache. Our local
      // cache might be stale though; invalidate and try the remote
      // fetcher directly exactly once.
      if (isKidMiss(err)) {
        this.inMemory = null;
        this.localGetKey = null;
        const fresh = this.remoteFetcher();
        result = await jwtVerify(token, fresh, {
          algorithms: [...this.algorithms],
          issuer: this.profile.issuer as string | string[] | undefined,
          audience: this.profile.audience as string | string[] | undefined,
          clockTolerance: (this.profile.clockSkewSeconds ?? 30) + 's',
        });
      } else {
        throw err;
      }
    }
    const claims = coerceClaims(result.payload);
    await checkRevocation(claims, this.revocation);
    return claims;
  }

  /**
   * Hot path: prefer the in-memory local JWKS set; fall back to
   * persistent cache; finally hit the wire via `createRemoteJWKSet`.
   * The first successful fetch warms both tiers.
   */
  private async resolveGetKey(): Promise<JWTVerifyGetKey> {
    const now = Date.now();
    if (this.inMemory && this.inMemory.expiresAt > now && this.localGetKey) {
      return this.localGetKey;
    }
    if (this.cacheStore) {
      const persisted = await this.cacheStore.get(this.jwksUri);
      if (persisted && persisted.expiresAt > now) {
        this.inMemory = { keys: persisted.jwks.keys, expiresAt: persisted.expiresAt };
        this.localGetKey = createLocalJWKSet(persisted.jwks);
        return this.localGetKey;
      }
    }
    return this.remoteFetcher();
  }

  private remoteFetcher(): JWTVerifyGetKey {
    // `createRemoteJWKSet` has its own in-memory TTL cache; we wrap
    // a single instance and reuse it. On every call jose checks its
    // cache first, so this is cheap. We also refresh our own cache
    // after a successful fetch by hooking into the function.
    if (!this.remoteGetKey) {
      const remote = createRemoteJWKSet(new URL(this.jwksUri), {
        cooldownDuration: 30_000,
        cacheMaxAge: this.cacheTtlMs,
      });
      // After-the-fact persistence: every verify path that returns
      // successfully calls `getKey(header, token)` exactly once, so
      // wrap it to fan-out into our persistent cache. We can't peek
      // jose's internal cache, but we can refetch the JWKS once and
      // store it.
      this.remoteGetKey = (async (header, token) => {
        const key = await remote(header, token);
        // Best-effort persistence; failure must not affect verify.
        if (this.cacheStore) {
          this.persistJwks().catch(() => {
            /* swallow */
          });
        }
        return key;
      }) as JWTVerifyGetKey;
    }
    return this.remoteGetKey;
  }

  private async persistJwks(): Promise<void> {
    if (!this.cacheStore) return;
    try {
      const res = await fetch(this.jwksUri);
      if (!res.ok) return;
      const jwks = (await res.json()) as { keys: JWK[] };
      if (!jwks || !Array.isArray(jwks.keys)) return;
      await this.cacheStore.set(this.jwksUri, jwks, this.cacheTtlMs);
      this.inMemory = { keys: jwks.keys, expiresAt: Date.now() + this.cacheTtlMs };
      this.localGetKey = createLocalJWKSet(jwks);
    } catch {
      // best-effort
    }
  }
}

// ----------------- helpers -----------------

function isKidMiss(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code === 'ERR_JWKS_NO_MATCHING_KEY') return true;
  const msg = (err as { message?: string }).message ?? '';
  return msg.includes('no applicable key');
}

async function checkRevocation(
  claims: JwtClaims,
  revocation: RevocationCheck | undefined,
): Promise<void> {
  if (!revocation || !claims.jti) return;
  if (await revocation.isRevoked(claims.jti)) {
    throw new Error('token revoked');
  }
}

function decodePayloadJson(payloadB64: string): JWTPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('malformed jwt payload');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('jwt payload must be an object');
  }
  return payload as JWTPayload;
}

/**
 * Parse a JWT payload into our typed claim object.
 *
 * Token-class commitment lives here: the class is determined purely
 * by the presence of `doc_id`. Both classes legitimately carry a
 * `scope` array (in different namespaces); the array contents are
 * preserved as-is and validated for type/shape, not values. Closed-
 * enum enforcement happens at the route-guard layer where we know
 * which scope set is in effect.
 *
 * Defense-in-depth: even with no parse-time mutex, an obviously
 * misshapen token (`{ doc_id, scope: ['docs.create'] }`) cannot
 * cause privilege escalation. The token is tagged as `DocUserClaims`;
 * tenant-route guards reject anything that isn't `TenantClaims`,
 * and doc-route guards only honour `DocScope` values.
 */
function coerceClaims(payload: JWTPayload): JwtClaims {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('jwt payload must be an object');
  }
  const sub = payload.sub;
  const tenant_id = (payload as { tenant_id?: unknown }).tenant_id;
  if (typeof sub !== 'string') throw new Error('jwt missing sub');
  if (typeof tenant_id !== 'string' || !tenant_id) throw new Error('jwt missing tenant_id');
  const base: BaseClaims = {
    sub,
    tenant_id,
    iat: typeof payload.iat === 'number' ? payload.iat : 0,
    exp: typeof payload.exp === 'number' ? payload.exp : 0,
  };
  if (typeof payload.jti === 'string') base.jti = payload.jti;
  Object.assign(base, coerceIdentityClaims(payload));
  const embedpdf = (payload as { embedpdf?: unknown }).embedpdf;
  if (embedpdf && typeof embedpdf === 'object') {
    const nested = (embedpdf as { unlock_key?: unknown }).unlock_key;
    if (typeof nested === 'string' && nested.length > 0) {
      base.embedpdf = { unlock_key: nested };
    }
  }

  // Pull and validate the class-specific fields without committing
  // to a subtype yet. The `scope` array is stored as `string[]`
  // here; the route guard's `hasTenantScope` / `hasDocScope` checks
  // do the value-set narrowing.
  const scopeRaw = (payload as { scope?: unknown }).scope;
  let scope: ReadonlyArray<string> | undefined;
  if (Array.isArray(scopeRaw)) {
    for (const s of scopeRaw) {
      if (typeof s !== 'string') throw new Error('jwt scope must contain strings');
    }
    scope = scopeRaw as ReadonlyArray<string>;
  } else if (scopeRaw !== undefined) {
    throw new Error('jwt scope must be an array');
  }

  const docIdRaw = (payload as { doc_id?: unknown }).doc_id;
  let docId: string | undefined;
  if (typeof docIdRaw === 'string') {
    if (docIdRaw.length === 0) throw new Error('jwt doc_id must be a non-empty string');
    docId = docIdRaw;
  } else if (docIdRaw !== undefined) {
    throw new Error('jwt doc_id must be a non-empty string');
  }

  const layerNameRaw = (payload as { layer_name?: unknown }).layer_name;
  let layerName: string | undefined;
  if (typeof layerNameRaw === 'string') {
    if (layerNameRaw.length === 0) throw new Error('jwt layer_name must be a non-empty string');
    layerName = layerNameRaw;
  } else if (layerNameRaw !== undefined) {
    throw new Error('jwt layer_name must be a non-empty string');
  }

  if (layerName !== undefined && docId === undefined) {
    // `layer_name` only makes sense on a doc-scoped token. Without
    // a `doc_id` it has nothing to scope to and is almost certainly
    // a misconfigured token.
    throw new Error('jwt layer_name requires doc_id');
  }

  if (docId !== undefined) {
    // Doc-scoped class. We tolerate a missing `scope` field on the
    // wire and synthesize `[]`; the route guard then rejects it.
    //
    // Strict scope-vocabulary validation: every entry must parse as a
    // capability, collab scope, virtual (`pdf.permissions`), or wildcard
    // per @embedpdf/engine-core/auth/scope. Unknown strings — including
    // removed legacy names like `doc.read`, `doc.edit-pages`, `doc.save`
    // — cause the JWT to be rejected with a clear error naming the
    // offending scope. The JWT plugin maps the throw to a 401 response.
    if (scope) {
      try {
        validateScopeArray(scope);
      } catch (err) {
        if (err instanceof InvalidScope) {
          throw new Error(`jwt scope rejected: ${err.message}`);
        }
        throw err;
      }
    }
    const docScope = (scope ?? []) as ReadonlyArray<DocScope>;
    const out: DocUserClaims = layerName
      ? { ...base, doc_id: docId, scope: docScope, layer_name: layerName }
      : { ...base, doc_id: docId, scope: docScope };
    return out;
  }
  // Tenant token.
  // Tenant scopes live in a separate namespace (`TenantScope`) and are
  // NOT validated by engine-core's scope vocabulary, which targets the
  // doc-scoped capability/collab grammar.
  const tenantScope = (scope ?? []) as ReadonlyArray<TenantScope>;
  const out: TenantClaims = { ...base, scope: tenantScope };
  return out;
}

function validateClaims(claims: JwtClaims, profile: JwtAudienceProfile, skew: number): void {
  if (typeof claims.tenant_id !== 'string' || !claims.tenant_id)
    throw new Error('jwt missing tenant_id');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('jwt missing sub');
  if (typeof claims.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now > claims.exp + skew) throw new Error('jwt expired');
  }
  if (profile.issuer !== undefined) {
    const exp = profile.issuer;
    const got = (claims as { iss?: string }).iss;
    const ok = Array.isArray(exp) ? exp.includes(got ?? '') : got === exp;
    if (!ok) throw new Error('jwt issuer mismatch');
  }
  if (profile.audience !== undefined) {
    const exp = profile.audience;
    const got = (claims as { aud?: string | string[] }).aud;
    const gotArr = Array.isArray(got) ? got : got ? [got] : [];
    const expArr = Array.isArray(exp) ? exp : [exp];
    if (!expArr.some((a) => gotArr.includes(a))) throw new Error('jwt audience mismatch');
  }
}

function coerceIdentityClaims(payload: JWTPayload): IdentityClaims {
  const identity: IdentityClaims = {};
  const userId = optionalStringClaim(payload, 'user_id');
  if (userId) identity.user_id = userId;
  const groupId = optionalStringClaim(payload, 'group_id');
  if (groupId) identity.group_id = groupId;
  const displayName = optionalStringClaim(payload, 'display_name');
  if (displayName) identity.display_name = displayName;
  const groups = optionalStringArrayClaim(payload, 'groups');
  if (groups.length > 0) identity.groups = groups;
  return identity;
}

function optionalStringClaim(payload: JWTPayload, key: string): string | undefined {
  const value = (payload as Record<string, unknown>)[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  return value.length > 0 ? value : undefined;
}

function optionalStringArrayClaim(payload: JWTPayload, key: string): string[] {
  const value = (payload as Record<string, unknown>)[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value
    .map((item, i) => {
      if (typeof item !== 'string') throw new Error(`${key}[${i}] must be a string`);
      return item;
    })
    .filter((item) => item.length > 0);
}

/**
 * Type guard for tenant-class tokens. The `?: never` discriminator
 * on the union means the absence of `doc_id` is sufficient to
 * commit to the tenant branch.
 */
export function isTenantClaims(claims: JwtClaims): claims is TenantClaims {
  return typeof (claims as { doc_id?: unknown }).doc_id !== 'string';
}

/** Type guard for doc-scoped tokens. */
export function isDocUserClaims(claims: JwtClaims): claims is DocUserClaims {
  return typeof (claims as { doc_id?: unknown }).doc_id === 'string';
}

/**
 * Returns true if `claims` is a tenant token carrying at least one
 * of `wanted` (or the `*` wildcard). Doc-scoped tokens always
 * return false; their `scope` field lives in a different namespace
 * (`DocScope`) and is checked by `hasDocScope`.
 */
export function hasTenantScope(claims: JwtClaims, wanted: ReadonlyArray<TenantScope>): boolean {
  if (!isTenantClaims(claims)) return false;
  return arraysIntersectWithStar(claims.scope, wanted);
}

/**
 * Returns true if `claims` is a doc-scoped token carrying at least
 * one of `wanted` (or the `*` wildcard). Tenant tokens always
 * return false here — they're checked separately by `hasTenantScope`
 * and authorise doc access via the route guard's tenant-branch.
 */
export function hasDocScope(claims: JwtClaims, wanted: ReadonlyArray<DocScope>): boolean {
  if (!isDocUserClaims(claims)) return false;
  return arraysIntersectWithStar(claims.scope, wanted);
}

function arraysIntersectWithStar(
  have: ReadonlyArray<string>,
  wanted: ReadonlyArray<string>,
): boolean {
  if (have.length === 0) return false;
  if (have.includes('*')) return true;
  for (const w of wanted) {
    if (have.includes(w)) return true;
  }
  return false;
}

/**
 * Mint an HS256 token. Test/dev-only helper. Real cloud control
 * plane uses a different signer and rotates keys via JWKS.
 *
 * The class of the resulting token is determined by `doc_id`:
 * absent → `TenantClaims` (scope interpreted as `TenantScope[]`),
 * present → `DocUserClaims` (scope interpreted as `DocScope[]`).
 *
 * Scope is typed loosely as `string[]` because the two scope
 * namespaces overlap on `*` but otherwise differ; callers pass
 * whichever scope set matches their intended class, and the route
 * guards do the value-set narrowing.
 */
export interface SignDevTokenInput {
  sub: string;
  tenant_id: string;
  ttlSeconds?: number;
  /**
   * Operations the token is authorised for. Interpreted as
   * `TenantScope[]` when `doc_id` is absent, `DocScope[]` when
   * present.
   */
  scope?: ReadonlyArray<TenantScope | DocScope | string>;
  /** Doc-user token. Present iff the token is doc-scoped. */
  doc_id?: string;
  /** Optional layer pin; only valid with `doc_id`. */
  layer_name?: string;
  jti?: string;
  extras?: JwtClaimsExtras;
}

export function signDevToken(secret: string | Buffer, input: SignDevTokenInput): string {
  if (input.layer_name && !input.doc_id) {
    throw new Error('signDevToken: layer_name requires doc_id');
  }
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 3600;
  const fullClaims: Record<string, unknown> = {
    iat: now,
    exp: now + ttl,
    sub: input.sub,
    tenant_id: input.tenant_id,
    ...(input.scope ? { scope: input.scope } : {}),
    ...(input.doc_id ? { doc_id: input.doc_id } : {}),
    ...(input.layer_name ? { layer_name: input.layer_name } : {}),
    ...(input.jti ? { jti: input.jti } : {}),
    ...(input.extras ?? {}),
  };
  const payloadB64 = base64url(JSON.stringify(fullClaims));
  const data = `${HEADER_HS256}.${payloadB64}`;
  const sig = signHmac(secret, data);
  return `${data}.${sig}`;
}

function signHmac(secret: string | Buffer, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}
