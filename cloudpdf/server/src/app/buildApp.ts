import { TextDecoder } from 'node:util';

import { adminOperations, adminWirePaths } from '@cloudpdf/contract';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';

import { DrainCoordinator } from './drain';
import { registerMetrics } from './metrics';

import type { AuthFailureLimiterOptions } from './auth-failure-limiter';
import { registerJwtAuth, requireApiToken } from './jwt-plugin';
import { assertProductionSecret, requiresProductionSecrets, resolveSecret } from './secret-policy';
import { DbJwksCacheStore } from '../auth/JwksCacheStore';
import {
  signDevToken,
  type JwtClaims,
  type JwtVerifierConfig,
  type JwksCacheStore,
  type RevocationCheck,
  type SignDevTokenInput,
} from '../auth/JwtVerifier';
import { RevokedJtisGuard } from '../auth/RevokedJtisGuard';
import { SuspendedTenantsGuard } from '../auth/SuspendedTenantsGuard';
import { NoneCdnSigner } from '../cdn/adapters/NoneCdnSigner';
import type { CdnSigner } from '../cdn/CdnSigner';
import { validate as validateMigrations, type MigrationSource } from '../db/migrator/runner';
import { DocumentImportsRepo } from '../db/repos/document_imports.repo';
import { DocumentsRepo } from '../db/repos/documents.repo';
import { DocumentPagesRepo, LayerPagesRepo, LayersRepo } from '../db/repos/page_state.repo';
import { PdfPasswordSessionsRepo } from '../db/repos/pdf_password_sessions.repo';
import { PdfPasswordVerificationsRepo } from '../db/repos/pdf_password_verifications.repo';
import { SecurityEventsRepo } from '../db/repos/security-events.repo';
import { ShareGrantsRepo } from '../db/repos/share_grants.repo';
import { TenantUsageRepo } from '../db/repos/tenant_usage.repo';
import { TenantsRepo } from '../db/repos/tenants.repo';
import { WeakAnnotationSessionsRepo } from '../db/repos/weak_annotation_sessions.repo';
import type { Database as Schema } from '../db/schema';
import type { ImportConnection } from '../import/config/ImportConnectionSchema';
import { defaultImportPolicy, type ImportPolicy } from '../import/config/ImportPolicySchema';
import { ImportConnectionRegistry } from '../import/ImportConnectionRegistry';
import { ImportWorker } from '../import/ImportWorker';
import type { ConnectedUsageReporter } from '../licensing/ConnectedUsageReporter';
import type { LicenseGate } from '../licensing/LicenseRuntime';
import { isLicenseGateTrusted } from '../licensing/trusted-license-gates';
import { UsageMeters } from '../licensing/UsageMeters';
import { InProcessRealtimeBus, type RealtimeBus } from '../realtime/RealtimeBus';
import { SharpImageEncoder } from '../render/SharpImageEncoder';
import { registerAccessRoutes } from '../routes/access';
import { registerAdminDocumentsRoutes } from '../routes/admin/documents';
import { registerAdminSharesRoutes } from '../routes/admin/shares';
import { registerAdminTenantsRoutes } from '../routes/admin/tenants';
import { registerAdminTokensRoutes } from '../routes/admin/tokens';
import { registerAnnotationRoutes } from '../routes/annotations';
import { registerAttachmentRoutes } from '../routes/attachments';
import { registerDocsRoutes } from '../routes/docs';
import { registerEventsRoutes } from '../routes/events';
import { registerFormRoutes } from '../routes/forms';
import { registerMetadataRoutes } from '../routes/metadata';
import { registerPageRoutes } from '../routes/pages';
import { registerRedactionRoutes } from '../routes/redactions';
import { registerSearchRoutes } from '../routes/search';
import { registerShareSessionRoutes } from '../routes/share-sessions';
import { EngineHostClient } from '../runtime/EngineHostClient';
import type { EnginePool } from '../runtime/EnginePool';
import { WorkerThreadPool, type FallbackFontDescriptor } from '../runtime/WorkerThreadPool';
import type { KmsKeyring } from '../security';
import { CloudRevisionBridge } from '../services/CloudRevisionBridge';
import { DerivedRenderService } from '../services/DerivedRenderService';
import {
  DocumentLifecycleService,
  type UploadProxyPolicy,
} from '../services/DocumentLifecycleService';
import { DocumentSecurityProbe } from '../services/DocumentSecurityProbe';
import { DocumentService } from '../services/DocumentService';
import { EventLogService } from '../services/EventLogService';
import { LayerService } from '../services/LayerService';
import { LayerStateService } from '../services/LayerStateService';
import { WeakAnnotationSessionService } from '../services/WeakAnnotationSessionService';
import { BaseFileCache } from '../storage/BaseFileCache';
import type { ObjectStoreWithInfo } from '../storage/ObjectStore';

