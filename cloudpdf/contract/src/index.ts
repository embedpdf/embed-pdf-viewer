import type { DocCapability } from '@embedpdf/engine-core/runtime';
import {
  AnnotationListPageSnapshotSchema,
  DocumentHeadSchema,
  DocumentManifestSchema,
  DocumentMetadataSchema,
  EngineErrorPayloadSchema,
  FormSnapshotSchema,
  MutationMetaSchema,
  PageTextSnapshotSchema,
  wireTemplates,
} from '@embedpdf/engine-core/wire';
import { z } from 'zod';

const sha256Hex = /^[0-9a-f]{64}$/i;
const docIdPattern = /^[A-Za-z0-9_-]+$/;
/**
 * Tenant ids share the doc-id charset: URL-safe by construction, since
 * they appear in every tenant-scoped path (and therefore in logs — do
 * not put PII in tenant ids).
 */
export const tenantIdPattern = /^[A-Za-z0-9_-]+$/;
/**
 * A web origin pattern: scheme + host (+ optional port), no path. One
 * leading `*.` label is allowed and matches one or more subdomain
 * labels (`https://*.acme.com` covers `docs.acme.com`, never bare
 * `acme.com` and never `evilacme.com`).
 */
const originPattern =
  /^https?:\/\/(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(:\d{1,5})?$/;
const originPatternArray = z
  .array(
    z
      .string()
      .max(262)
      .regex(
        originPattern,
        'must be a web origin like https://example.com (optionally one leading *. wildcard label, optional port, no path)',
      ),
  )
  .min(1)
  .max(32);
/** Share tokens are the grant row id: `shr_` + 24 url-safe random chars. */
const shareTokenPattern = /^shr_[A-Za-z0-9_-]{24}$/;

/**
 * Wire paths. The URL carries the full resource identity — tenant
 * resources live under `/v1/tenants/{tenantId}/…` — and the auth model
 * is one rule: the API token is valid everywhere; a JWT is valid
 * exactly under the subtree of the resource it names.
 */
export const adminWirePaths = {
  tenants: '/v1/tenants',
  tenant: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}`,
  documents: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/documents`,
  documentsInit: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/documents/init`,
  documentsImport: (tenantId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/import`,
  document: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}`,
  documentCommit: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/commit`,
  documentUploadProxy: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/upload-proxy`,
  documentDownload: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/download`,
  /** The warmed dashboard-tile artifact. Returns 404 while `pending`/`locked`. */
  documentThumbnail: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/thumbnail`,
  tokenIssue: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/tokens`,
  tokenRevoke: (tenantId: string, jti: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/tokens/${encodeURIComponent(jti)}/revoke`,
  shares: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/shares`,
  share: (tenantId: string, shareId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/shares/${encodeURIComponent(shareId)}`,
  tenantUsage: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/usage`,
  tenantSuspend: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/suspend`,
  tenantResume: (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/resume`,
  /**
   * The public share-session exchange. Deliberately outside any tenant
   * subtree: the caller holds only a share token and does not know the
   * tenant — the grant row resolves it server-side.
   */
  shareSessions: '/v1/share-sessions',
  /** Deployment-global singletons: API-token only, no tenant context. */
  deploymentLicenseStatus: '/v1/deployment/license/status',
} as const;

export const DedupModeSchema = z.enum(['always-create', 'reuse-existing']);
export type DedupMode = z.infer<typeof DedupModeSchema>;

export const UploadPreferenceSchema = z.enum(['auto', 'presigned', 'proxy']);
export type UploadPreference = z.infer<typeof UploadPreferenceSchema>;

export const DocumentStateSchema = z.enum(['pending', 'ready', 'failed', 'deleting']);
export type DocumentState = z.infer<typeof DocumentStateSchema>;

export const AdminDocumentRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  state: DocumentStateSchema,
  baseSha: z.string().nullable(),
  storageSizeBytes: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  idempotencyKey: z.string().nullable(),
  failureReason: z.string().nullable(),
  /** Dashboard tile lifecycle. Optional because older servers omit these fields. */
  thumbnailState: z.enum(['pending', 'ready', 'locked', 'failed']).optional(),
  thumbnailUrl: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().nullable(),
});
export type AdminDocumentRecord = z.infer<typeof AdminDocumentRecordSchema>;

export const AdminDocumentInitRequestSchema = z.object({
  contentLength: z.number().finite().min(1),
  contentSha256: z.string().regex(sha256Hex),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  dedupMode: DedupModeSchema.optional(),
  docId: z.string().regex(docIdPattern).optional(),
  uploadTtlSec: z.number().finite().min(60).max(3600).optional(),
  uploadPreference: UploadPreferenceSchema.optional(),
});
export type AdminDocumentInitRequest = z.infer<typeof AdminDocumentInitRequestSchema>;

export const AdminPresignedUploadSchema = z.object({
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  method: z.literal('PUT'),
  expiresAt: z.number(),
});
export type AdminPresignedUpload = z.infer<typeof AdminPresignedUploadSchema>;

export const AdminInitUploadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('presigned'),
    presigned: AdminPresignedUploadSchema,
    key: z.string(),
  }),
  z.object({
    kind: z.literal('proxy'),
    url: z.string(),
    key: z.string(),
  }),
]);
export type AdminInitUpload = z.infer<typeof AdminInitUploadSchema>;

export const AdminDocumentInitResponseSchema = z.discriminatedUnion('tag', [
  z.object({
    tag: z.literal('created'),
    document: AdminDocumentRecordSchema,
    upload: AdminInitUploadSchema,
  }),
  z.object({
    tag: z.literal('resumed'),
    document: AdminDocumentRecordSchema,
    upload: AdminInitUploadSchema,
  }),
  z.object({
    tag: z.literal('deduped'),
    document: AdminDocumentRecordSchema,
  }),
]);
export type AdminDocumentInitResponse = z.infer<typeof AdminDocumentInitResponseSchema>;

export const AdminDocumentCommitRequestSchema = z.object({
  sha256: z.string().regex(sha256Hex),
});
export type AdminDocumentCommitRequest = z.infer<typeof AdminDocumentCommitRequestSchema>;

export const AdminDocumentCommitResponseSchema = z.object({
  document: AdminDocumentRecordSchema,
});
export type AdminDocumentCommitResponse = z.infer<typeof AdminDocumentCommitResponseSchema>;

