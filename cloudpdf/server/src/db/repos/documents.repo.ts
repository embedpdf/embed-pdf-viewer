import type { Kysely } from 'kysely';
import { decodePdfBits, type PdfBits } from '@embedpdf/engine-core/runtime';

import type {
  Database as Schema,
  DocumentEncryptionState,
  DocumentPdfOpenedAs,
  DocumentState,
} from '../schema';

export interface DocumentListOptions {
  limit?: number;
  state?: DocumentState;
  /**
   * Keyset cursor: only rows strictly after this (created_at, id)
   * position in `created_at DESC, id DESC` order. The id tiebreaker
   * makes pagination stable for same-millisecond created_at values.
   */
  before?: { createdAt: number; id: string };
}

export interface DocumentSecurityInfo {
  encryptionState: DocumentEncryptionState;
  encryptionRequiresPassword: boolean | null;
  securityHandlerRevision: number | null;
  pdfPermissionsBits: number | null;
  pdfPermissionsAllAllowed: boolean | null;
  pdfOpenedAs: DocumentPdfOpenedAs | null;
  securityProbedAt: number | null;
}

export interface DocumentRow {
  id: string;
  tenantId: string;
  state: DocumentState;
  baseSha: string | null;
  storageSizeBytes: number | null;
  expectedSha256: string | null;
  expectedSizeBytes: number | null;
  uploadKind: 'presigned' | 'proxy' | 'pull' | null;
  uploadExpiresAt: number | null;
  security: DocumentSecurityInfo;
  docVersion: number;
  metadata: Record<string, unknown> | null;
  idempotencyKey: string | null;
  failureReason: string | null;
  thumbnailState: DocumentThumbnailState;
  thumbnailKey: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}

export type DocumentThumbnailState = 'pending' | 'ready' | 'locked' | 'failed';

export interface CreatePendingInput {
  id: string;
  tenantId: string;
  metadata: Record<string, unknown> | null;
  idempotencyKey: string | null;
  createdBy: string | null;
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
}

export interface SetUploadIntentInput {
  id: string;
  tenantId: string;
  kind: 'presigned' | 'proxy' | 'pull';
  expiresAt: number;
}

export interface CommitInput {
  id: string;
  tenantId: string;
  baseSha: string;
  storageSizeBytes: number;
  docVersion?: number;
  security?: Partial<DocumentSecurityInfo>;
}

/**
 * Pure-data access to the `documents` table. Knows nothing about
 * object storage; the orchestrator wires those concerns together.
 *
 * Concurrency model:
 *   - `commit` is a guarded `UPDATE ... WHERE state = 'pending'`.
 *     A second concurrent commit hits zero rows and the caller treats
 *     that as `Conflict`. This makes commits idempotent at the storage
 *     layer (you can retry the entire flow safely).
 *   - `idempotency_key` is a partial unique index in the schema, so
 *     inserts with a duplicate key fail with a unique-violation that
 *     `createPending` translates into "return the existing row".
 */
