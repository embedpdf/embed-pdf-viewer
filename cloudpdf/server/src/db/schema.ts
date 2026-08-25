/**
 * Logical database schema for @cloudpdf/server.
 *
 * Source of truth for both SQLite (Phase 1) and Postgres (Phase 2). The
 * column shapes here are the dialect-agnostic view; per-dialect migration
 * files under `db/migrations/{sqlite,postgres}/` adapt them to actual
 * column types (TEXT/INTEGER for SQLite, equivalents for PG).
 *
 * Phase 1 ships only `tenants`, `documents`, and `schema_migrations`.
 * Later phases add `document_pages`, `layers`, `layer_pages`,
 * `revoked_jtis`, `jwks_cache`, `audit_log`, and weak annotation sessions.
 */

import type { Generated } from 'kysely';

/**
 * Lifecycle state of a `documents` row.
 *
 * - `pending`  - row reserved; bytes not yet committed (init call returned
 *                a presigned PUT or upload-proxy URL).
 * - `ready`    - bytes verified (sha matches) and visible to the engine.
 * - `failed`   - terminal failure (sha mismatch, timeout, explicit abort).
 * - `deleting` - cascade-delete in progress; storage prefix being torn down.
 */
export type DocumentState = 'pending' | 'ready' | 'failed' | 'deleting';
export type DocumentEncryptionState = 'unknown' | 'none' | 'encrypted' | 'unsupported';
export type DocumentPdfOpenedAs = 'none' | 'user' | 'owner';

export type TenantStatus = 'active' | 'suspended';

export interface TenantsTable {
  id: string;
  name: string;
  config_json: string | null;
  created_at: number;
  /** 1 when the namespace materialized on first use rather than via explicit create. */
  auto_provisioned: number;
  /**
   * `suspended` fails the namespace closed: every tenant JWT, doc JWT,
   * and share exchange is refused (403) until resume. The API token is
   * exempt so the operator can always inspect, resume, or delete.
   */
  status: TenantStatus;
  suspended_at: number | null;
}

export interface DocumentsTable {
  id: string;
  tenant_id: string;
  state: DocumentState;
  base_sha: string | null;
  storage_size_bytes: number | null;
  /** SHA-256 declared at init and verified at commit. */
  expected_sha256: string | null;
  /** Exact PDF byte length declared at init and verified before commit. */
  expected_size_bytes: number | null;
  /** The server-selected transfer path for this pending upload. */
  upload_kind: 'presigned' | 'proxy' | 'pull' | null;
  /** Absolute epoch milliseconds when the issued upload access expires. */
  upload_expires_at: number | null;
  encryption_state: DocumentEncryptionState;
  encryption_requires_password: boolean | number | null;
  security_handler_revision: number | null;
  pdf_permissions_bits: number | null;
  pdf_permissions_all_allowed: boolean | number | null;
  pdf_opened_as: DocumentPdfOpenedAs | null;
  security_probed_at: number | null;
  doc_version: Generated<number>;
  metadata_json: string | null;
  /** Customer-supplied retry key; unique per `(tenant_id, idempotency_key)`. */
  idempotency_key: string | null;
  /**
   * If `state = 'failed'`, a short machine-readable reason
   * (`sha_mismatch`, `upload_timeout`, `aborted`).
   */
  failure_reason: string | null;
  /**
   * Thumbnail lifecycle for dashboards: `pending` (not warmed yet — the
   * read-through still works), `ready`, `locked` (user-password doc: NO
   * derived artifact by design), `failed` (warm errored; read-through is
   * the repair path). Defaults `pending` via migration 015.
   */
  thumbnail_state: Generated<string>;
  /** Storage key of the warmed base-tier artifact (null until warmed). */
  thumbnail_key: string | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
}

export interface DocumentPagesTable {
  doc_id: string;
  page_object_number: number;
  content_version: number;
  annotation_version: number;
  annotation_generation: number;
  has_weak_annotations: boolean | number;
  updated_at: number;
}

