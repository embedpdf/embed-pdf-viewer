/**
 * Import provenance (and, in phase 3b, the async job queue).
 *
 * One row per document, upserted on doc_id: the row is "the latest
 * import status for this document", not an append-only log. Sync
 * imports write running -> succeeded | failed; a retryable sync
 * failure records `failed` + last_error here while the DOCUMENT stays
 * pending (doc state is the lifecycle truth; this row is the attempt
 * outcome). Rows die with their document via the delete cascade.
 */
import { randomBytes } from 'node:crypto';

import type { Kysely } from 'kysely';

import type { Database as Schema } from '../schema';

export interface ImportAttemptStart {
  docId: string;
  tenantId: string;
  /** 'url' | 'connection' from the wire (enriched to the provider kind on success). */
  sourceKind: string;
  connectionId: string | null;
  /** Sanitized — never a URL query string. */
  sourceLocation: string;
  requestedRevision: string | null;
  expectedSha256: string | null;
  expectedSizeBytes: number | null;
  requestedBy: string | null;
  via: string | null;
}

export interface DocumentImportRow {
  id: string;
  tenantId: string;
  docId: string;
  sourceKind: string;
  connectionId: string | null;
  sourceLocation: string;
  requestedRevision: string | null;
  resolvedRevision: string | null;
  expectedSha256: string | null;
  expectedSizeBytes: number | null;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  requestedBy: string | null;
  via: string | null;
  createdAt: number;
  updatedAt: number;
}

export class DocumentImportsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async recordAttemptStart(input: ImportAttemptStart): Promise<void> {
    const now = Date.now();
    await this.db
      .insertInto('document_imports')
      .values({
        id: `imp_${randomBytes(9).toString('hex')}`,
        tenant_id: input.tenantId,
        doc_id: input.docId,
        source_kind: input.sourceKind,
        connection_id: input.connectionId,
        source_location: input.sourceLocation,
        requested_revision: input.requestedRevision,
        resolved_revision: null,
        expected_sha256: input.expectedSha256,
        expected_size_bytes: input.expectedSizeBytes,
        state: 'running',
        attempts: 1,
        max_attempts: 5,
        next_attempt_at: now,
        lease_owner: null,
        lease_token: null,
        lease_expires_at: null,
        last_error: null,
        requested_by: input.requestedBy,
        via: input.via,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('doc_id').doUpdateSet({
          source_kind: input.sourceKind,
          connection_id: input.connectionId,
          source_location: input.sourceLocation,
          requested_revision: input.requestedRevision,
          expected_sha256: input.expectedSha256,
          expected_size_bytes: input.expectedSizeBytes,
          state: 'running',
          attempts: (eb) => eb('document_imports.attempts', '+', 1),
          next_attempt_at: now,
          last_error: null,
          requested_by: input.requestedBy,
          via: input.via,
          updated_at: now,
        }),
      )
      .execute();
  }

  async recordSuccess(
    docId: string,
    tenantId: string,
    outcome: { resolvedRevision: string | null; sourceKind?: string; sourceLocation?: string },
  ): Promise<void> {
    await this.db
      .updateTable('document_imports')
      .set({
        state: 'succeeded',
        resolved_revision: outcome.resolvedRevision,
        ...(outcome.sourceKind ? { source_kind: outcome.sourceKind } : {}),
        ...(outcome.sourceLocation ? { source_location: outcome.sourceLocation } : {}),
        last_error: null,
        updated_at: Date.now(),
      })
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  async recordFailure(docId: string, tenantId: string, lastError: string): Promise<void> {
    await this.db
      .updateTable('document_imports')
      .set({ state: 'failed', last_error: lastError.slice(0, 500), updated_at: Date.now() })
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }

  async findByDoc(docId: string, tenantId: string): Promise<DocumentImportRow | null> {
    const r = await this.db
      .selectFrom('document_imports')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!r) return null;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      docId: r.doc_id,
      sourceKind: r.source_kind,
      connectionId: r.connection_id,
      sourceLocation: r.source_location,
      requestedRevision: r.requested_revision,
      resolvedRevision: r.resolved_revision,
      expectedSha256: r.expected_sha256,
      expectedSizeBytes: r.expected_size_bytes,
      state: r.state,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      lastError: r.last_error,
      requestedBy: r.requested_by,
      via: r.via,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async deleteByDoc(docId: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom('document_imports')
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}