export interface BuildAppOptions {
  /** Required commercial gate for every server construction. */
  licenseGate: LicenseGate;
  /** Connected-only reporting diagnostics; never constructed in air-gap mode. */
  usageReporter?: Pick<ConnectedUsageReporter, 'status'>;
  /**
   * Cross-replica mutation doorbell. Defaults to in-process delivery —
   * complete for single-replica deployments (the SQLite profile) and tests.
   * Multi-replica Postgres deployments MUST pass a `PostgresRealtimeBus`
   * (the production entrypoint does this by default when the driver is
   * postgres) or replicas will not see each other's mutations.
   */
  realtimeBus?: RealtimeBus;
  /**
   * JWT verifier config. Use `{ mode: 'hs256', secret }` for Tiny/dev
   * deployments, or RS/ES/JWKS modes for production IdP integration.
   */
  verifier: JwtVerifierConfig;
  /**
   * Static API auth tokens (the deployment's root credential, valid on
   * every surface). A list so rotation is overlap-then-retire. Empty or
   * absent disables the credential entirely. Production licenses require
   * every configured token to be a random secret of at least 32 bytes.
   */
  apiAuthTokens?: ReadonlyArray<string>;
  /**
   * If true and `db` is supplied, wire a `RevokedJtisGuard` into the
   * verifier so revoked `jti`s are rejected at request time. Off by
   * default to keep dev tests cheap.
   */
  enableRevocation?: boolean;
  /**
   * If true and `db` + `verifier.mode === 'jwks'`, plug the
   * persistent `jwks_cache` table into the JWKS verifier so the
   * cache survives restarts.
   */
  enableJwksPersistence?: boolean;
  poolSize?: number;
  /**
   * Deployment fallback fonts, registered on every worker thread at startup.
   * Server-owned font policy: cloud clients cannot configure fonts, so the
   * server decides which fallback fonts cover missing glyphs (page render +
   * annotation appearance generation). Each is a file path that PDFium
   * range-reads on demand — large CJK fallback fonts cost a file handle, not
   * resident RAM. A font that fails to load fails worker startup.
   */
  fallbackFonts?: ReadonlyArray<FallbackFontDescriptor>;
  /**
   * URL of the worker_thread entry script. The package's main entry exports
   * `defaultWorkerEntryUrl` which works in both dev (tsx -> src/) and after
   * a Vite build (ESM dist/). Pass that unless you have a custom worker.
   */
  /**
   * Set to `null` (or omit) to skip worker_thread initialisation. Use
   * this for admin-only deployments where no engine reads happen
   * through this Fastify process. The admin routes don't depend on
   * the pool.
   */
  workerEntry: URL | string | null;
  /** Override Fastify body limit. Defaults to 50 MiB. */
  bodyLimit?: number;
  /** Origin-mediated upload policy. Defaults to `fallback-only`. */
  uploadProxyPolicy?: UploadProxyPolicy;
  /**
   * Server-side pull policy for `documents.importFrom`. Defaults to the
   * schema defaults (enabled, https-only, public networks, 128 MiB).
   * Pass `{ ...defaultImportPolicy(), enabled: false }` to disable.
   */
  importPolicy?: ImportPolicy;
  /**
   * Operator-registered import connections (the `connection` source
   * kind). Validated at construction — duplicate ids and invalid
   * scope/credential combinations refuse to boot.
   */
  importConnections?: ReadonlyArray<ImportConnection>;
  /** Async import worker idle-poll interval; tests shrink it. Default 1s. */
  importWorkerPollMs?: number;
  /**
   * Fastify `trustProxy` passthrough. REQUIRED for `request.ip` (and thus
   * the auth-failure limiter) to see real client addresses when the server
   * runs behind a load balancer / reverse proxy: `true` trusts
   * `X-Forwarded-For` from the direct peer, a number trusts that many hops,
   * a string/array trusts specific proxy addresses or CIDRs. Leave unset
   * when clients connect directly.
   */
  trustProxy?: boolean | number | string | string[];
  /**
   * Per-IP throttle on authentication FAILURES (never successful traffic).
   * Defaults to 30 failures / 60s per IP; pass `false` to disable when an
   * edge layer (WAF / ingress) already rate-limits. See `JwtPluginOptions`.
   */
  authFailureLimit?: Partial<AuthFailureLimiterOptions> | false;
  /**
   * CORS for browser-direct deployments. `'*'` reflects any request
   * origin — acceptable because CORS here is transport permission, not
   * authorization: bearer tokens are the security boundary, and the
   * per-credential `origins` claim (plus per-grant allowlists) carries
   * the actual origin policy, which a static server-wide list cannot
   * express. Pass an explicit list to pin instead. Absent = CORS off
   * (today's behavior: same-origin or proxy-fronted deployments).
   */
  corsOrigins?: '*' | ReadonlyArray<string>;
  /**
   * Optional Kysely DB handle. When supplied together with `objectStore`,
   * the tenant/deployment admin surfaces are registered. Engine-only
   * deployments can omit both.
   */
  db?: Kysely<Schema>;
  objectStore?: ObjectStoreWithInfo;
  /**
   * Optional envelope keyring for features that need short-lived
   * encrypted server state (for example encrypted PDF password
   * sessions in the CDN phase). Presently stored on the app bundle
   * so future services can consume it without changing boot wiring.
   */
  kms?: KmsKeyring;
  /**
   * Optional CDN signer. When omitted, the access route falls back to
   * a built-in `NoneCdnSigner` (origin reads only, no signing). Wire
   * a real signer to enable per-caller signed URLs / cookies and
   * surface them via the /access response.
   */
  cdnSigner?: CdnSigner;
  /**
   * HMAC secret for password verification cache rows. The cache stores an
   * HMAC proof of the document password — non-reversible only while this
   * secret stays secret and strong, so production-license deployments must
   * set it (>= 32 random bytes; env `CLOUDPDF_PASSWORD_VERIFICATION_HMAC_SECRET`)
   * and buildApp refuses to boot otherwise. Development licenses fall back
   * to a local-only constant.
   */
  pdfPasswordVerificationHmacSecret?: string;
  pdfPasswordVerificationTtlMs?: number;
  /**
   * Server-side key material for encrypted password sessions: signs renewal
   * grants and feeds the final-key derivation. Same production rule as the
   * verification secret (>= 32 random bytes; env
   * `CLOUDPDF_PASSWORD_SESSION_SERVER_SECRET`, id via `..._SECRET_ID`).
   */
  pdfPasswordSessionServerSecret?: string | Buffer;
  pdfPasswordSessionServerSecretId?: string;
  pdfPasswordSessionTtlMs?: number;
  pdfPasswordSessionRenewalTtlMs?: number;
  /**
   * If true and an admin call arrives for a tenant that doesn't have a
   * `tenants` row, lazily create one. Convenient for dev / single-tenant
   * deploys; production deployments should leave this off and provision
   * explicitly.
   */
  autoProvisionTenant?: boolean;
  /**
   * Interval for the background sweeper that GCs `pending` rows older
   * than `pendingTtlMs`. Set to 0 to disable. Defaults to 60_000 ms.
   */
  sweepIntervalMs?: number;
  /** Max age of a `pending` doc before it's considered abandoned. */
  pendingTtlMs?: number;
  /**
   * Phase 3 — when supplied (with `db`, `objectStore`, and a worker
   * pool), enables the cloud `/v1/docs/...` routes via the
   * `DocumentService` orchestrator. The required pieces are:
   *
   *   - `cacheRoot`        absolute path the BaseFileCache uses
   *   - `cacheMaxBytes`    disk budget (default 4 GiB)
   *   - `maxDocsPerSlot`   worker pool slot capacity (default 64)
   *
   * Disable by leaving `cacheRoot` unset.
   */
  cacheRoot?: string;
  cacheMaxBytes?: number;
  maxDocsPerSlot?: number;
  /**
   * Migration set this build expects to be applied. When supplied
   * (alongside `db`), buildApp runs `validate()` at boot and refuses
   * to start if the DB has drift (checksum mismatch on an applied
   * migration, or a migration applied in DB but missing in code).
   *
   * Set `failOnPending: true` to also refuse to start when pending
   * migrations exist — recommended for production where operators
   * run `migrate up` explicitly before rolling out new pods.
   */
  expectedMigrations?: ReadonlyArray<MigrationSource>;
  /** Treat pending migrations as drift at boot. Defaults to false. */
  failOnPending?: boolean;
  /**
   * The render lattice: canonical FULL-PAGE
   * `viewport.width` points whose renders are DURABLE derived artifacts —
   * the bounded quantity is output pixels, never zoom. `maxRenderPixels`
   * is the worker-side allocation budget every server render carries.
   * `enforce: true` rejects off-lattice versioned FULL-PAGE tokens with
   * 400 (flip on once clients ship `snapFullPageViewport`); rect targets
   * are exempt (the future tile policy's jurisdiction). Default false =
   * off-lattice renders are computed but never persisted.
   * `appearanceScales` is the annotation-appearance scale lattice
   * (default `[1, 2, 4]`) — enforced the same way on versioned
   * appearance tokens.
   */
  renderLattice?: {
    widths?: number[];
    appearanceScales?: number[];
    maxRenderPixels?: number;
    enforce?: boolean;
  };
  /**
   * Budget for `app.close()` inside `shutdown()` before teardown
   * proceeds anyway (default 30s). Keep it BELOW the supervisor's kill
   * deadline (Kubernetes `terminationGracePeriodSeconds`, `docker stop`
   * timeout) so pool + cache teardown always runs before SIGKILL.
   */
  shutdownTimeoutMs?: number;
  /**
   * Settle window between failing readiness (+ ending SSE streams) and
   * closing the listener (default 0). For probe-driven balancers that
   * must observe `/readyz` 503 before the socket starts refusing;
   * Kubernetes deployments use a preStop sleep instead.
   */
  shutdownDrainMs?: number;
  /**
   * Expose a Prometheus `/metrics` endpoint (`CLOUDPDF_METRICS=1`).
   * Unauthenticated when enabled — scrape it inside the private
   * network/cluster, like any /metrics.
   */
  metrics?: boolean;
  /**
   * Engine plane placement. `inline` (default): PDFium worker threads in
   * THIS process — a native crash costs the process. `host`: a
   * supervised child process — a native crash costs one engine respawn
   * (in-flight engine calls reject `RuntimeUnavailable`), never the API.
   */
  engineIsolation?: 'inline' | 'host';
  /**
   * Entry script for the engine-host child (host mode). The CLI passes
   * its dist URL; tests pass the TS source (with `engineHostExecArgv`
   * carrying a loader). Required when `engineIsolation: 'host'`.
   */
  engineHostEntry?: URL | string;
  /** Extra execArgv for the forked engine host (tests: ['--import','tsx']). */
  engineHostExecArgv?: string[];
}