/** UTF-8 byte length — provider key limits are byte rules, not JS code units. */
const utf8ByteLength = (s: string): number => new TextEncoder().encode(s).length;

/**
 * A server-side pull source for `documents.importFrom`. The discriminator
 * distinguishes AUTHORIZATION MODELS, not storage vendors:
 *
 *   - `url`        — the CALLER supplies authority: a presigned
 *     S3/GCS/Azure/R2/MinIO GET, or any HTTPS endpoint the
 *     deployment's import policy allows. The URL is a capability:
 *     treat it as a secret. Servers never echo its query string back
 *     in errors, logs, or stored failure reasons.
 *   - `connection` — the OPERATOR pre-registered authority: the
 *     request names a connection and a key; which provider backs it
 *     (S3, GCS, Azure Blob, filesystem, ...) is deployment
 *     configuration, never wire surface. `revision` is opaque here
 *     and provider-interpreted (S3 VersionId, GCS generation, Azure
 *     version id); unsupported providers reject it.
 *
 * Key validation at this layer is deliberately generic (byte length,
 * no NUL); provider-exact rules live in the server's source adapters,
 * which know which backend a connection names.
 */
export const AdminImportSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    url: z.string().url().max(8192),
  }),
  z.object({
    kind: z.literal('connection'),
    connectionId: z.string().min(1).max(128),
    key: z
      .string()
      .min(1)
      .refine((k) => !k.includes('\0'), 'key must not contain NUL')
      .refine((k) => utf8ByteLength(k) <= 1024, 'key must be at most 1024 UTF-8 bytes'),
    revision: z.string().min(1).max(1024).optional(),
  }),
]);
export type AdminImportSource = z.infer<typeof AdminImportSourceSchema>;

export const AdminDocumentImportRequestSchema = z.object({
  source: AdminImportSourceSchema,
  /**
   * Optional integrity pins, enforced when present: `sizeBytes`
   * against the source's declared Content-Length before the transfer,
   * `sha256` against the server-observed digest after it. When absent
   * the server-observed values become authoritative.
   * `dedupMode=reuse-existing` REQUIRES `sha256` — without a declared
   * hash the server cannot know what content to reuse.
   */
  expected: z
    .object({
      sizeBytes: z.number().int().min(1).optional(),
      sha256: z.string().regex(sha256Hex).optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  dedupMode: DedupModeSchema.optional(),
  docId: z.string().regex(docIdPattern).optional(),
  /**
   * `sync` (default) holds the response open for the whole transfer.
   * `async` accepts the request (202, document `pending`), transfers
   * in the background, and the caller polls the document. Async
   * requires a `connection` source (URLs are secrets and expire, so
   * they cannot sit in a durable job); filesystem connections
   * additionally require `expected.sha256`, since they have no
   * revisions to pin retries to.
   */
  mode: z.enum(['sync', 'async']).optional(),
});
export type AdminDocumentImportRequest = z.infer<typeof AdminDocumentImportRequestSchema>;

export const AdminDocumentImportResponseSchema = z.object({
  /**
   * `imported` — bytes were pulled, verified, and committed (sync).
   * `deduped`  — an existing document satisfied the request without a
   * transfer (content dedup or idempotent replay).
   * `accepted` — async: the job is queued (HTTP 202); poll the
   * document until `ready` or `failed`.
   */
  tag: z.enum(['imported', 'deduped', 'accepted']),
  document: AdminDocumentRecordSchema,
});
export type AdminDocumentImportResponse = z.infer<typeof AdminDocumentImportResponseSchema>;

export const AdminDocumentResponseSchema = z.object({
  document: AdminDocumentRecordSchema,
});
export type AdminDocumentResponse = z.infer<typeof AdminDocumentResponseSchema>;

export const ADMIN_DOCUMENT_LIST_DEFAULT_LIMIT = 100;
export const ADMIN_DOCUMENT_LIST_MAX_LIMIT = 200;

/**
 * Query parameters for `documents.list`. `limit` arrives as a string on
 * the wire, hence the coercion; values outside [1, MAX] are a validation
 * error, not a silent clamp. `cursor` is an opaque continuation token
 * from a previous page's `nextCursor` — clients must not parse it.
 */
export const AdminDocumentListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_DOCUMENT_LIST_MAX_LIMIT)
    .default(ADMIN_DOCUMENT_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
  state: DocumentStateSchema.optional(),
});
export type AdminDocumentListQuery = z.infer<typeof AdminDocumentListQuerySchema>;

export const AdminDocumentListResponseSchema = z.object({
  documents: z.array(AdminDocumentRecordSchema),
  /**
   * Opaque cursor for the next page; `null` on the last page. Optional
   * because pre-pagination servers omit it — clients treat absence as
   * "no continuation available", same convention as the thumbnail fields.
   */
  nextCursor: z.string().nullable().optional(),
});
export type AdminDocumentListResponse = z.infer<typeof AdminDocumentListResponseSchema>;

export const AdminUploadProxyResponseSchema = z.object({
  sha256: z.string().regex(sha256Hex),
});
export type AdminUploadProxyResponse = z.infer<typeof AdminUploadProxyResponseSchema>;

export const AdminErrorPayloadSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type AdminErrorPayload = z.infer<typeof AdminErrorPayloadSchema>;

/**
 * The thumbnail route's 404 while the warmed artifact is `pending`,
 * `locked`, or `failed` — the standard error envelope plus the tile
 * state so dashboards can render the right placeholder.
 */
export const AdminThumbnailUnavailablePayloadSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    state: z.string(),
  }),
});
export type AdminThumbnailUnavailablePayload = z.infer<
  typeof AdminThumbnailUnavailablePayloadSchema
>;

export const AdminTenantParamsSchema = z.object({
  tenantId: z.string().regex(tenantIdPattern),
});
export type AdminTenantParams = z.infer<typeof AdminTenantParamsSchema>;

export const AdminTenantDocParamsSchema = z.object({
  tenantId: z.string().regex(tenantIdPattern),
  id: z.string().regex(docIdPattern),
});
export type AdminTenantDocParams = z.infer<typeof AdminTenantDocParamsSchema>;

export const AdminTenantJtiParamsSchema = z.object({
  tenantId: z.string().regex(tenantIdPattern),
  jti: z.string().min(1).max(256),
});
export type AdminTenantJtiParams = z.infer<typeof AdminTenantJtiParamsSchema>;

