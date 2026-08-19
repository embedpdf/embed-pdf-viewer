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
import { randomBytes, randomUUID } from 'node:crypto';

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
  nextAttemptAt: number;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  lastError: string | null;
  requestedBy: string | null;
  via: string | null;
  /** Sanitized wire descriptor for re-drivable async jobs; null for sync provenance rows. */
  sourceJson: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Enqueue input for an ASYNC import job (connection sources only). */
export interface ImportJobEnqueue extends ImportAttemptStart {
  /** JSON of the (sanitized) wire descriptor the worker re-drives from. */
  sourceJson: string;
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
        source_json: null,
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
    return this.mapRow(r);
  }

  private mapRow(r: Schema['document_imports']): DocumentImportRow {
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
      nextAttemptAt: r.next_attempt_at,
      leaseOwner: r.lease_owner,
      leaseToken: r.lease_token,
      leaseExpiresAt: r.lease_expires_at,
      lastError: r.last_error,
      requestedBy: r.requested_by,
      via: r.via,
      sourceJson: r.source_json,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Enqueue (or re-arm) the async job for a document. Two-step by
   * design — callers run it inside the doc-creation transaction for
   * the atomic create path, and standalone for resume-onto-existing:
   *   - no row            -> insert queued
   *   - running, live lease -> leave untouched ('already-running')
   *   - anything else     -> re-arm to queued NOW with fresh source
   * Attempts are cumulative across re-arms; the CLAIM increments them.
   */
  async enqueue(input: ImportJobEnqueue): Promise<'queued' | 'already-running'> {
    const now = Date.now();
    const existing = await this.db
      .selectFrom('document_imports')
      .select(['id', 'state', 'lease_expires_at'])
      .where('doc_id', '=', input.docId)
      .where('tenant_id', '=', input.tenantId)
      .executeTakeFirst();
    if (!existing) {
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
          state: 'queued',
          attempts: 0,
          max_attempts: 5,
          next_attempt_at: now,
          lease_owner: null,
          lease_token: null,
          lease_expires_at: null,
          last_error: null,
          requested_by: input.requestedBy,
          via: input.via,
          source_json: input.sourceJson,
          created_at: now,
          updated_at: now,
        })
        .execute();
      return 'queued';
    }
    if (existing.state === 'running' && (existing.lease_expires_at ?? 0) > now) {
      return 'already-running';
    }
    await this.db
      .updateTable('document_imports')
      .set({
        source_kind: input.sourceKind,
        connection_id: input.connectionId,
        source_location: input.sourceLocation,
        requested_revision: input.requestedRevision,
        expected_sha256: input.expectedSha256,
        expected_size_bytes: input.expectedSizeBytes,
        state: 'queued',
        next_attempt_at: now,
        lease_owner: null,
        lease_token: null,
        lease_expires_at: null,
        requested_by: input.requestedBy,
        via: input.via,
        source_json: input.sourceJson,
        updated_at: now,
      })
      .where('id', '=', existing.id)
      .execute();
    return 'queued';
  }

  /**
   * Atomically claim the next runnable job: queued-and-due, or
   * running with an EXPIRED lease (crashed worker). The UPDATE's
   * outer guard re-checks the claim conditions so two replicas racing
   * the same subquery id cannot both win — the loser matches zero
   * rows. Dialect-portable (no SKIP LOCKED needed at this contention
   * level); the claim mints the fencing token and increments the
   * attempt counter.
   */
  async claimNext(owner: string, leaseMs: number): Promise<DocumentImportRow | null> {
    const now = Date.now();
    const token = randomUUID();
    const r = await this.db
      .updateTable('document_imports')
      .set({
        state: 'running',
        lease_owner: owner,
        lease_token: token,
        lease_expires_at: now + leaseMs,
        attempts: (eb) => eb('document_imports.attempts', '+', 1),
        updated_at: now,
      })
      .where('id', '=', (eb) =>
        eb
          .selectFrom('document_imports')
          .select('id')
          .where((web) =>
            web.or([
              web.and([web('state', '=', 'queued'), web('next_attempt_at', '<=', now)]),
              web.and([
                web('state', '=', 'running'),
                web('lease_expires_at', 'is not', null),
                web('lease_expires_at', '<', now),
              ]),
            ]),
          )
          .orderBy('next_attempt_at')
          .limit(1),
      )
      .where((eb) =>
        eb.or([
          eb.and([eb('state', '=', 'queued'), eb('next_attempt_at', '<=', now)]),
          eb.and([
            eb('state', '=', 'running'),
            eb('lease_expires_at', 'is not', null),
            eb('lease_expires_at', '<', now),
          ]),
        ]),
      )
      .returningAll()
      .executeTakeFirst();
    if (!r) return null;
    return this.mapRow(r);
  }

  /** Fenced: persist the revision observed on the first successful open. */
  async recordResolvedRevision(id: string, leaseToken: string, revision: string): Promise<boolean> {
    const res = await this.db
      .updateTable('document_imports')
      .set({ resolved_revision: revision, updated_at: Date.now() })
      .where('id', '=', id)
      .where('state', '=', 'running')
      .where('lease_token', '=', leaseToken)
      .execute();
    return Number(res[0]?.numUpdatedRows ?? 0) > 0;
  }

  /** Fenced terminal success. A stale lease holder cannot overwrite its replacement. */
  async succeed(
    id: string,
    leaseToken: string,
    outcome: { resolvedRevision: string | null; sourceKind?: string; sourceLocation?: string },
  ): Promise<boolean> {
    const res = await this.db
      .updateTable('document_imports')
      .set({
        state: 'succeeded',
        resolved_revision: outcome.resolvedRevision,
        ...(outcome.sourceKind ? { source_kind: outcome.sourceKind } : {}),
        ...(outcome.sourceLocation ? { source_location: outcome.sourceLocation } : {}),
        last_error: null,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .where('state', '=', 'running')
      .where('lease_token', '=', leaseToken)
      .execute();
    return Number(res[0]?.numUpdatedRows ?? 0) > 0;
  }

  /** Fenced retry scheduling with backoff. */
  async retryLater(
    id: string,
    leaseToken: string,
    lastError: string,
    nextAttemptAt: number,
  ): Promise<boolean> {
    const res = await this.db
      .updateTable('document_imports')
      .set({
        state: 'queued',
        next_attempt_at: nextAttemptAt,
        lease_owner: null,
        lease_token: null,
        lease_expires_at: null,
        last_error: lastError.slice(0, 500),
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .where('state', '=', 'running')
      .where('lease_token', '=', leaseToken)
      .execute();
    return Number(res[0]?.numUpdatedRows ?? 0) > 0;
  }

  /** Fenced terminal failure. */
  async failJob(id: string, leaseToken: string, lastError: string): Promise<boolean> {
    const res = await this.db
      .updateTable('document_imports')
      .set({ state: 'failed', last_error: lastError.slice(0, 500), updated_at: Date.now() })
      .where('id', '=', id)
      .where('state', '=', 'running')
      .where('lease_token', '=', leaseToken)
      .execute();
    return Number(res[0]?.numUpdatedRows ?? 0) > 0;
  }

  async deleteByDoc(docId: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom('document_imports')
      .where('doc_id', '=', docId)
      .where('tenant_id', '=', tenantId)
      .execute();
  }
}