export interface AppBundle {
  app: FastifyInstance;
  /** Present only when `workerEntry` was supplied. */
  pool?: EnginePool;
  /** Present only when `db` + `objectStore` were configured. */
  lifecycle?: DocumentLifecycleService;
  /** The derived-artifact plane for renders (cacheRoot + pool + db). */
  derivedRenders?: DerivedRenderService;
  /** Present only when `enableRevocation: true` with a `db`. */
  revokedJtisGuard?: RevokedJtisGuard;
  /** Present whenever a `db` is configured; tests use it to clear the TTL cache. */
  suspendedTenantsGuard?: SuspendedTenantsGuard;
  /** Phase 3 — present only when `cacheRoot` is set (+ pool + db). */
  documentService?: DocumentService;
  /** Phase 5 — write-side lazy layer materialization service. */
  layerService?: LayerService;
  /** Phase 3 — the base-file cache backing `documentService`. */
  baseFileCache?: BaseFileCache;
  /** Security substrate keyring, when configured by the caller. */
  kms?: KmsKeyring;
  /**
   * Flip `/readyz` to 503 and end every live SSE stream without closing
   * the listener. `shutdown()` calls this first; exposed for operators
   * and tests that need the drain state without the teardown.
   */
  beginDrain: () => void;
  shutdown: () => Promise<void>;
}

/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: The server-construction and request-gating code below is part of
 * CloudPDF's license-key functionality. Removing or modifying it to disable or
 * circumvent license enforcement, enable protected functionality without a
 * valid license key, or remove protected functionality is a breach of
 * FCL-1.0-ALv2 while this release is governed by that license. See
 * cloudpdf/server/LICENSE.
 *
 * Build the Fastify app with JWT auth, admin routes, and the cloud
 * document routes when their adapters are configured. Caller is
 * responsible for `app.listen()`.
 */
export async function buildApp(opts: BuildAppOptions): Promise<AppBundle> {
  if (!isLicenseGateTrusted(opts.licenseGate)) {
    throw new Error(
      'buildApp: licenseGate must be created by createLicenseRuntime from @cloudpdf/server',
    );
  }
  return buildAppUnchecked(opts);
}

/** Internal test-only construction seam. Not exported by the npm package. */
export async function buildAppForTesting(opts: BuildAppOptions): Promise<AppBundle> {
  // The isolation matrix: CLOUDPDF_TEST_ISOLATION=host runs the whole
  // suite against the child-process engine host (same tests, same
  // assertions — byte-identical results is the acceptance bar).
  const engineIsolation =
    opts.engineIsolation ??
    (process.env['CLOUDPDF_TEST_ISOLATION'] === 'host' ? 'host' : 'inline');
  if (engineIsolation === 'host') {
    return buildAppUnchecked({
      ...opts,
      engineIsolation,
      engineHostEntry:
        opts.engineHostEntry ?? new URL('../runtime/engine-host-entry.ts', import.meta.url),
      engineHostExecArgv: opts.engineHostExecArgv ?? ['--import', 'tsx'],
    });
  }
  return buildAppUnchecked({ ...opts, engineIsolation });
}