export const AdminTokenRevokeRequestSchema = z.object({
  /** Optional human reason, written to the audit row. */
  reason: z.string().max(1024).optional(),
  /**
   * The token's `exp` (unix seconds), used to GC the revocation row
   * once the token would have expired anyway. Defaults server-side to
   * now + 30 days.
   */
  expiresAtSeconds: z.number().int().positive().optional(),
});
export type AdminTokenRevokeRequest = z.infer<typeof AdminTokenRevokeRequestSchema>;

/**
 * License/reporting/usage passthrough. The inner shapes belong to the
 * licensing runtime and are surfaced as-is; they tighten to full
 * schemas when the licensing contract stabilizes.
 */
export const AdminLicenseStatusResponseSchema = z.object({
  license: z.unknown(),
  reporting: z.unknown().nullable(),
  usage: z.unknown().nullable(),
});
export type AdminLicenseStatusResponse = z.infer<typeof AdminLicenseStatusResponseSchema>;

export const AdminTenantRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** True when the namespace materialized on first use rather than via explicit create. */
  autoProvisioned: z.boolean(),
  /**
   * `suspended` tenants fail closed: every tenant JWT, doc JWT, and
   * share exchange is refused until resume. The API token is exempt —
   * the operator must be able to inspect, resume, or delete a
   * suspended tenant. Optional because older servers omit it.
   */
  status: z.enum(['active', 'suspended']).optional(),
  createdAt: z.number(),
});
export type AdminTenantRecord = z.infer<typeof AdminTenantRecordSchema>;

export const AdminTenantCreateRequestSchema = z.object({
  id: z.string().regex(tenantIdPattern),
  /** Display name; defaults to the id. */
  name: z.string().min(1).max(256).optional(),
});
export type AdminTenantCreateRequest = z.infer<typeof AdminTenantCreateRequestSchema>;

export const AdminTenantCreateResponseSchema = z.object({
  tenant: AdminTenantRecordSchema,
  /** False when the tenant already existed — create is ensure-style. */
  created: z.boolean(),
});
export type AdminTenantCreateResponse = z.infer<typeof AdminTenantCreateResponseSchema>;

export const AdminTenantResponseSchema = z.object({
  tenant: AdminTenantRecordSchema,
});
export type AdminTenantResponse = z.infer<typeof AdminTenantResponseSchema>;

export const AdminTenantListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_DOCUMENT_LIST_MAX_LIMIT)
    .default(ADMIN_DOCUMENT_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type AdminTenantListQuery = z.infer<typeof AdminTenantListQuerySchema>;

export const AdminTenantListResponseSchema = z.object({
  tenants: z.array(AdminTenantRecordSchema),
  /** Opaque cursor for the next page; `null` on the last page. */
  nextCursor: z.string().nullable().optional(),
});
export type AdminTenantListResponse = z.infer<typeof AdminTenantListResponseSchema>;

/**
 * Tenant-token scopes used by the admin surface. The wildcard `*`
 * always satisfies a scope check and is deliberately not listed —
 * operations declare the *specific* scope they require.
 *
 * `tokens.issue-doc` and `tokens.revoke` are deliberately separate:
 * issuance leaking is a confidentiality risk (unauthorized access
 * creation), revocation leaking is an availability risk (mass session
 * kill). Different failure directions, different scopes.
 *
 * `shares.manage` covers the whole share-grant lifecycle with one
 * scope: a grant is a standing mint capability, so creating and
 * revoking it are the same trust decision — unlike ephemeral tokens,
 * where issue and revoke fail in different directions.
 */
export const adminTenantScopes = [
  'docs.create',
  'docs.read',
  'docs.delete',
  'tokens.issue-doc',
  'tokens.revoke',
  'shares.manage',
] as const;
export type AdminTenantScope = (typeof adminTenantScopes)[number];

export const AdminTokenIssueDocRequestSchema = z.object({
  kind: z.literal('doc'),
  /** Subject of the minted token — the end user's id in your system. */
  sub: z.string().min(1).max(256),
  docId: z.string().regex(docIdPattern),
  layerName: z.string().min(1).max(256).optional(),
  /**
   * Doc capability scopes (`doc.open`, `doc.render`, …, plus the
   * collab grammar). Validated server-side against the engine's scope
   * vocabulary — an unknown string rejects the whole request.
   */
  scope: z.array(z.string().min(1).max(128)).min(1).max(64),
  userId: z.string().max(256).optional(),
  displayName: z.string().max(256).optional(),
  groupId: z.string().max(256).optional(),
  groups: z.array(z.string().max(256)).max(64).optional(),
  /**
   * Origin lock: web origins (scheme + host, optional port; one leading
   * `*.` wildcard label allowed) the minted token may be presented
   * from. Enforced on every engine request that carries a browser
   * `Origin` header — hotlink prevention, not DRM: non-browser callers
   * are governed by the token itself.
   */
  origins: originPatternArray.optional(),
  /** Token lifetime in seconds. */
  expiresIn: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 90),
});
export type AdminTokenIssueDocRequest = z.infer<typeof AdminTokenIssueDocRequestSchema>;

export const AdminTokenIssueTenantRequestSchema = z.object({
  kind: z.literal('tenant'),
  sub: z.string().min(1).max(256),
  scope: z
    .array(z.union([z.literal('*'), z.enum(adminTenantScopes)]))
    .min(1)
    .max(16),
  /** Token lifetime in seconds. */
  expiresIn: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 90),
});
export type AdminTokenIssueTenantRequest = z.infer<typeof AdminTokenIssueTenantRequestSchema>;

export const AdminTokenIssueRequestSchema = z.discriminatedUnion('kind', [
  AdminTokenIssueDocRequestSchema,
  AdminTokenIssueTenantRequestSchema,
]);
export type AdminTokenIssueRequest = z.infer<typeof AdminTokenIssueRequestSchema>;

export const AdminTokenIssueResponseSchema = z.object({
  token: z.string(),
  jti: z.string(),
  /** Unix seconds. */
  expiresAt: z.number(),
});
export type AdminTokenIssueResponse = z.infer<typeof AdminTokenIssueResponseSchema>;

// ---------------------------------------------------------------------------
// Operation registry
// ---------------------------------------------------------------------------
//
// The registry is the admin surface's contract: one entry per operation
// carrying method, path template, required tenant scope, and the request/
// response schemas. The server mounts its routes FROM these entries (so the
// registry is executed, not merely described), and the OpenAPI document is
// generated from the same entries in CI. Migration status: `documents.list`
// is registered; the remaining admin operations move in as they are touched.

