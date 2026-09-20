/**
 * Durable signings (migration 030): one row per `prepare`, living
 * through `complete`, `abort` or expiry. The row is the truth the
 * lifecycle is enforced by — a second prepare on a layer with a pending
 * row fails the partial unique index, a completion claims the row under
 * its expiry predicate before it publishes anything, and the sweeper
 * expires what nobody finished.
 */
import type { Kysely, Transaction } from 'kysely';

import type { Database as Schema, DocumentSigningState, DocumentSigningsTable } from '../schema';

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

export interface SigningRow {
  id: string;
  tenantId: string;
  docId: string;
  layerId: string;
  layerName: string;
  state: DocumentSigningState;
  expectedBaseSha: string;
  expectedLayerVersion: number;
  baseByteLength: number;
  tailKey: string;
  tailSha: string;
  tailSize: number;
  fieldObjectNumber: number;
  preparedJson: string;
  cmsSha256: string | null;
  resultJson: string | null;
  resultSha: string | null;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  finishedAt: number | null;
}

export interface InsertPreparedSigning {
  id: string;
  tenantId: string;
  docId: string;
  layerId: string;
  layerName: string;
  expectedBaseSha: string;
  expectedLayerVersion: number;
  baseByteLength: number;
  tailKey: string;
  tailSha: string;
  tailSize: number;
  fieldObjectNumber: number;
  preparedJson: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
}

export interface SigningUpdate {
  cmsSha256: string | null;
  resultJson: string | null;
  resultSha: string | null;
  finishedAt: number | null;
}

export class DocumentSigningsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async find(id: string, executor: DbExecutor = this.db): Promise<SigningRow | null> {
    const row = await executor
      .selectFrom('document_signings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  /** The one pending signing of a layer, if any. */
  async findPending(layerId: string, executor: DbExecutor = this.db): Promise<SigningRow | null> {
    const row = await executor
      .selectFrom('document_signings')
      .selectAll()
      .where('layer_id', '=', layerId)
      .where('state', '=', 'prepared')
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  /**
   * Inside the prepare transaction, beside the layer's fenced version
   * bump. A pending row on the layer makes this fail the partial unique
   * index — the caller maps that to `SigningPending`.
   */
  async insertPrepared(
    trx: Transaction<Schema>,
    input: InsertPreparedSigning,
  ): Promise<SigningRow> {
    const values: DocumentSigningsTable = {
      id: input.id,
      tenant_id: input.tenantId,
      doc_id: input.docId,
      layer_id: input.layerId,
      layer_name: input.layerName,
      state: 'prepared',
      expected_base_sha: input.expectedBaseSha,
      expected_layer_version: input.expectedLayerVersion,
      base_byte_length: input.baseByteLength,
      tail_key: input.tailKey,
      tail_sha: input.tailSha,
      tail_size: input.tailSize,
      field_object_number: input.fieldObjectNumber,
      prepared_json: input.preparedJson,
      cms_sha256: null,
      result_json: null,
      result_sha: null,
      created_by: input.createdBy,
      created_at: input.createdAt,
      expires_at: input.expiresAt,
      finished_at: null,
    };
    await trx.insertInto('document_signings').values(values).execute();
    return mapRow(values);
  }

  /**
   * A state transition guarded by the state it leaves: `false` when the
   * row was not in `from` (or, with `notExpiredAt`, had already expired).
   * The completion's claim is `transition(trx, id, 'prepared', 'completed', …,
   * { notExpiredAt: now })` — whoever gets `true` owns the publish.
   */
  async transition(
    executor: DbExecutor,
    id: string,
    from: DocumentSigningState,
    to: DocumentSigningState,
    set: Partial<SigningUpdate> = {},
    opts: { notExpiredAt?: number } = {},
  ): Promise<boolean> {
    let query = executor
      .updateTable('document_signings')
      .set({
        state: to,
        ...(set.cmsSha256 !== undefined ? { cms_sha256: set.cmsSha256 } : {}),
        ...(set.resultJson !== undefined ? { result_json: set.resultJson } : {}),
        ...(set.resultSha !== undefined ? { result_sha: set.resultSha } : {}),
        ...(set.finishedAt !== undefined ? { finished_at: set.finishedAt } : {}),
      })
      .where('id', '=', id)
      .where('state', '=', from);
    if (opts.notExpiredAt !== undefined) {
      query = query.where('expires_at', '>', opts.notExpiredAt);
    }
    const result = await query.executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) === 1;
  }

  /**
   * Expire every pending signing past its deadline; returns what the
   * sweeper must delete from object storage. Claims are per row, so
   * replicas sweeping together each expire a disjoint set.
   */
  async expireDue(
    now: number,
    executor: DbExecutor = this.db,
  ): Promise<Array<{ id: string; tailKey: string }>> {
    const due = await executor
      .selectFrom('document_signings')
      .select(['id', 'tail_key'])
      .where('state', '=', 'prepared')
      .where('expires_at', '<=', now)
      .execute();
    const expired: Array<{ id: string; tailKey: string }> = [];
    for (const row of due) {
      const claimed = await this.transition(executor, row.id, 'prepared', 'expired', {
        finishedAt: now,
      });
      if (claimed) expired.push({ id: row.id, tailKey: row.tail_key });
    }
    return expired;
  }

  /** Newest first, for the document's version listing and audit views. */
  async listForDocument(
    docId: string,
    limit = 50,
    executor: DbExecutor = this.db,
  ): Promise<SigningRow[]> {
    const rows = await executor
      .selectFrom('document_signings')
      .selectAll()
      .where('doc_id', '=', docId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map(mapRow);
  }
}

function mapRow(row: DocumentSigningsTable): SigningRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    docId: row.doc_id,
    layerId: row.layer_id,
    layerName: row.layer_name,
    state: row.state,
    expectedBaseSha: row.expected_base_sha,
    expectedLayerVersion: Number(row.expected_layer_version),
    baseByteLength: Number(row.base_byte_length),
    tailKey: row.tail_key,
    tailSha: row.tail_sha,
    tailSize: Number(row.tail_size),
    fieldObjectNumber: Number(row.field_object_number),
    preparedJson: row.prepared_json,
    cmsSha256: row.cms_sha256,
    resultJson: row.result_json,
    resultSha: row.result_sha,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
  };
}