async function buildAppUnchecked(opts: BuildAppOptions): Promise<AppBundle> {
  // The cross-replica doorbell exists for the whole app lifetime: mutation
  // signals for SSE, revocation pushes for the auth guard + open streams.
  const realtimeBus = opts.realtimeBus ?? new InProcessRealtimeBus();
  // Secret hygiene is license-keyed: development keys + the test gate keep
  // zero-config dev fallbacks; every other license refuses to boot on
  // missing / publicly-known / short secrets (fail closed).
  const enforceProductionSecrets = requiresProductionSecrets(opts.licenseGate.getStatus());
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    ...(opts.trustProxy !== undefined ? { trustProxy: opts.trustProxy } : {}),
    bodyLimit: opts.bodyLimit ?? 50 * 1024 * 1024,
    // Use Fastify's default (`fast-querystring`) which yields a FLAT
    // Record<string, string> — `?viewport.kind=width` parses as
    // `{ "viewport.kind": "width" }`, not `{ viewport: { kind: "width" } }`.
    // The render wire format depends on this: dotted keys are reassembled
    // into nested objects by `unflatten()` in the route handler. DO NOT
    // switch to `qs` or another nesting parser — it would silently pre-nest
    // these keys and break the wire-roundtrip property.
    //
    // Bump the router's default `maxParamLength` (find-my-way's hard cap is
    // 100 chars by default) so render tokens like
    // `render@annotationVersion=N,background=X,contentVersion=N,format=webp,…`
    // can exceed that ceiling without 404-ing at the router. The token
    // codec separately enforces a 512-char limit, so this stays bounded.
    maxParamLength: 512,
  });
  const usageMeters = opts.db ? new UsageMeters(opts.db, opts.licenseGate) : undefined;
  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?', 1)[0] ?? request.url;
    if (pathname === '/healthz' || pathname === '/readyz' || pathname === '/v1/license/status') {
      return;
    }
    // Operational telemetry must stay scrapeable in restricted mode —
    // observing a deployment is not protected functionality.
    if (opts.metrics === true && pathname === '/metrics') {
      return;
    }

    const license = opts.licenseGate.getStatus();
    if (license.code !== 'VALID' && license.code !== 'VALID_TEST_LICENSE') {
      reply.header('X-CloudPDF-License-Status', license.code);
    }
    if (
      license.access === 'none' ||
      (license.access === 'restricted' && !isReadOnlyLicenseRequest(request.method, pathname))
    ) {
      return reply.code(403).send({
        error: {
          code: license.code,
          message: license.message,
          name: 'LicenseError',
        },
      });
    }
  });
  app.addHook('onClose', async () => {
    await realtimeBus.close();
  });

  // CORS before the auth hook so preflights (which carry no
  // Authorization) are answered instead of 401'd. `credentials` stays
  // false: the bearer rides an explicit header, never cookies.
  if (opts.corsOrigins !== undefined) {
    await app.register(cors, {
      origin: opts.corsOrigins === '*' ? true : [...opts.corsOrigins],
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['authorization', 'content-type', 'x-engine-session-id', 'last-event-id'],
      credentials: false,
      maxAge: 86_400,
    });
  }

  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });

  await app.register(multipart, {
    limits: { fileSize: opts.bodyLimit ?? 50 * 1024 * 1024 },
  });

  // Raw PDF parsers are retained for document APIs that accept binary
  // payloads. Upload proxy itself is multipart-only for SDK portability.
  app.addContentTypeParser(
    'application/pdf',
    { parseAs: 'buffer', bodyLimit: opts.bodyLimit ?? 50 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: opts.bodyLimit ?? 50 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );
  // Serialized form data (FDF/XFDF import bodies). Same raw-buffer
  // treatment: the payload goes to the worker byte-for-byte.
  app.addContentTypeParser(
    ['application/vnd.fdf', 'application/vnd.adobe.xfdf'],
    { parseAs: 'buffer', bodyLimit: opts.bodyLimit ?? 50 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );
  // Fastify's stock JSON parser rejects a bodyless request that still
  // advertises `Content-Type: application/json` (FST_ERR_CTP_EMPTY_JSON_BODY).
  // Real clients send exactly that shape on bodyless calls — the Fern
  // PHP/Go/Ruby SDKs stamp the header unconditionally, as do axios
  // instances with default headers and `curl -H` scripts — so treat an
  // empty body as no body. Non-empty bodies still go through the default
  // parser (keeping secure-json-parse's prototype-poisoning protection),
  // and handlers that require a body still 400 on `undefined` via their
  // zod parsing.
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error');
  app.addContentTypeParser<string>(
    'application/json',
    { parseAs: 'string', bodyLimit: opts.bodyLimit ?? 50 * 1024 * 1024 },
    (req, body, done) => {
      if (body === '' || body == null) {
        done(null, undefined);
        return;
      }
      defaultJsonParser(req, body, done);
    },
  );

  // Optional revocation + JWKS persistence guards. Both are no-ops
  // unless explicitly enabled — admin-only tests / dev runs don't
  // need them and they require a DB.
  let revokedJtisGuard: RevokedJtisGuard | undefined;
  let revocation: RevocationCheck | undefined;
  if (opts.enableRevocation && opts.db) {
    revokedJtisGuard = new RevokedJtisGuard({ db: opts.db, realtime: realtimeBus });
    revocation = revokedJtisGuard;
  }
  let jwksCacheStore: JwksCacheStore | undefined;
  if (opts.enableJwksPersistence && opts.db) {
    jwksCacheStore = new DbJwksCacheStore(opts.db);
  }

  // Tenant suspension gate: consulted by the auth hook for every JWT
  // and by the share exchange. API-token requests never touch it.
  const suspendedTenantsGuard = opts.db ? new SuspendedTenantsGuard({ db: opts.db }) : undefined;

  // The deployment can sign iff it verifies with the shared secret —
  // the ONE condition gating every minting surface: tokens.issue, the
  // share-grant routes, and the public exchange. Asymmetric/JWKS
  // deployments verify only; their backends mint with their own keys.
  const verifierForSigning = opts.verifier;
  const signer =
    verifierForSigning.mode === 'hs256'
      ? (input: SignDevTokenInput) => signDevToken(verifierForSigning.secret, input)
      : undefined;

  // Inject the revocation + cache store into whichever mode the
  // caller picked. We don't overwrite if they're already set.
  const verifierConfig = {
    ...opts.verifier,
    revocation: opts.verifier.revocation ?? revocation,
    ...(opts.verifier.mode === 'jwks' && !opts.verifier.cacheStore
      ? { cacheStore: jwksCacheStore }
      : {}),
  } as JwtVerifierConfig;
  if (enforceProductionSecrets && verifierConfig.mode === 'hs256') {
    assertProductionSecret(verifierConfig.secret, {
      name: 'JWT HS256 secret',
      envVar: 'CLOUDPDF_JWT_SECRET',
      option: 'verifier.secret',
    });
  }
  const apiAuthTokens = (opts.apiAuthTokens ?? []).filter((token) => token.length > 0);
  if (enforceProductionSecrets) {
    for (const [index, token] of apiAuthTokens.entries()) {
      assertProductionSecret(token, {
        name: `API authentication token ${index + 1}`,
        envVar: 'CLOUDPDF_API_AUTH_TOKENS',
        option: `apiAuthTokens[${index}]`,
      });
    }
  }
  await registerJwtAuth(app, {
    verifier: verifierConfig,
    ...(apiAuthTokens.length > 0 ? { apiAuthTokens } : {}),
    ...(opts.authFailureLimit !== undefined ? { authFailureLimit: opts.authFailureLimit } : {}),
    ...(suspendedTenantsGuard ? { suspendedTenants: suspendedTenantsGuard } : {}),
    // The exchange is the one public v1 surface: the grant row is the
    // authorization, and the route carries its own limiters. /metrics
    // joins it when enabled (network-level protection, like any
    // Prometheus target).
    ...((): { publicPaths?: string[] } => {
      const publicPaths = [
        ...(signer && opts.db && opts.objectStore ? [adminWirePaths.shareSessions] : []),
        ...(opts.metrics === true ? ['/metrics'] : []),
      ];
      return publicPaths.length > 0 ? { publicPaths } : {};
    })(),
  });

  // `documentService` is allocated below, but the pool's onEvict
  // hook needs to reference it. Use a forward-binding closure:
  // `evictForward` defers to whatever lives in `documentService` at
  // call time. Without this, we'd need to construct the pool twice
  // or expose a mutable setter on the service — both worse.
  let documentService: DocumentService | undefined;
  const evictForward = (evt: { docId: string; baseSha: string; slot: number }): void => {
    documentService?.onPoolEvict(evt);
  };

  let pool: EnginePool | undefined;
  if (opts.workerEntry) {
    if (opts.engineIsolation === 'host') {
      if (!opts.engineHostEntry) {
        throw new Error("buildApp: engineIsolation 'host' requires engineHostEntry");
      }
      pool = await EngineHostClient.create({
        hostEntry: opts.engineHostEntry,
        boot: {
          workerEntry: String(opts.workerEntry),
          ...(opts.poolSize !== undefined ? { poolSize: opts.poolSize } : {}),
          ...(opts.maxDocsPerSlot !== undefined ? { maxDocsPerSlot: opts.maxDocsPerSlot } : {}),
          fonts: opts.fallbackFonts ?? [],
        },
        onEvict: evictForward,
        // Forget-everything on host death: WS1 makes the lazy rebuild
        // from durable truth safe; the generation fence closes the
        // mid-commit window (DocumentService.advanceLayerSession).
        onHostRestart: () => documentService?.onHostRestart(),
        ...(opts.engineHostExecArgv ? { execArgv: opts.engineHostExecArgv } : {}),
      });
    } else {
      pool = await WorkerThreadPool.create({
        size: opts.poolSize,
        workerEntry: opts.workerEntry,
        maxDocsPerSlot: opts.maxDocsPerSlot,
        onEvict: evictForward,
        fonts: opts.fallbackFonts,
      });
    }
  }
  const drainCoordinator = new DrainCoordinator();

  // Readiness = "safe to route traffic here": not draining, and the
  // database answers. License-restricted mode stays ready on purpose —
  // a lapsed license degrades to read-only; it must never restart-loop
  // or pull the deployment out of every balancer. The object store is
  // deliberately NOT probed: a transient bucket blip must not amputate
  // the whole fleet's endpoints. The DB result is cached briefly so
  // probe storms (N replicas × N balancers) cost ~one ping per window —
  // including while the DB is down.
  const DB_READY_TTL_MS = 5_000;
  const DB_READY_TIMEOUT_MS = 2_000;
  let dbReadyCache = { at: 0, ok: true };
  const dbReady = async (): Promise<boolean> => {
    if (!opts.db) return true;
    if (Date.now() - dbReadyCache.at < DB_READY_TTL_MS) return dbReadyCache.ok;
    const ping = sql`SELECT 1`.execute(opts.db).then(
      () => true,
      () => false,
    );
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), DB_READY_TIMEOUT_MS);
      timer.unref?.();
    });
    const ok = await Promise.race([ping, timeout]);
    if (timer) clearTimeout(timer);
    dbReadyCache = { at: Date.now(), ok };
    return ok;
  };

  if (opts.metrics === true) {
    registerMetrics(app, { pool, licenseGate: opts.licenseGate });
  }

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => {
    const license = opts.licenseGate.getStatus();
    if (drainCoordinator.isDraining) {
      return reply.code(503).send({ license, status: 'draining' });
    }
    if (!(await dbReady())) {
      return reply.code(503).send({ license, status: 'unready', reasons: ['database'] });
    }
    return { license, status: 'ok' };
  });
  app.get('/v1/license/status', async () => opts.licenseGate.getStatus());
  // Deployment surface: API token only — license state, reporting, and
  // meters are deployment-global, so no tenant credential may read them.
  const licenseStatusOp = adminOperations['deployment.licenseStatus'];
  app.route({
    method: licenseStatusOp.method,
    url: licenseStatusOp.path,
    handler: async (request) => {
      requireApiToken(request);
      return {
        license: opts.licenseGate.getStatus(),
        reporting: opts.usageReporter ? await opts.usageReporter.status() : null,
        usage: usageMeters ? await usageMeters.snapshot() : null,
      };
    },
  });

  // Drift detection at boot. Production deployments should supply
  // `expectedMigrations` — if the DB has a checksum mismatch or an
  // applied migration vanished from code, we refuse to serve traffic
  // rather than silently running on an unexpected schema. This is the
  // safety net for "someone edited a migration and force-rolled it".
  if (opts.db && opts.expectedMigrations && opts.expectedMigrations.length > 0) {
    const issues = await validateMigrations(opts.db, opts.expectedMigrations, {
      treatPendingAsDrift: opts.failOnPending ?? false,
    });
    if (issues.length > 0) {
      const lines = issues.map((i) => `  - [${i.kind}] ${i.message}`).join('\n');
      throw new Error(`buildApp: migration drift detected, refusing to start:\n${lines}`);
    }
  }

  let lifecycle: DocumentLifecycleService | undefined;
  let importWorker: ImportWorker | undefined;
  let layerService: LayerService | undefined;
  let derivedRenders: DerivedRenderService | undefined;
  let sweeperTimer: NodeJS.Timeout | undefined;
  let baseFileCache: BaseFileCache | undefined;
  if (opts.db && opts.objectStore) {
    if (opts.cacheRoot && pool) {
      baseFileCache = new BaseFileCache({
        root: opts.cacheRoot,
        maxBytes: opts.cacheMaxBytes ?? 4 * 1024 * 1024 * 1024,
        store: opts.objectStore,
        // Failed materialises were once completely silent (callers
        // like the security probe swallow them by design) — always
        // give them a log line.
        onEvent: (e) => {
          if (e.kind === 'materialize-error') {
            app.log.warn({ sha: e.sha, error: e.error }, 'base file cache: materialize failed');
          }
        },
      });
      // One-shot boot sweep: a crash during a prior materialise can
      // leave `.partial.*` files behind. Better to clean them up
      // here than to surface bogus disk-usage stats to ops.
      await baseFileCache.sweepPartials();
    }

    // The derived-artifact plane for renders.
    // Needs a worker + the base-file cache — admin-only deploys skip it.
    if (baseFileCache && pool) {
      derivedRenders = new DerivedRenderService({
        storage: opts.objectStore,
        ...(opts.renderLattice?.widths ? { widths: opts.renderLattice.widths } : {}),
        ...(opts.renderLattice?.appearanceScales
          ? { appearanceScales: opts.renderLattice.appearanceScales }
          : {}),
        ...(opts.renderLattice?.maxRenderPixels !== undefined
          ? { maxRenderPixels: opts.renderLattice.maxRenderPixels }
          : {}),
        ...(opts.renderLattice?.enforce !== undefined
          ? { enforce: opts.renderLattice.enforce }
          : {}),
        cache: baseFileCache,
        pool,
        encoder: new SharpImageEncoder(),
        documents: new DocumentsRepo(opts.db),
        onWarmError: (err, ctx) =>
          app.log.warn({ err, ...ctx }, 'thumbnail warm failed; thumbnailState=failed'),
      });
    }

    const importPolicy = opts.importPolicy ?? defaultImportPolicy();
    const documentImportsRepo = new DocumentImportsRepo(opts.db);
    lifecycle = new DocumentLifecycleService({
      documents: new DocumentsRepo(opts.db),
      tenants: new TenantsRepo(opts.db),
      storage: opts.objectStore,
      autoProvisionTenant: opts.autoProvisionTenant ?? false,
      uploadProxyPolicy: opts.uploadProxyPolicy ?? 'fallback-only',
      importPolicy: importPolicy,
      importConnections: new ImportConnectionRegistry(opts.importConnections ?? []),
      documentImports: documentImportsRepo,
      db: opts.db,
      securityProbe: new DocumentSecurityProbe({
        cache: baseFileCache,
        pool,
        onError: (err, ctx) =>
          app.log.warn({ err, ...ctx }, 'security probe failed; recording unknown security state'),
      }),
      ...(baseFileCache ? { fileCache: baseFileCache } : {}),
      ...(derivedRenders ? { derivedRenders } : {}),
      ...(usageMeters ? { usageMeters } : {}),
      tenantUsage: new TenantUsageRepo(opts.db),
      shareGrants: new ShareGrantsRepo(opts.db),
    });
    await registerAdminDocumentsRoutes(app, {
      lifecycle,
      storage: opts.objectStore,
    });
    // The async-import claim loop: in-process (like the sweeper), one
    // per replica, safe under multi-replica via fenced leased claims.
    if (importPolicy.enabled) {
      importWorker = new ImportWorker({
        jobs: documentImportsRepo,
        documents: new DocumentsRepo(opts.db),
        lifecycle,
        storage: opts.objectStore,
        policy: importPolicy,
        ...(opts.importWorkerPollMs !== undefined ? { pollMs: opts.importWorkerPollMs } : {}),
        onError: (err, ctx) => app.log.warn({ err, ...ctx }, 'import worker error'),
      });
      importWorker.start();
    }
    const tenantUsage = new TenantUsageRepo(opts.db);
    await registerAdminTenantsRoutes(app, {
      tenants: new TenantsRepo(opts.db),
      storage: opts.objectStore,
      securityEvents: new SecurityEventsRepo(opts.db),
      suspendedTenants: suspendedTenantsGuard!,
      tenantUsage,
    });
    // Issue mounts only when the deployment can sign (HS256 — the
    // verifier secret doubles as signing material); revoke only when
    // revocation is enabled. Both write security_events.
    await registerAdminTokensRoutes(app, {
      ...(revokedJtisGuard ? { guard: revokedJtisGuard } : {}),
      ...(signer ? { sign: signer } : {}),
      documents: new DocumentsRepo(opts.db),
      securityEvents: new SecurityEventsRepo(opts.db),
    });
    // The share family (grant lifecycle + public exchange) exists only
    // where minting does — same condition as tokens.issue, because a
    // grant is a standing mint capability.
    if (signer) {
      const shareGrants = new ShareGrantsRepo(opts.db);
      await registerAdminSharesRoutes(app, {
        grants: shareGrants,
        documents: new DocumentsRepo(opts.db),
        securityEvents: new SecurityEventsRepo(opts.db),
      });
      await registerShareSessionRoutes(app, {
        sign: signer,
        grants: shareGrants,
        documents: new DocumentsRepo(opts.db),
        suspendedTenants: suspendedTenantsGuard!,
        ...(usageMeters ? { usageMeters } : {}),
        tenantUsage,
      });
    }

    // API-token requests reach the doc plane as a synthesized
    // tenant-mode principal for the DOC'S OWN tenant — recovered from
    // the document row, which is an addressing lookup (storage keys and
    // services are tenant-keyed), not an authorization decision: the
    // API token is already root. Every existing guard then takes its
    // tenant branch unchanged. `/v1/access` + `/v1/warm` stay JWT-only:
    // they are viewer-session bootstrap (view metering, exp-bound CDN
    // grants), and a root credential has no session to establish.
    //
    // `X-Document-Password` (base64) rides only API-token requests —
    // backends supply encrypted-doc passwords per call; viewers keep
    // the KMS session flow via /v1/access.
    const documentsForApiAuth = new DocumentsRepo(opts.db);
    app.addHook('preHandler', async (req, reply) => {
      const passwordHeader = req.headers['x-document-password'];
      if (!req.apiAuth) {
        if (passwordHeader !== undefined) {
          return reply.code(403).send({
            error: {
              code: 'Forbidden',
              message: 'X-Document-Password requires the api token; viewers unlock via /v1/access',
            },
          });
        }
        return;
      }
      const pathname = req.url.split('?', 1)[0] ?? req.url;
      if (pathname === '/v1/access' || pathname === '/v1/warm') {
        return reply.code(403).send({
          error: {
            code: 'Forbidden',
            message: 'the api token cannot establish viewer sessions; mint a doc token instead',
          },
        });
      }
      const docId = (req.params as { docId?: string } | undefined)?.docId;
      if (!docId || !pathname.startsWith('/v1/docs/')) return;
      const row = await documentsForApiAuth.findById(docId);
      if (!row) {
        return reply.code(404).send({
          error: { code: 'NotFound', message: `document does not exist: ${docId}` },
        });
      }
      const now = Math.floor(Date.now() / 1000);
      req.tenant = {
        id: row.tenantId,
        sub: 'api-token',
        claims: {
          sub: 'api-token',
          tenant_id: row.tenantId,
          scope: ['*'],
          iat: now,
          // Far-future exp: the SSE auth-expiring event never fires for
          // the root credential — its lifetime is env rotation, not a
          // JWT clock.
          exp: now + 10 * 365 * 24 * 60 * 60,
        } as JwtClaims,
      };
      if (passwordHeader !== undefined) {
        const decoded = decodeBase64Header(passwordHeader);
        if (decoded === null) {
          return reply.code(400).send({
            error: {
              code: 'InvalidArg',
              message: 'X-Document-Password must be a single base64-encoded UTF-8 value',
            },
          });
        }
        req.docPassword = decoded;
      }
    });

    // Phase 3: wire the doc-scoped routes when the operator has
    // chosen a cache root. Requires the worker pool — admin-only
    // deploys (no `workerEntry`) keep the legacy admin surface and
    // skip the cloud open surface entirely.
    if (baseFileCache && pool) {
      const layerStateService = new LayerStateService({
        documentPages: new DocumentPagesRepo(opts.db),
        layers: new LayersRepo(opts.db),
        layerPages: new LayerPagesRepo(opts.db),
      });
      const cloudRevisionBridge = new CloudRevisionBridge();
      const weakAnnotationSessions = new WeakAnnotationSessionService({
        repo: new WeakAnnotationSessionsRepo(opts.db),
      });
      const eventLog = new EventLogService({ storage: opts.objectStore });
      const passwordSessionServerSecret = {
        id:
          opts.pdfPasswordSessionServerSecretId ??
          process.env['CLOUDPDF_PASSWORD_SESSION_SERVER_SECRET_ID'] ??
          'dev-v1',
        // Only enforced when KMS (and thus password-session persistence)
        // is actually enabled — the secret is unused otherwise.
        secret: resolveSecret({
          explicit: opts.pdfPasswordSessionServerSecret,
          env: process.env,
          requirement: {
            name: 'PDF password-session server secret',
            envVar: 'CLOUDPDF_PASSWORD_SESSION_SERVER_SECRET',
            option: 'pdfPasswordSessionServerSecret',
          },
          devFallback: 'cloudpdf-dev-password-session-secret',
          enforce: enforceProductionSecrets && opts.kms !== undefined,
        }),
      };
      // CDN-signaling rule for /head: non-`none` adapters need /access
      // to be called before the first cacheable read so the SDK has
      // the signed URLs/cookies. The default (`none`) keeps /head
      // saying "no access needed" so public shares stay cheap.
      const cdnAccessRequired = (opts.cdnSigner?.info.kind ?? 'none') !== 'none';
      documentService = new DocumentService({
        documents: new DocumentsRepo(opts.db),
        cache: baseFileCache,
        storage: opts.objectStore,
        pool,
        layerState: layerStateService,
        cdnAccessRequired,
        passwordVerifications: new PdfPasswordVerificationsRepo(opts.db, {
          // The proof rows are HMACs over real document passwords: on a
          // production license a strong secret is mandatory, or a leaked DB
          // becomes an offline dictionary attack on customer PDFs.
          hmacSecret: resolveSecret({
            explicit: opts.pdfPasswordVerificationHmacSecret,
            env: process.env,
            requirement: {
              name: 'PDF password verification HMAC secret',
              envVar: 'CLOUDPDF_PASSWORD_VERIFICATION_HMAC_SECRET',
              option: 'pdfPasswordVerificationHmacSecret',
            },
            devFallback: 'cloudpdf-dev-password-verification-secret',
            enforce: enforceProductionSecrets,
          }) as string,
          ttlMs: opts.pdfPasswordVerificationTtlMs,
        }),
        ...(opts.kms
          ? {
              passwordSessions: new PdfPasswordSessionsRepo(opts.db, {
                keyring: opts.kms,
                serverSecrets: [passwordSessionServerSecret],
              }),
              passwordSessionServerSecret,
              passwordSessionTtlMs: opts.pdfPasswordSessionTtlMs,
              passwordSessionRenewalTtlMs: opts.pdfPasswordSessionRenewalTtlMs,
            }
          : {}),
      });
      layerService = new LayerService({
        db: opts.db,
        documents: new DocumentsRepo(opts.db),
        layerState: layerStateService,
        revisionBridge: cloudRevisionBridge,
        eventLog,
        weakAnnotationSessions,
        documentService,
        pool,
        storage: opts.objectStore,
        realtime: realtimeBus,
      });
      await registerAccessRoutes(app, {
        service: documentService,
        cdnSigner: opts.cdnSigner ?? new NoneCdnSigner(),
        ...(derivedRenders ? { derivedRenders } : {}),
        ...(usageMeters ? { usageMeters } : {}),
        tenantUsage: new TenantUsageRepo(opts.db),
      });
      await registerDocsRoutes(app, { service: documentService });
      await registerMetadataRoutes(app, { service: documentService, layerService });
      await registerPageRoutes(app, {
        documentService,
        layerService,
        pool,
        imageEncoder: new SharpImageEncoder(),
        ...(derivedRenders ? { derivedRenders } : {}),
      });
      await registerRedactionRoutes(app, { documentService, layerService });
      await registerEventsRoutes(app, {
        db: opts.db,
        documentService,
        realtimeBus,
        drain: drainCoordinator,
        ...(revokedJtisGuard ? { revocation: revokedJtisGuard } : {}),
      });
      await registerAnnotationRoutes(app, {
        documentService,
        layerService,
        pool,
        revisionBridge: cloudRevisionBridge,
        imageEncoder: new SharpImageEncoder(),
        weakAnnotationSessions,
        ...(derivedRenders ? { derivedRenders } : {}),
      });
      await registerFormRoutes(app, {
        documentService,
        layerService,
      });
      await registerAttachmentRoutes(app, {
        documentService,
        layerService,
      });
      await registerSearchRoutes(app, {
        documentService,
        pool,
      });
    }

    const sweepIntervalMs = opts.sweepIntervalMs ?? 60_000;
    const pendingTtlMs = opts.pendingTtlMs ?? 60 * 60 * 1000; // 1h default
    if (sweepIntervalMs > 0) {
      sweeperTimer = setInterval(() => {
        lifecycle!
          .sweepStalePending({ olderThanMs: pendingTtlMs })
          .catch((err) => app.log.error({ err }, 'sweepStalePending failed'));
      }, sweepIntervalMs);
      sweeperTimer.unref();
    }
  }

  app.setErrorHandler((err, req, reply) => {
    if (EngineError.is(err)) {
      const engineErr = err as EngineError;
      const code = mapToHttp(engineErr.code);
      // The `name: 'EngineError'` discriminator is required by
      // EngineErrorPayloadSchema on the client side; without it the
      // typed code/message/details get dropped and clients see a
      // status-only InvalidArg fallback.
      reply.code(code).send({
        error: {
          name: 'EngineError',
          code: engineErr.code,
          message: engineErr.message,
          details: engineErr.details,
        },
      });
      return;
    }
    const e = err as Error & { code?: string; status?: number; statusCode?: number };
    if (e.status && typeof e.status === 'number') {
      reply.code(e.status).send({ error: { code: e.code ?? 'Unknown', message: e.message } });
      return;
    }
    // Fastify's own errors (body parsing, payload limits, validation) carry
    // `statusCode`, not `status`. Pass 4xx through as the client errors they
    // are; 5xx still falls to the unhandled branch below so it gets logged.
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      reply.code(e.statusCode).send({ error: { code: e.code ?? 'Unknown', message: e.message } });
      return;
    }
    if (e.code === 'NotFound') {
      reply.code(404).send({ error: { code: 'NotFound', message: e.message } });
      return;
    }
    if (e.code === 'Forbidden') {
      reply.code(403).send({ error: { code: 'Forbidden', message: e.message } });
      return;
    }
    req.log.error({ err: e }, 'unhandled error');
    reply.code(500).send({ error: { code: 'Unknown', message: e.message } });
  });

  const shutdownTimeoutMs = opts.shutdownTimeoutMs ?? 30_000;
  const shutdownDrainMs = opts.shutdownDrainMs ?? 0;
  const shutdown = async () => {
    // 1. Fail readiness and end every live SSE stream. Hijacked streams
    //    are invisible to app.close() — with heartbeats keeping their
    //    sockets alive, one connected viewer would otherwise hold
    //    shutdown open until the supervisor SIGKILLs, skipping the pool
    //    and cache teardown below on every deploy.
    drainCoordinator.begin();
    // 2. Optional settle window for probe-driven balancers that need to
    //    observe the 503 before the socket refuses (Kubernetes covers
    //    this externally with endpoint removal + preStop).
    if (shutdownDrainMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, shutdownDrainMs));
    }
    if (sweeperTimer) clearInterval(sweeperTimer);
    await importWorker?.stop();
    try {
      // 3. Bounded: in-flight HTTP gets shutdownTimeoutMs to finish and
      //    then teardown proceeds anyway — cleanup must run before the
      //    supervisor's kill deadline, not after it.
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), shutdownTimeoutMs);
        timer.unref?.();
      });
      const closed = app.close().then(
        () => 'closed' as const,
        (err: unknown) => {
          app.log.error({ err }, 'app.close failed during shutdown; continuing teardown');
          return 'closed' as const;
        },
      );
      const outcome = await Promise.race([closed, timedOut]);
      if (timer) clearTimeout(timer);
      if (outcome === 'timeout') {
        app.log.error(
          { shutdownTimeoutMs },
          'app.close did not finish within the shutdown budget; continuing teardown',
        );
      }
    } finally {
      try {
        if (pool) await pool.destroy();
      } finally {
        documentService?.releaseAllBaseHandles();
        if (baseFileCache) await baseFileCache.destroy();
      }
    }
  };

  return {
    app,
    pool,
    lifecycle,
    revokedJtisGuard,
    suspendedTenantsGuard,
    documentService,
    layerService,
    derivedRenders,
    baseFileCache,
    kms: opts.kms,
    beginDrain: () => drainCoordinator.begin(),
    shutdown,
  };
}