/**
 * The credential kinds of the one-rule auth model: the API token
 * (static deployment secret) is valid everywhere; a tenant JWT is valid
 * exactly under its own `/v1/tenants/{tenantId}/` subtree; a doc JWT is
 * valid exactly on the `/v1/docs/{docId}` subtree it names, gated by
 * the capability scopes it carries.
 */
// ---------------------------------------------------------------------------
// Share grants
// ---------------------------------------------------------------------------
//
// A share grant is a standing, revocable authorization decision stored
// with the documents: "anyone presenting this reference, from these
// origins, gets exactly these capabilities on this document". The grant
// id doubles as the public share token — it is a REFERENCE whose power
// is evaluated at exchange time, never a bearer credential, which is
// what lets it live in public HTML while staying editable and
// revocable. The only credential it ever produces is an ordinary
// short-lived doc JWT, minted downward at `shares.exchange`.

export const ShareGrantRecordSchema = z.object({
  /** Grant id; doubles as the public share token (`shr_…`). */
  id: z.string(),
  tenantId: z.string(),
  docId: z.string(),
  layerName: z.string(),
  /** Doc capabilities the exchanged session carries. */
  scope: z.array(z.string()),
  /** Origin allowlist; null means any origin. */
  origins: z.array(z.string()).nullable(),
  /** True when a passphrase is required at exchange. The passphrase itself is never returned. */
  passwordProtected: z.boolean(),
  /** Lifetime of each exchanged session token, in seconds. */
  sessionTtlSeconds: z.number(),
  /** Paused grants refuse exchange (404) but keep their configuration. */
  disabled: z.boolean(),
  /** Unix epoch ms after which exchange returns 410; null = no expiry. */
  expiresAt: z.number().nullable(),
  /** Total successful exchanges — a dashboard convenience, not the usage meter. */
  exchangeCount: z.number(),
  lastExchangedAt: z.number().nullable(),
  createdBy: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ShareGrantRecord = z.infer<typeof ShareGrantRecordSchema>;

export const ShareGrantCreateRequestSchema = z.object({
  docId: z.string().regex(docIdPattern),
  layerName: z.string().min(1).max(256).optional(),
  /**
   * Doc capability scopes the exchanged session will carry. Validated
   * server-side against the engine's scope vocabulary, same as
   * `tokens.issue`.
   */
  scope: z.array(z.string().min(1).max(128)).min(1).max(64),
  /** Origin allowlist; omit to allow any origin. */
  origins: originPatternArray.optional(),
  /** Optional passphrase gate, checked at exchange. Stored as a hash; never returned. */
  password: z.string().min(1).max(1024).optional(),
  /** Lifetime of exchanged session tokens. Default 600. */
  sessionTtlSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60)
    .optional(),
  /** Unix epoch ms after which the grant stops exchanging; omit for no expiry. */
  expiresAt: z.number().int().positive().optional(),
});
export type ShareGrantCreateRequest = z.infer<typeof ShareGrantCreateRequestSchema>;

/**
 * Partial update. `origins: null` clears the allowlist (any origin),
 * `password: null` removes the passphrase, `expiresAt: null` removes
 * the expiry. Absent fields stay untouched. The exchanged capabilities
 * and origin lock of every embedded snippet follow the row — editing a
 * grant retargets the copies already pasted into pages.
 */
export const ShareGrantUpdateRequestSchema = z.object({
  scope: z.array(z.string().min(1).max(128)).min(1).max(64).optional(),
  origins: originPatternArray.nullable().optional(),
  password: z.string().min(1).max(1024).nullable().optional(),
  sessionTtlSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60)
    .optional(),
  disabled: z.boolean().optional(),
  expiresAt: z.number().int().positive().nullable().optional(),
});
export type ShareGrantUpdateRequest = z.infer<typeof ShareGrantUpdateRequestSchema>;

export const ShareGrantResponseSchema = z.object({
  share: ShareGrantRecordSchema,
});
export type ShareGrantResponse = z.infer<typeof ShareGrantResponseSchema>;

export const ShareGrantListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_DOCUMENT_LIST_MAX_LIMIT)
    .default(ADMIN_DOCUMENT_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
  /** Filter to one document's grants. */
  docId: z.string().regex(docIdPattern).optional(),
});
export type ShareGrantListQuery = z.infer<typeof ShareGrantListQuerySchema>;

export const ShareGrantListResponseSchema = z.object({
  shares: z.array(ShareGrantRecordSchema),
  /** Opaque cursor for the next page; `null` on the last page. */
  nextCursor: z.string().nullable().optional(),
});
export type ShareGrantListResponse = z.infer<typeof ShareGrantListResponseSchema>;

export const AdminTenantShareParamsSchema = z.object({
  tenantId: z.string().regex(tenantIdPattern),
  shareId: z.string().regex(shareTokenPattern),
});
export type AdminTenantShareParams = z.infer<typeof AdminTenantShareParamsSchema>;

/**
 * The share token travels in the BODY, never the path — URLs land in
 * access logs and proxy logs, and the token is the whole credential.
 */
export const ShareExchangeRequestSchema = z.object({
  shareToken: z.string().regex(shareTokenPattern),
  /** Required when the grant is passphrase-protected (422 otherwise). */
  password: z.string().min(1).max(1024).optional(),
});
export type ShareExchangeRequest = z.infer<typeof ShareExchangeRequestSchema>;

export const ShareSessionResponseSchema = z.object({
  /** A doc-scoped session JWT carrying the grant's capabilities and origin lock. */
  token: z.string(),
  docId: z.string(),
  layerName: z.string(),
  /** Unix seconds when the session token expires; exchange again for a fresh one. */
  expiresAt: z.number(),
});
export type ShareSessionResponse = z.infer<typeof ShareSessionResponseSchema>;

// ---------------------------------------------------------------------------
// Tenant usage + suspension
// ---------------------------------------------------------------------------