export interface LayersTable {
  id: string;
  doc_id: string;
  tenant_id: string;
  name: string;
  doc_version: number;
  /**
   * Geometry-pointer epoch for `/layout@layoutVersion`. Bumps only on
   * structural page ops (move/insert/delete/rotate), a different cadence
   * than `doc_version`.
   */
  layout_version: number;
  /**
   * Metadata-pointer epoch for `/metadata@metadataVersion`. Bumps only on
   * metadata writes (Info-dict edits), a different cadence than
   * `doc_version` and `layout_version`.
   */
  metadata_version: number;
  /**
   * Attachments-pointer epoch for `/attachments@attachmentsVersion` and
   * `/attachment-files/…@…`. Bumps only on attachment create/delete, a
   * different cadence than `doc_version` and `metadata_version`.
   */
  attachments_version: number;
  /** Audit-log head at this layer's current state — advanced in the same
   *  transaction as every audit append. Published as the manifest's
   *  `auditHead` (the gapless subscribe cursor). */
  last_audit_id: number;
  current_version: number;
  current_artifact_key: string | null;
  current_artifact_sha: string | null;
  current_artifact_size: number | null;
  created_at: number;
  updated_at: number;
}

export interface LayerPagesTable {
  layer_id: string;
  page_object_number: number;
  content_version: number;
  annotation_version: number;
  annotation_generation: number;
  has_weak_annotations: boolean | number;
  updated_at: number;
}

export interface WeakAnnotationSessionsTable {
  id: string;
  tenant_id: string;
  doc_id: string;
  layer_name: string;
  sub: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
}

export interface WeakAnnotationSessionPagesTable {
  session_id: string;
  page_object_number: number;
  updated_at: number;
  expires_at: number;
}

export interface AuditLogTable {
  id: Generated<number>;
  tenant_id: string;
  doc_id: string;
  layer_id: string;
  layer_name: string;
  ts: number;
  sub: string;
  kind: string;
  page_object_number: number | null;
  affected_pages_json: string;
  artifact_version: number;
  artifact_key: string;
  artifact_sha: string;
  artifact_size: number;
  idempotency_key: string | null;
  payload_json: string;
  /** Engine-instance session id of the mutating client (X-Engine-Session-Id);
   *  lets SSE subscribers drop their own echoes. NULL when not sent. */
  origin_session_id: string | null;
}

export type AuditExportStatus = 'running' | 'succeeded' | 'failed';

export interface AuditExportsTable {
  id: Generated<number>;
  tenant_id: string;
  doc_id: string;
  day: string;
  status: AuditExportStatus;
  storage_key: string | null;
  event_count: number;
  checksum: string | null;
  lease_id: string | null;
  lease_expires_at: number | null;
  started_at: number;
  finished_at: number | null;
  error_json: string | null;
  updated_at: number;
}

export interface PdfPasswordVerificationsTable {
  tenant_id: string;
  doc_id: string;
  base_sha: string;
  security_fingerprint: string;
  password_proof: string;
  hmac_key_id: string;
  opened_as: DocumentPdfOpenedAs;
  pdf_permissions_bits: number;
  pdf_permissions_all_allowed: boolean | number;
  security_handler_revision: number | null;
  verified_at: number;
  expires_at: number;
}

export interface PdfPasswordSessionsTable {
  tenant_id: string;
  doc_id: string;
  layer_name: string;
  sub: string;
  jwt_jti: string;
  base_sha: string;
  security_fingerprint: string;
  opened_as: DocumentPdfOpenedAs;
  pdf_permissions_bits: number;
  pdf_permissions_all_allowed: boolean | number;
  security_handler_revision: number | null;
  active_expires_at: number;
  renewable_until: number;
  created_at: number;
  updated_at: number;
  server_secret_id: string;
  kms_provider_id: string;
  kms_key_id: string;
  crypto_version: string;
  wrapped_data_key: Buffer;
  row_salt: Buffer;
  nonce: Buffer;
  ciphertext: Buffer;
  auth_tag: Buffer;
}