/**
 * Strict base64 decode for the `X-Document-Password` header: single,
 * bounded value only, with valid optional padding and a canonical
 * round-trip (rejects garbage that Buffer's lenient decoder would
 * silently mangle).
 */
const MAX_DOCUMENT_PASSWORD_HEADER_LENGTH = 4_096;

function removeBase64Padding(value: string): string | null {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x3d) end--;

  const paddingLength = value.length - end;
  if (paddingLength > 2) return null;

  const unpadded = value.slice(0, end);
  if (unpadded.includes('=')) return null;

  // Unpadded base64 is accepted. If the caller includes padding, it must
  // have exactly the length required by the final four-character block.
  const remainder = unpadded.length % 4;
  if (remainder === 1) return null;
  const requiredPadding = remainder === 0 ? 0 : 4 - remainder;
  if (paddingLength !== 0 && paddingLength !== requiredPadding) return null;

  return unpadded;
}

function decodeBase64Header(value: string | string[]): string | null {
  if (
    Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_DOCUMENT_PASSWORD_HEADER_LENGTH
  ) {
    return null;
  }

  const canonicalInput = removeBase64Padding(value);
  if (canonicalInput === null) return null;

  const buf = Buffer.from(canonicalInput, 'base64');
  if (buf.length === 0) return null;
  if (removeBase64Padding(buf.toString('base64')) !== canonicalInput) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

function isReadOnlyLicenseRequest(method: string, pathname: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  // These POST endpoints calculate or mint read access, but do not change the
  // customer's document contents. They remain available so an expired or
  // suspended license can never hold existing data hostage. The share
  // exchange belongs here for the same reason: it mints read sessions
  // for already-shared documents.
  return (
    method === 'POST' &&
    (pathname === '/v1/access' || pathname === '/v1/warm' || pathname === '/v1/share-sessions')
  );
}

function mapToHttp(code: string): number {
  switch (code) {
    case EngineErrorCode.InvalidArg:
    case EngineErrorCode.WireFormat:
    case EngineErrorCode.InvalidReference:
      return 400;
    case EngineErrorCode.Unauthenticated:
      return 401;
    case EngineErrorCode.Forbidden:
      return 403;
    case EngineErrorCode.WeakAnnotationSessionConflict:
    case EngineErrorCode.LayerVersionConflict:
      return 409;
    case EngineErrorCode.NotFound:
    case EngineErrorCode.DocNotOpen:
      return 404;
    case EngineErrorCode.DocOpenFailed:
    case EngineErrorCode.DocPasswordRequired:
    case EngineErrorCode.DocPasswordIncorrect:
    case EngineErrorCode.MalformedPdf:
      return 422;
    case EngineErrorCode.Aborted:
      return 499;
    case EngineErrorCode.NotImplemented:
      return 501;
    default:
      return 500;
  }
}
