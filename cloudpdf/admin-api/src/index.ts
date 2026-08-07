import { z } from 'zod';

const sha256Hex = /^[0-9a-f]{64}$/i;
const docIdPattern = /^[A-Za-z0-9_-]+$/;
/**
 * Tenant ids share the doc-id charset: URL-safe by construction, since
 * they appear in every tenant-scoped path (and therefore in logs — do
 * not put PII in tenant ids).
 */
const tenantIdPattern = /^[A-Za-z0-9_-]+$/;

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
  documentsInit: (tenantId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/init`,
  document: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}`,
  documentCommit: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/commit`,
  documentUploadDirect: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/upload-direct`,
  documentDownload: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/download`,
  /** The warmed dashboard-tile artifact. Returns 404 while `pending`/`locked`. */
  documentThumbnail: (tenantId: string, docId: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/documents/${encodeURIComponent(docId)}/thumbnail`,
  tokenRevoke: (tenantId: string, jti: string) =>
    `/v1/tenants/${encodeURIComponent(tenantId)}/tokens/${encodeURIComponent(jti)}/revoke`,
  /** Deployment-global singletons: API-token only, no tenant context. */
  deploymentLicenseStatus: '/v1/deployment/license/status',
} as const;

export const DedupModeSchema = z.enum(['always-create', 'reuse-existing']);
export type DedupMode = z.infer<typeof DedupModeSchema>;

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
    kind: z.literal('direct'),
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

export const AdminUploadDirectResponseSchema = z.object({
  sha256: z.string().regex(sha256Hex),
});
export type AdminUploadDirectResponse = z.infer<typeof AdminUploadDirectResponseSchema>;

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
 * Tenant-token scopes used by the admin surface. The wildcard `*` always
 * satisfies a scope check and is deliberately not listed — operations
 * declare the *specific* scope they require.
 */
export const adminTenantScopes = ['docs.create', 'docs.read', 'docs.delete', 'tokens.mint'] as const;
export type AdminTenantScope = (typeof adminTenantScopes)[number];

/**
 * The two credential kinds of the one-rule auth model: the API token
 * (static deployment secret) is valid everywhere; a tenant JWT is valid
 * exactly under its own `/v1/tenants/{tenantId}/` subtree.
 */
export const adminCredentials = ['api-token', 'tenant-jwt'] as const;
export type AdminCredential = (typeof adminCredentials)[number];

export type AdminOperationMethod = 'GET' | 'POST' | 'DELETE';

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
  'documents.init': {
    operationId: 'documents.init',
    summary: 'Begin an upload: create (or resume/dedupe) a pending document and issue upload access.',
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
  'documents.uploadDirect': {
    operationId: 'documents.uploadDirect',
    summary: 'Upload the PDF bytes through the origin instead of a presigned URL.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/documents/:id/upload-direct',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['docs.create'],
    params: AdminTenantDocParamsSchema,
    body: {
      contentType: ['application/pdf', 'application/octet-stream', 'multipart/form-data'],
    },
    responses: {
      200: { contentType: 'application/json', schema: AdminUploadDirectResponseSchema },
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
  },
  'documents.list': {
    operationId: 'documents.list',
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
  'license.status': {
    operationId: 'license.status',
    summary: 'License decision plus usage-reporting and meter snapshots for this deployment.',
    method: 'GET',
    path: adminWirePaths.deploymentLicenseStatus,
    credentials: ['api-token'],
    scope: [],
    responses: {
      200: { contentType: 'application/json', schema: AdminLicenseStatusResponseSchema },
    },
  },
  'tokens.revoke': {
    operationId: 'tokens.revoke',
    summary: 'Revoke a token by jti; live sessions drop on their next heartbeat.',
    method: 'POST',
    path: '/v1/tenants/:tenantId/tokens/:jti/revoke',
    credentials: ['api-token', 'tenant-jwt'],
    scope: ['tokens.mint'],
    params: AdminTenantJtiParamsSchema,
    body: { contentType: 'application/json', schema: AdminTokenRevokeRequestSchema, required: false },
    responses: {
      204: {},
      400: { contentType: 'application/json', schema: AdminErrorPayloadSchema },
    },
    notes: 'Mounted only when the deployment enables token revocation.',
  },
} as const satisfies Record<string, AdminOperation>;
export type AdminOperationId = keyof typeof adminOperations;