/**
 * Append-only auth-control-plane history: token issuance and
 * revocation. Never the doc-mutation audit_log (that backs viewer SSE)
 * and never GC'd (unlike revoked_jtis). tenant_id has no FK — the
 * trail survives tenant deletion.
 */
export interface SecurityEventsTable {
  tenant_id: string;
  kind: string;
  jti: string | null;
  doc_id: string | null;
  scope_json: string;
  actor: string;
  via: string;
  reason: string | null;
  expires_at: number | null;
  created_at: number;
}

/**
 * Share grants: standing, revocable authorization decisions for the
 * no-backend embed flow. The row id IS the public share token — a
 * REFERENCE evaluated at exchange time, never a bearer credential,
 * which is what makes grants long-lived, editable, and revocable while
 * every credential that reaches a browser stays a short-lived doc JWT.
 */
export interface ShareGrantsTable {
  /** `shr_` + 24 url-safe random chars; doubles as the public share token. */
  id: string;
  tenant_id: string;
  doc_id: string;
  layer_name: string;
  /** Doc capability scopes the exchanged session carries (JSON array). */
  scope_json: string;
  /** Origin allowlist (JSON array); NULL = any origin. */
  origins_json: string | null;
  /** scrypt envelope (`scrypt$N$r$p$salt$hash`); NULL = no passphrase. */
  password_hash: string | null;
  session_ttl_seconds: number;
  /** 1 = paused: exchange refuses (404) but configuration is kept. */
  disabled: number;
  /** Unix epoch ms; NULL = no expiry. */
  expires_at: number | null;
  /** Successful exchanges — dashboard convenience, not the usage meter. */
  exchange_count: number;
  last_exchanged_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

/**
 * Per-tenant usage FACTS, one row per (tenant, metric, UTC month).
 * Deliberately separate from `license_usage_counter`: that table
 * answers "is this deployment within its license" and stays
 * deployment-wide; this one answers "what did each tenant consume"
 * and carries no limits — enforcement above the license is whoever
 * operates the deployment's business, expressed via tenant suspension.
 */
export interface DocumentImportsTable {
  id: string;
  tenant_id: string;
  doc_id: string;
  source_kind: string;
  connection_id: string | null;
  source_location: string;
  requested_revision: string | null;
  resolved_revision: string | null;
  expected_sha256: string | null;
  expected_size_bytes: number | null;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  attempts: number;
  max_attempts: number;
  next_attempt_at: number;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  requested_by: string | null;
  via: string | null;
  source_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface TenantUsageCounterTable {
  tenant_id: string;
  metric: 'pdf.uploads' | 'pdf.views';
  period_start: string;
  value: number;
  updated_at: number;
}

export interface SchemaMigrationsTable {
  /** Monotonically-increasing version (zero-padded for lexical sort). */
  version: string;
  /** Migration filename, for diagnostics. */
  name: string;
  /** SHA-256 of the migration file contents at apply time. */
  checksum: string;
  /** Unix epoch ms when the migration was applied. */
  applied_at: number;
}

/**
 * Phase 2 — per-token denylist consulted on every authenticated
 * request. Fronted by `RevokedJtisGuard`'s in-memory LRU so the DB
 * round-trip happens only on cache misses.
 */
export interface RevokedJtisTable {
  /** Opaque token id; PK. */
  jti: string;
  /** Tenant context for audit; nullable for system-issued tokens. */
  tenant_id: string | null;
  /** Short reason: `manual`, `password-rotation`, `compromise`, ... */
  reason: string | null;
  /** Unix epoch ms. */
  revoked_at: number;
  /** Unix epoch ms — same as the token's `exp`, used by GC sweeper. */
  expires_at: number;
}

/**
 * Phase 2 — persistent JWKS cache keyed by issuer. The actual
 * verifier uses `jose`'s in-memory cache; this table is the
 * cold-boot warm-up so we don't slam the customer's IdP on every
 * pod restart.
 */
export interface JwksCacheTable {
  issuer: string;
  jwks_json: string;
  fetched_at: number;
  expires_at: number;
}

export interface LicenseRuntimeStateTable {
  singleton_id: 1;
  deployment_id: string;
  license_mode: 'connected' | 'air-gapped' | null;
  license_key_fingerprint: string | null;
  keygen_license_id: string | null;
  installed_certificate: string | null;
  certificate_installed_at: number | null;
  last_validated_at: number | null;
  last_observed_time: number;
  validation_data_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface LicenseUsageCounterTable {
  metric: 'pdf.uploads' | 'pdf.views';
  period_start: string;
  value: number;
  updated_at: number;
}

export interface LicenseUsageEventTable {
  metric: 'pdf.uploads';
  event_id: string;
  period_start: string;
  created_at: number;
}

export interface LicenseReportingStateTable {
  singleton_id: 1;
  sequence: number;
  pending_payload_json: string | null;
  last_attempt_at: number | null;
  last_success_at: number | null;
  last_status: 'never' | 'success' | 'failed';
  last_error: string | null;
  updated_at: number;
}

export interface LicenseOperationLeaseTable {
  name: string;
  owner_id: string;
  expires_at: number;
  updated_at: number;
}

/**
 * The Kysely `Database` interface that the rest of the server typechecks
 * against. Each table maps to a single TypeScript shape; Kysely handles
 * INSERT/SELECT differences via the `Generated<T>` brand.
 */

export interface EngineCrashesTable {
  id: string;
  at: number;
  exit_code: number | null;
  exit_signal: string | null;
  engine_build: string;
  suspect_count: number;
  /** JSON string[] — pairwise singleton-intersection candidates (operator diagnostics, never enforcement). */
  likely_candidates: string | null;
}

export interface EngineCrashSuspectsTable {
  crash_id: string;
  base_sha: string;
  /** The raw wire kind the suspect was running — forensics, not a pairing key. */
  op_kind: string;
  doc_id: string | null;
}

export interface EngineQuarantineTable {
  base_sha: string;
  engine_build: string;
  reason: string;
  quarantined_at: number;
  expires_at: number;
  /** JSON string[] — the two sole-suspect crash ids that justified it. */
  sole_suspect_crash_ids: string | null;
}

export interface EngineQuarantineAuditTable {
  id: string;
  cleared_at: number;
  base_sha: string;
  engine_build: string | null;
  actor: string;
  reason: string;
}

export interface Database {
  tenants: TenantsTable & {
    created_at: Generated<number>;
    auto_provisioned: Generated<number>;
    status: Generated<TenantStatus>;
    suspended_at: Generated<number | null>;
  };
  documents: DocumentsTable & {
    created_at: Generated<number>;
    updated_at: Generated<number>;
  };
  document_pages: DocumentPagesTable;
  layers: LayersTable;
  layer_pages: LayerPagesTable;
  weak_annotation_sessions: WeakAnnotationSessionsTable;
  weak_annotation_session_pages: WeakAnnotationSessionPagesTable;
  audit_log: AuditLogTable;
  audit_exports: AuditExportsTable;
  pdf_password_verifications: PdfPasswordVerificationsTable;
  pdf_password_sessions: PdfPasswordSessionsTable;
  security_events: SecurityEventsTable & { id: Generated<number> };
  share_grants: ShareGrantsTable;
  document_imports: DocumentImportsTable;
  tenant_usage_counter: TenantUsageCounterTable;
  engine_crashes: EngineCrashesTable;
  engine_crash_suspects: EngineCrashSuspectsTable;
  engine_quarantine: EngineQuarantineTable;
  engine_quarantine_audit: EngineQuarantineAuditTable;
  schema_migrations: SchemaMigrationsTable;
  revoked_jtis: RevokedJtisTable;
  jwks_cache: JwksCacheTable;
  license_runtime_state: LicenseRuntimeStateTable;
  license_usage_counter: LicenseUsageCounterTable;
  license_usage_event: LicenseUsageEventTable;
  license_reporting_state: LicenseReportingStateTable;
  license_operation_lease: LicenseOperationLeaseTable;
}