export class DocumentsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async createPending(input: CreatePendingInput): Promise<{ row: DocumentRow; created: boolean }> {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.tenantId, input.idempotencyKey);
      if (existing) return { row: existing, created: false };
    }
    const now = Date.now();
    try {
      await this.db
        .insertInto('documents')
        .values({
          id: input.id,
          tenant_id: input.tenantId,
          state: 'pending',
          base_sha: null,
          storage_size_bytes: null,
          expected_sha256: input.expectedSha256 ?? null,
          expected_size_bytes: input.expectedSizeBytes ?? null,
          upload_kind: null,
          upload_expires_at: null,
          encryption_state: 'unknown',
          encryption_requires_password: null,
          security_handler_revision: null,
          pdf_permissions_bits: null,
          pdf_permissions_all_allowed: null,
          pdf_opened_as: null,
          security_probed_at: null,
          metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
          idempotency_key: input.idempotencyKey,
          failure_reason: null,
          created_at: now,
          updated_at: now,
          created_by: input.createdBy,
        })
        .execute();
    } catch (err) {
      // Two windows can race a unique-index hit: the lookup above
      // happens outside any transaction, so a concurrent insert with
      // the same idempotency key can sneak in. Re-resolve from the DB.
      if (input.idempotencyKey && isUniqueViolation(err)) {
        const existing = await this.findByIdempotencyKey(input.tenantId, input.idempotencyKey);
        if (existing) return { row: existing, created: false };
      }
      throw err;
    }
    const row = await this.findById(input.id);
    if (!row) throw new Error(`createPending: row vanished after insert: ${input.id}`);
    return { row, created: true };
  }

  async findById(id: string): Promise<DocumentRow | null> {
    const r = await this.db
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return r ? mapRow(r) : null;
  }

  /** Strict variant: throws NotFound or Forbidden as appropriate. */
  async requireOwned(id: string, tenantId: string): Promise<DocumentRow> {
    const r = await this.findById(id);
    if (!r) throwError('NotFound', `document not found: ${id}`);
    if (r.tenantId !== tenantId)
      throwError('Forbidden', `document does not belong to tenant: ${id}`);
    return r;
  }

  /**
   * Cheap accessor for the document's PDF permission bits, decoded into
   * the typed `PdfBits` view used by the scope resolver.
   *
   * Used by route guards that need to evaluate `pdf.permissions`
   * expansion before performing a capability check. Does NOT materialise
   * the base file or open PDFium — it just reads the cached integer
   * column populated at ingestion by `DocumentSecurityProbe`.
   *
   * Throws `NotFound` / `Forbidden` (via `requireOwned`) for unknown
   * docs or cross-tenant access. Returns all-false bits for documents
   * whose `pdf_permissions_bits` column is `null` (unprobed or
   * non-encrypted PDFs without explicit user-access flags).
   */
  async getPdfBits(id: string, tenantId: string): Promise<PdfBits> {
    const r = await this.requireOwned(id, tenantId);
    return decodePdfBits(r.security.pdfPermissionsBits ?? null);
  }

  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<DocumentRow | null> {
    const r = await this.db
      .selectFrom('documents')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
    return r ? mapRow(r) : null;
  }

  async findByBaseSha(tenantId: string, baseSha: string): Promise<DocumentRow | null> {
    const r = await this.db
      .selectFrom('documents')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('base_sha', '=', baseSha)
      .where('state', '=', 'ready')
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return r ? mapRow(r) : null;
  }

  /** Persist the transfer path before the client is allowed to send bytes. */
  async setUploadIntent(input: SetUploadIntentInput): Promise<DocumentRow | null> {
    const res = await this.db
      .updateTable('documents')
      .set({
        upload_kind: input.kind,
        upload_expires_at: input.expiresAt,
        updated_at: Date.now(),
      })
      .where('id', '=', input.id)
      .where('tenant_id', '=', input.tenantId)
      .where('state', '=', 'pending')
      .execute();
    if (Number(res[0]?.numUpdatedRows ?? 0) === 0) return null;
    return this.findById(input.id);
  }

  async listForTenant(tenantId: string, opts: DocumentListOptions = {}): Promise<DocumentRow[]> {
    let q = this.db
      .selectFrom('documents')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
    if (opts.state) q = q.where('state', '=', opts.state);
    if (opts.before) {
      const { createdAt, id } = opts.before;
      // Spelled as OR rather than a row-value comparison so both
      // dialects plan it against idx_documents_tenant_created_id.
      q = q.where((eb) =>
        eb.or([
          eb('created_at', '<', createdAt),
          eb.and([eb('created_at', '=', createdAt), eb('id', '<', id)]),
        ]),
      );
    }
    if (opts.limit) q = q.limit(opts.limit);
    const rows = await q.execute();
    return rows.map(mapRow);
  }

  /**
   * Promote pending -> ready atomically. Returns the updated row, or
   * `null` if no row was in `pending` state (already committed, failed,
   * or deleted concurrently — caller treats as Conflict).
   */
  async commit(input: CommitInput): Promise<DocumentRow | null> {
    const now = Date.now();
    const security = input.security ?? {};
    const res = await this.db
      .updateTable('documents')
      .set({
        state: 'ready',
        base_sha: input.baseSha,
        storage_size_bytes: input.storageSizeBytes,
        encryption_state: security.encryptionState ?? 'unknown',
        encryption_requires_password: nullableBool(security.encryptionRequiresPassword),
        security_handler_revision: security.securityHandlerRevision ?? null,
        pdf_permissions_bits: security.pdfPermissionsBits ?? null,
        pdf_permissions_all_allowed: nullableBool(security.pdfPermissionsAllAllowed),
        pdf_opened_as: security.pdfOpenedAs ?? null,
        security_probed_at: security.securityProbedAt ?? null,
        doc_version: input.docVersion ?? 1,
        updated_at: now,
      })
      .where('id', '=', input.id)
      .where('tenant_id', '=', input.tenantId)
      .where('state', '=', 'pending')
      .execute();
    const affected = Number(res[0]?.numUpdatedRows ?? 0);
    if (affected === 0) return null;
    return this.findById(input.id);
  }

  /** Mark a pending row as terminally failed. Idempotent. */
  async markFailed(id: string, tenantId: string, reason: string): Promise<void> {
    await this.db
      .updateTable('documents')
      .set({ state: 'failed', failure_reason: reason, updated_at: Date.now() })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('state', '=', 'pending')
      .execute();
  }

  /**
   * Advance the thumbnail lifecycle. `key` is the warmed base-tier
   * artifact's storage key (only meaningful with `ready`). Best-effort
   * bookkeeping: the read-through render path is the correctness path,
   * this column only drives dashboard tiles.
   */
  async setThumbnail(
    id: string,
    tenantId: string,
    state: DocumentThumbnailState,
    key: string | null = null,
  ): Promise<void> {
    await this.db
      .updateTable('documents')
      .set({ thumbnail_state: state, thumbnail_key: key, updated_at: Date.now() })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  /**
   * Two-phase cascade delete: flip to `deleting`, then row removal.
   * Caller is responsible for clearing storage between the two phases.
   * Returns true on the first-phase update; false if the row was
   * already gone or already in `deleting`.
   */
  async beginDelete(id: string, tenantId: string): Promise<DocumentRow | null> {
    const res = await this.db
      .updateTable('documents')
      .set({ state: 'deleting', updated_at: Date.now() })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .where('state', 'in', ['pending', 'ready', 'failed'])
      .execute();
    const affected = Number(res[0]?.numUpdatedRows ?? 0);
    if (affected === 0) return null;
    return this.findById(id);
  }

  async finalizeDelete(id: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom('documents')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  /**
   * Return pending docs older than `olderThanMs`. Used by the
   * background sweeper to GC abandoned uploads.
   */
  async listStalePending(olderThanMs: number, now: number = Date.now()): Promise<DocumentRow[]> {
    const cutoff = now - olderThanMs;
    const rows = await this.db
      .selectFrom('documents')
      .selectAll()
      .where('state', '=', 'pending')
      .where('updated_at', '<', cutoff)
      .execute();
    return rows.map(mapRow);
  }
}

function mapRow(r: {
  id: string;
  tenant_id: string;
  state: DocumentState;
  base_sha: string | null;
  storage_size_bytes: number | null;
  expected_sha256?: string | null;
  expected_size_bytes?: number | null;
  upload_kind?: 'presigned' | 'proxy' | 'pull' | null;
  upload_expires_at?: number | null;
  encryption_state?: DocumentEncryptionState | null;
  encryption_requires_password?: boolean | number | null;
  security_handler_revision?: number | null;
  pdf_permissions_bits?: number | null;
  pdf_permissions_all_allowed?: boolean | number | null;
  pdf_opened_as?: DocumentPdfOpenedAs | null;
  security_probed_at?: number | null;
  doc_version: number;
  metadata_json: string | null;
  idempotency_key: string | null;
  failure_reason: string | null;
  thumbnail_state?: string | null;
  thumbnail_key?: string | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
}): DocumentRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    state: r.state,
    baseSha: r.base_sha,
    storageSizeBytes: r.storage_size_bytes,
    expectedSha256: r.expected_sha256 ?? null,
    expectedSizeBytes:
      r.expected_size_bytes === null || r.expected_size_bytes === undefined
        ? null
        : Number(r.expected_size_bytes),
    uploadKind: r.upload_kind ?? null,
    uploadExpiresAt:
      r.upload_expires_at === null || r.upload_expires_at === undefined
        ? null
        : Number(r.upload_expires_at),
    security: {
      encryptionState: r.encryption_state ?? 'unknown',
      encryptionRequiresPassword: nullableBooleanFromDb(r.encryption_requires_password),
      securityHandlerRevision: r.security_handler_revision ?? null,
      pdfPermissionsBits: r.pdf_permissions_bits ?? null,
      pdfPermissionsAllAllowed: nullableBooleanFromDb(r.pdf_permissions_all_allowed),
      pdfOpenedAs: r.pdf_opened_as ?? null,
      securityProbedAt: r.security_probed_at ?? null,
    },
    docVersion: Number(r.doc_version),
    metadata: r.metadata_json ? (JSON.parse(r.metadata_json) as Record<string, unknown>) : null,
    idempotencyKey: r.idempotency_key,
    failureReason: r.failure_reason,
    thumbnailState: (r.thumbnail_state ?? 'pending') as DocumentThumbnailState,
    thumbnailKey: r.thumbnail_key ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

function nullableBool(value: boolean | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function nullableBooleanFromDb(value: boolean | number | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value !== 0 : value;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  // better-sqlite3 surfaces UNIQUE failures as
  // `SqliteError: UNIQUE constraint failed: documents.tenant_id, documents.idempotency_key`
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  if (e.message?.includes('UNIQUE constraint failed')) return true;
  // Postgres surfaces 23505 on unique violations.
  if (e.code === '23505') return true;
  return false;
}

function throwError(code: 'NotFound' | 'Forbidden', msg: string): never {
  const err = new Error(msg) as Error & { code: string };
  err.code = code;
  throw err;
}