export const TenantUsageQuerySchema = z.object({
  /** UTC month to report, `YYYY-MM`. Defaults to the current month. */
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type TenantUsageQuery = z.infer<typeof TenantUsageQuerySchema>;

/**
 * Per-tenant usage FACTS for one UTC month. Deliberately opinion-free:
 * no limits, no plans, no billing state — those belong to whoever
 * operates the deployment. `pdf.views` counts share exchanges plus
 * authorized `/v1/access` grants, deduplicated (a share session that
 * later establishes access is not counted twice).
 */
export const TenantUsageResponseSchema = z.object({
  tenantId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  metrics: z.object({
    'pdf.views': z.number(),
    'pdf.uploads': z.number(),
    'storage.bytes': z.number(),
  }),
});
export type TenantUsageResponse = z.infer<typeof TenantUsageResponseSchema>;

export const TenantSuspendRequestSchema = z.object({
  /** Optional operator reason, written to the security-events trail. */
  reason: z.string().max(1024).optional(),
});
export type TenantSuspendRequest = z.infer<typeof TenantSuspendRequestSchema>;

export const adminCredentials = ['api-token', 'tenant-jwt', 'doc-jwt'] as const;
export type AdminCredential = (typeof adminCredentials)[number];

export type AdminOperationMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface AdminOperationHeader {
  name: string;
  description: string;
  /** Defaults to false. */
  required?: boolean;
}

export interface AdminOperationResponse {
  /**
   * MIME type(s) of the response body. An array means the server picks
   * one per response (e.g. thumbnail webp/png). Absent = empty body
   * (204-style).
   */
  contentType?: string | ReadonlyArray<string>;
  /** Body schema; absent for empty or binary bodies. */
  schema?: z.ZodTypeAny;
}

export interface AdminOperationBody {
  /** Accepted request MIME type(s). */
  contentType: string | ReadonlyArray<string>;
  /** Body schema; absent for binary bodies. */
  schema?: z.ZodTypeAny;
  /** Defaults to true; false when the operation accepts an empty body. */
  required?: boolean;
}

/**
 * One admin operation, fully described: everything a server needs to mount
 * it and everything a generator needs to document it.
 */
export interface AdminOperation {
  /** Stable `resource.verb` id; becomes the OpenAPI operationId. */
  operationId: string;
  /**
   * Short display name for documentation surfaces (page titles, nav) —
   * a noun phrase like "Create tenant", not a sentence. Emitted as
   * `x-docs-title`; the API reference renders it verbatim, so naming
   * an operation is part of designing it.
   */
  title: string;
  summary: string;
  method: AdminOperationMethod;
  /** Fastify-style path template (`:param`); rewritten to `{param}` for OpenAPI. */
  path: string;
  /**
   * Credentials accepted by this operation. The API token is root and
   * passes every scope check; a tenant JWT additionally requires the
   * path's `tenantId` to equal the token's `tenant_id`. Doc-scoped
   * tokens are always rejected on these surfaces.
   */
  credentials: ReadonlyArray<AdminCredential>;
  /**
   * Tenant scopes accepted on the tenant-jwt path — possessing any one
   * grants access (`*` always does). Empty for API-token-only
   * operations, where no scope model applies.
   */
  scope: ReadonlyArray<AdminTenantScope>;
  /**
   * Doc capabilities required on the doc-jwt path — typed against the
   * engine-core vocabulary so a misspelled capability fails compile.
   * The API token bypasses capability checks, same as it passes tenant
   * scope checks. Present only on doc-plane operations.
   */
  docCapabilities?: ReadonlyArray<DocCapability>;
  /** Documented request headers (beyond Authorization). */
  requestHeaders?: ReadonlyArray<AdminOperationHeader>;
  /** Path-parameter schema, keyed by template name. */
  params?: z.ZodTypeAny;
  /** Query-string schema. */
  query?: z.ZodTypeAny;
  /** Request body. */
  body?: AdminOperationBody;
  /** Success and known-error responses by HTTP status code. */
  responses: Readonly<Record<number, AdminOperationResponse>>;
  /**
   * Deployment caveats a generated doc must carry — e.g. an operation
   * that is only mounted under a server flag.
   */
  notes?: string;
}

export const adminOperations = {
  'tenants.create': {
    operationId: 'tenants.create',
    title: 'Create tenant',
    summary: 'Create a tenant, or confirm it already exists — ensure-style, idempotent.',
    method: 'POST',
    path: adminWirePaths.tenants,
    credentials: ['api-token'],
    scope: [],
    body: { contentType: 'application/json', schema: AdminTenantCreateRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: AdminTenantCreateResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'tenants.list': {
    operationId: 'tenants.list',
    title: 'List tenants',
    summary: 'List tenants, newest first, cursor-paginated.',
    method: 'GET',
    path: adminWirePaths.tenants,
    credentials: ['api-token'],
    scope: [],
    query: AdminTenantListQuerySchema,
    responses: {
      200: { contentType: 'application/json', schema: AdminTenantListResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'tenants.get': {
    operationId: 'tenants.get',
    title: 'Get tenant',
    summary: 'Fetch one tenant record.',
    method: 'GET',
    path: '/v1/tenants/:tenantId',
    credentials: ['api-token'],
    scope: [],
    params: AdminTenantParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: AdminTenantResponseSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'tenants.delete': {
    operationId: 'tenants.delete',
    title: 'Delete tenant',
    summary: 'Delete a tenant and everything under it.',
    method: 'DELETE',
    path: '/v1/tenants/:tenantId',
    credentials: ['api-token'],
    scope: [],
    params: AdminTenantParamsSchema,
    responses: {
      204: {},
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'Destroys the tenant and everything in its namespace — documents, layers, stored bytes, audit history. Irreversible.',
  },
  'documents.init': {
    operationId: 'documents.init',
    title: 'Initialize upload',
    summary:
      'Begin an upload: create (or resume/dedupe) a pending document and issue upload access.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/documents/init',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.create'],
    params: AdminTenantParamsSchema,
    body: { contentType: 'application/json', schema: AdminDocumentInitRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: AdminDocumentInitResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.commit': {
    operationId: 'documents.commit',
    title: 'Commit upload',
    summary: 'Finish an upload: verify the SHA-256 and promote the document to ready.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/documents/:id/commit',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.create'],
    params: AdminTenantDocParamsSchema,
    body: { contentType: 'application/json', schema: AdminDocumentCommitRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: AdminDocumentCommitResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.uploadProxy': {
    operationId: 'documents.uploadProxy',
    title: 'Upload document through the origin',
    summary: 'Upload a bounded PDF through the API when the initialized transfer kind is proxy.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/documents/:id/upload-proxy',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.create'],
    params: AdminTenantDocParamsSchema,
    body: {
      contentType: 'multipart/form-data',
    },
    responses: {
      200: { contentType: 'application/json', schema: AdminUploadProxyResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      409: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'This bounded origin-mediated fallback must only be used after documents.init returns upload.kind=proxy. Auto mode prefers a presigned object-store PUT whenever available.',
  },
  'documents.importFrom': {
    operationId: 'documents.importFrom',
    title: 'Import document',
    summary:
      'Server-side pull: fetch a PDF from a caller-supplied URL (e.g. a presigned object-store GET) or an operator-registered storage connection into CloudPDF-owned storage, verify it, and commit it.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/documents/import',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.create'],
    params: AdminTenantParamsSchema,
    body: { contentType: 'application/json', schema: AdminDocumentImportRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: AdminDocumentImportResponseSchema },
      202: { contentType: 'application/json', schema: AdminDocumentImportResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      502: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'Default mode is synchronous and bounded: the response returns only after the transfer verified and committed (or failed). mode=async (connection sources only) answers 202 immediately and an in-process worker performs the transfer with leased, fenced retries; poll the document until ready/failed. The deployment import policy gates scheme, network range, and size; sources must declare a length. CloudPDF copies and owns the bytes — the source is never referenced in place. A 502 marks a retryable upstream failure: retry with the same idempotencyKey to resume the same document. URL sources are capabilities and never echoed back. Connection sources name operator-registered storage (bucket/prefix scope, allowed credential classes, and tenant bindings are deployment configuration); `revision` is provider-interpreted (S3 VersionId, GCS generation, Azure version id).',
  },
  'documents.list': {
    operationId: 'documents.list',
    title: 'List documents',
    summary: 'List documents in the tenant, newest first, cursor-paginated.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/documents',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.read'],
    params: AdminTenantParamsSchema,
    query: AdminDocumentListQuerySchema,
    responses: {
      200: { contentType: 'application/json', schema: AdminDocumentListResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.get': {
    operationId: 'documents.get',
    title: 'Get document',
    summary: 'Fetch one document record.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/documents/:id',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.read'],
    params: AdminTenantDocParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: AdminDocumentResponseSchema },
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.download': {
    operationId: 'documents.download',
    title: 'Download document',
    summary: 'Download the stored base PDF bytes.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/documents/:id/download',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.read'],
    params: AdminTenantDocParamsSchema,
    responses: {
      200: { contentType: 'application/pdf' },
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.delete': {
    operationId: 'documents.delete',
    title: 'Delete document',
    summary: 'Delete a document and its stored artifacts.',
    method: 'DELETE',
    path: '/v1/tenants/:tenantId/documents/:id',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.delete'],
    params: AdminTenantDocParamsSchema,
    responses: {
      204: {},
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.thumbnail': {
    operationId: 'documents.thumbnail',
    title: 'Get thumbnail',
    summary: 'Fetch the warmed dashboard-tile render for a document.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/documents/:id/thumbnail',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.read'],
    params: AdminTenantDocParamsSchema,
    responses: {
      200: { contentType: ['image/webp', 'image/png'] },
      404: { contentType: 'application/json', schema: AdminThumbnailUnavailablePayloadSchema },
    },
  },
  'deployment.licenseStatus': {
    operationId: 'deployment.licenseStatus',
    title: 'License status',
    summary: 'License decision plus usage-reporting and meter snapshots for this deployment.',
    method: 'GET',
    path: adminWirePaths.deploymentLicenseStatus,
    credentials: ['api-token'],
    scope: [],
    responses: {
      200: { contentType: 'application/json', schema: AdminLicenseStatusResponseSchema },
    },
  },
  'tokens.issue': {
    operationId: 'tokens.issue',
    title: 'Issue token',
    summary: 'Mint a delegated JWT: a doc token, or (API token only) a tenant token.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/tokens',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['tokens.issue-doc'],
    params: AdminTenantParamsSchema,
    body: { contentType: 'application/json', schema: AdminTokenIssueRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: AdminTokenIssueResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'kind "tenant" requires the API token — authority mints only downward. Mounted only when the deployment can sign (HS256 mode); asymmetric deployments mint with their own private key.',
  },
  'tokens.revoke': {
    operationId: 'tokens.revoke',
    title: 'Revoke token',
    summary: 'Revoke a token by jti; live sessions drop on their next heartbeat.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/tokens/:jti/revoke',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['tokens.revoke'],
    params: AdminTenantJtiParamsSchema,
    body: {
      contentType: 'application/json',
      schema: AdminTokenRevokeRequestSchema,
      required: false,
    },
    responses: {
      204: {},
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes: 'Mounted only when the deployment enables token revocation.',
  },
  'tenants.usage': {
    operationId: 'tenants.usage',
    title: 'Tenant usage',
    summary: 'Per-tenant usage facts (views, uploads, stored bytes) for one UTC month.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/usage',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.read'],
    params: AdminTenantParamsSchema,
    query: TenantUsageQuerySchema,
    responses: {
      200: { contentType: 'application/json', schema: TenantUsageResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'Facts only — no limits or billing state. Views count share exchanges plus authorized ' +
      '/v1/access grants, deduplicated across the two.',
  },
  'tenants.suspend': {
    operationId: 'tenants.suspend',
    title: 'Suspend tenant',
    summary: 'Fail the tenant closed: refuse every tenant JWT, doc JWT, and share exchange.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/suspend',
    credentials: ['api-token'],
    scope: [],
    params: AdminTenantParamsSchema,
    body: {
      contentType: 'application/json',
      schema: TenantSuspendRequestSchema,
      required: false,
    },
    responses: {
      204: {},
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'Instantly reversible with resume. The API token is exempt, so a suspended tenant can ' +
      'still be inspected, exported, resumed, or deleted.',
  },
  'tenants.resume': {
    operationId: 'tenants.resume',
    title: 'Resume tenant',
    summary: 'Lift a suspension; credentials for the tenant verify again.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/resume',
    credentials: ['api-token'],
    scope: [],
    params: AdminTenantParamsSchema,
    responses: {
      204: {},
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'shares.create': {
    operationId: 'shares.create',
    title: 'Create share',
    summary: 'Create a standing share grant for one document — the no-backend embed credential.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/shares',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['shares.manage'],
    params: AdminTenantParamsSchema,
    body: { contentType: 'application/json', schema: ShareGrantCreateRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: ShareGrantResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'The returned share id IS the public share token. Mounted only when the deployment can ' +
      'sign (HS256 mode) — exchange mints session JWTs, so grants exist only where minting does.',
  },
  'shares.list': {
    operationId: 'shares.list',
    title: 'List shares',
    summary: 'List share grants in the tenant, newest first, cursor-paginated.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/shares',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['shares.manage'],
    params: AdminTenantParamsSchema,
    query: ShareGrantListQuerySchema,
    responses: {
      200: { contentType: 'application/json', schema: ShareGrantListResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'shares.get': {
    operationId: 'shares.get',
    title: 'Get share',
    summary: 'Fetch one share grant.',
    method: 'GET',
    path: '/v1/tenants/:tenantId/shares/:shareId',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['shares.manage'],
    params: AdminTenantShareParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: ShareGrantResponseSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'shares.update': {
    operationId: 'shares.update',
    title: 'Update share',
    summary: 'Edit a grant in place — every embedded copy of the token follows the row.',
    method: 'PATCH',
    path: '/v1/tenants/:tenantId/shares/:shareId',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['shares.manage'],
    params: AdminTenantShareParamsSchema,
    body: { contentType: 'application/json', schema: ShareGrantUpdateRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: ShareGrantResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'shares.delete': {
    operationId: 'shares.delete',
    title: 'Revoke share',
    summary: 'Delete a grant; exchange stops immediately, live sessions lapse at their exp.',
    method: 'DELETE',
    path: '/v1/tenants/:tenantId/shares/:shareId',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['shares.manage'],
    params: AdminTenantShareParamsSchema,
    responses: {
      204: {},
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'shares.exchange': {
    operationId: 'shares.exchange',
    title: 'Exchange share token',
    summary: 'Trade a public share token for a short-lived document session JWT.',
    method: 'POST',
    path: adminWirePaths.shareSessions,
    credentials: [],
    scope: [],
    body: { contentType: 'application/json', schema: ShareExchangeRequestSchema },
    responses: {
      200: { contentType: 'application/json', schema: ShareSessionResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      403: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      404: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      410: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
      422: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes:
      'Unauthenticated, but requires a browser Origin header, checked against the grant ' +
      'allowlist. Unknown, revoked, and disabled tokens are indistinguishable (404). ' +
      'Passphrase-protected grants return 422 SharePasswordRequired until `password` is ' +
      'supplied. Mounted only when the deployment can sign (HS256 mode).',
  },
} as const satisfies Record<string, AdminOperation>;
export type AdminOperationId = keyof typeof adminOperations;

// ---------------------------------------------------------------------------
// Doc-plane operations (the backend-usable document API)
// ---------------------------------------------------------------------------
//
// The "API vs protocol" split: these are the document operations a backend
// can genuinely call — plain origin paths, credentialed by the API token
// (which the server resolves to the document's own tenant) or a doc JWT
// carrying the listed capabilities. The viewer-session protocol — /v1/access,
// /v1/warm, the immutable `@{version}` CDN variants, SSE, weak annotation
// sessions, password sessions — deliberately stays out of this registry: it
// is the transport between the CloudPDF viewer SDK and the engine, free to
// evolve behind the SDK boundary. Body/response schemas start deliberately
// loose (documented paths, params, credentials, capabilities) and tighten
// incrementally as the wire shapes are ported from engine-core.

export const DocIdParamsSchema = z.object({
  docId: z.string().regex(docIdPattern),
});
export const DocLayerParamsSchema = DocIdParamsSchema.extend({
  layerName: z.string().min(1),
});
export const DocPageParamsSchema = DocLayerParamsSchema.extend({
  pon: z.coerce.number().int().min(0),
});
export const DocAnnotationParamsSchema = DocPageParamsSchema.extend({
  annotKey: z.string().min(1),
});
export const DocFieldParamsSchema = DocLayerParamsSchema.extend({
  fieldKey: z.string().min(1),
});

/**
 * Attached to every doc-plane operation: per-request password supply for
 * encrypted documents, API-token callers only. Viewer JWTs never send
 * passwords in headers — they use the SDK's password-session flow.
 */
export const documentPasswordHeader: AdminOperationHeader = {
  name: 'X-Document-Password',
  required: false,
  description:
    'Base64-encoded password for an encrypted document. Valid only with the API token ' +
    '(403 anywhere else). An encrypted document answers 422 DocPasswordRequired when ' +
    'the header is absent. Viewer doc JWTs use the SDK password-session flow instead.',
};

const looseJson = z.record(z.string(), z.unknown());
const docCredentials = ['api-token', 'doc-jwt'] as const;

/**
 * Every doc-plane mutation responds with the shared meta envelope — the
 * cache/version deltas SDKs use to re-point immutable reads — plus
 * operation-specific fields that tighten per-op as they are ported.
 */
const MutationResponseSchema = z.object({ meta: MutationMetaSchema }).passthrough();

export const docOperations = {
  'doc.head': {
    operationId: 'doc.head',
    title: 'Open document',
    summary: 'Open a document and return its head (versions, page count, security).',
    method: 'GET',
    path: wireTemplates.docHead,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.open'],
    requestHeaders: [documentPasswordHeader],
    params: DocIdParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: DocumentHeadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.manifest': {
    operationId: 'doc.manifest',
    title: 'Get manifest',
    summary: "Full layer manifest at the layer's current version.",
    method: 'GET',
    path: wireTemplates.layerManifest,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.open'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: DocumentManifestSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.metadata.get': {
    operationId: 'doc.metadata.get',
    title: 'Get metadata',
    summary: 'Document metadata (PDF info dictionary view) for a layer.',
    method: 'GET',
    path: wireTemplates.layerMetadata,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.open'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: DocumentMetadataSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.render': {
    operationId: 'doc.render',
    title: 'Render page',
    summary: 'Render one page as an image at the current layer version.',
    method: 'GET',
    path: wireTemplates.layerRenderPage,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.render'],
    requestHeaders: [documentPasswordHeader],
    params: DocPageParamsSchema,
    notes:
      'Render parameters (viewport, format) pass as flat dotted query keys, e.g. ' +
      '`?viewport.kind=width&viewport.width=800`; the full grammar is documented with the viewer.',
    responses: {
      200: { contentType: 'image/webp' },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.text': {
    operationId: 'doc.text',
    title: 'Extract page text',
    summary: 'Extracted text content for one page.',
    method: 'GET',
    path: wireTemplates.layerTextPage,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.text.copy'],
    requestHeaders: [documentPasswordHeader],
    params: DocPageParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: PageTextSnapshotSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.annotations.list': {
    operationId: 'doc.annotations.list',
    title: 'List annotations',
    summary: "One page's annotations at the current layer version.",
    method: 'GET',
    path: wireTemplates.layerAnnotationItems,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.annotate.read'],
    requestHeaders: [documentPasswordHeader],
    params: DocPageParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: AnnotationListPageSnapshotSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.annotations.create': {
    operationId: 'doc.annotations.create',
    title: 'Create annotation',
    summary: 'Create an annotation on a page.',
    method: 'POST',
    path: wireTemplates.layerAnnotationItems,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.annotate.modify'],
    requestHeaders: [documentPasswordHeader],
    params: DocPageParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    notes:
      'Doc JWTs may instead carry collab scopes (annotations:create:self, …) that refine ' +
      'per-annotation authorship rules; the API token is exempt from both.',
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.annotations.update': {
    operationId: 'doc.annotations.update',
    title: 'Update annotation',
    summary: 'Update one annotation by key.',
    method: 'PATCH',
    path: wireTemplates.layerAnnotationItem,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.annotate.modify'],
    requestHeaders: [documentPasswordHeader],
    params: DocAnnotationParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.annotations.delete': {
    operationId: 'doc.annotations.delete',
    title: 'Delete annotation',
    summary: 'Delete one annotation by key.',
    method: 'DELETE',
    path: wireTemplates.layerAnnotationItem,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.annotate.modify'],
    requestHeaders: [documentPasswordHeader],
    params: DocAnnotationParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.forms.get': {
    operationId: 'doc.forms.get',
    title: 'Get form snapshot',
    summary: 'Reconciled form snapshot: fields, widgets, values.',
    method: 'GET',
    path: wireTemplates.layerForm,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.forms.read'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: FormSnapshotSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.forms.setValue': {
    operationId: 'doc.forms.setValue',
    title: 'Set form value',
    summary: "Set one form field's value.",
    method: 'POST',
    path: wireTemplates.layerFormFieldValue,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.forms.fill'],
    requestHeaders: [documentPasswordHeader],
    params: DocFieldParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.forms.reset': {
    operationId: 'doc.forms.reset',
    title: 'Reset form field',
    summary: 'Reset one form field to its default value.',
    method: 'POST',
    path: wireTemplates.layerFormFieldReset,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.forms.fill'],
    requestHeaders: [documentPasswordHeader],
    params: DocFieldParamsSchema,
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.forms.exportData': {
    operationId: 'doc.forms.exportData',
    title: 'Export form data',
    summary: 'Export form data as FDF or XFDF.',
    method: 'GET',
    path: wireTemplates.layerFormData,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.forms.read'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    query: z.object({ format: z.enum(['fdf', 'xfdf']).optional() }),
    responses: {
      200: { contentType: ['application/vnd.adobe.xfdf', 'application/vnd.fdf'] },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.forms.importData': {
    operationId: 'doc.forms.importData',
    title: 'Import form data',
    summary: 'Import form data (FDF/XFDF), filling matching fields.',
    method: 'POST',
    path: wireTemplates.layerFormData,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.forms.fill'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.pages.move': {
    operationId: 'doc.pages.move',
    title: 'Move pages',
    summary: 'Reorder pages.',
    method: 'POST',
    path: wireTemplates.layerPagesMove,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.pages.assemble'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.pages.rotate': {
    operationId: 'doc.pages.rotate',
    title: 'Rotate pages',
    summary: 'Set absolute rotation on pages.',
    method: 'POST',
    path: wireTemplates.layerPagesRotate,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.pages.assemble'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.pages.delete': {
    operationId: 'doc.pages.delete',
    title: 'Delete pages',
    summary: 'Delete pages.',
    method: 'POST',
    path: wireTemplates.layerPagesDelete,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.pages.assemble'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    body: { contentType: 'application/json', schema: looseJson },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.pages.flatten': {
    operationId: 'doc.pages.flatten',
    title: 'Flatten pages',
    summary: 'Flatten annotations and form fields into page content.',
    method: 'POST',
    path: wireTemplates.layerPagesFlatten,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.pages.modify', 'doc.annotate.modify'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    body: { contentType: 'application/json', schema: looseJson, required: false },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.redactions.apply': {
    operationId: 'doc.redactions.apply',
    title: 'Apply redactions',
    summary: 'Apply pending redactions, permanently removing content.',
    method: 'POST',
    path: wireTemplates.layerRedactionsApply,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.pages.modify', 'doc.annotate.modify', 'doc.redact'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    body: { contentType: 'application/json', schema: looseJson, required: false },
    responses: {
      200: { contentType: 'application/json', schema: MutationResponseSchema },
      400: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
  'doc.download': {
    operationId: 'doc.download',
    title: 'Download PDF',
    summary: "Download the layer's current PDF (base plus layer edits).",
    method: 'GET',
    path: wireTemplates.layerDownload,
    credentials: docCredentials,
    scope: [],
    docCapabilities: ['doc.download'],
    requestHeaders: [documentPasswordHeader],
    params: DocLayerParamsSchema,
    responses: {
      200: { contentType: 'application/pdf' },
      404: { contentType: 'application/json', schema: EngineErrorPayloadSchema },
    },
  },
} as const satisfies Record<string, AdminOperation>;
export type DocOperationId = keyof typeof docOperations;

/** Every operation in the published contract: admin surfaces + doc plane. */
export const allOperations = { ...adminOperations, ...docOperations } as const;

/**
 * Documentation groups, keyed by the dot-joined `x-fern-sdk-group-name`
 * path of the operations they contain. Emitted as `x-docs-groups`; the
 * API reference derives its navigation sections from this manifest, so
 * key order here is section order there. `slug` overrides the URL
 * segment when the registry's short group name isn't the public one.
 * The emitter fails if an operation's group path is missing here.
 */
export interface DocsGroup {
  title: string;
  slug?: string;
}

export const docsGroups = {
  deployment: { title: 'Deployment' },
  tenants: { title: 'Tenants' },
  documents: { title: 'Tenant documents' },
  tokens: { title: 'Tokens' },
  shares: { title: 'Shares' },
  doc: { title: 'Document operations', slug: 'document-operations' },
  'doc.annotations': { title: 'Annotations' },
  'doc.forms': { title: 'Forms' },
  'doc.metadata': { title: 'Metadata' },
  'doc.pages': { title: 'Pages' },
  'doc.redactions': { title: 'Redactions' },
} as const satisfies Record<string, DocsGroup>;
