import type { Kysely, Transaction } from 'kysely';

import type { ChangeOutcomeStatus, Database as Schema } from '../schema';

/** What one change answered, under its opId (see `ChangeOutcomesTable`). */
export interface ChangeOutcomeRow {
  layerId: string;
  opId: string;
  payloadHash: string;
  status: ChangeOutcomeStatus;
  /** The answer as the client got it. */
  response: unknown;
  actor: string;
  auditId: number | null;
  /** The recorded reverse, packed (`packChangeRecord`), while it can be undone. */
  reverse: string | null;
  captureKey: string | null;
  createdAt: number;
  expiresAt: number;
}

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

export class ChangeOutcomesRepo {
  constructor(private readonly db: DbExecutor) {}

  /** The answers kept on a layer under any of `opIds`, by opId. */
  async findMany(
    layerId: string,
    opIds: readonly string[],
  ): Promise<Map<string, ChangeOutcomeRow>> {
    if (opIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('change_outcomes')
      .selectAll()
      .where('layer_id', '=', layerId)
      .where('op_id', 'in', [...opIds])
      .execute();
    return new Map(rows.map((row) => [row.op_id, mapRow(row)]));
  }

  async insert(row: ChangeOutcomeRow): Promise<void> {
    await this.db
      .insertInto('change_outcomes')
      .values({
        layer_id: row.layerId,
        op_id: row.opId,
        payload_hash: row.payloadHash,
        status: row.status,
        response: JSON.stringify(row.response),
        actor: row.actor,
        audit_id: row.auditId,
        reverse: row.reverse,
        capture_key: row.captureKey,
        created_at: row.createdAt,
        expires_at: row.expiresAt,
      })
      .execute();
  }

  /**
   * Answers still holding what undoes them though a final change on their
   * layer came after them (below its `undo_horizon`), at most `limit`: nothing
   * can undo them, so the sweeper drops their records and captures.
   */
  async findBelowHorizon(limit: number): Promise<ChangeOutcomeRow[]> {
    const rows = await this.db
      .selectFrom('change_outcomes as o')
      .innerJoin('layers as l', 'l.id', 'o.layer_id')
      .selectAll('o')
      .where('o.reverse', 'is not', null)
      .where('l.undo_horizon', 'is not', null)
      .whereRef('o.audit_id', '<', 'l.undo_horizon')
      .limit(limit)
      .execute();
    return rows.map(mapRow);
  }

  /** Forgets what undoes these changes: their answers stay, for retries. */
  async clearRecords(layerId: string, opIds: readonly string[]): Promise<void> {
    if (opIds.length === 0) return;
    await this.db
      .updateTable('change_outcomes')
      .set({ reverse: null, capture_key: null })
      .where('layer_id', '=', layerId)
      .where('op_id', 'in', [...opIds])
      .execute();
  }

  /**
   * Answers past their expiry, oldest first, at most `limit`: the sweeper
   * deletes them with their capture blobs.
   */
  async findExpired(now: number, limit: number): Promise<ChangeOutcomeRow[]> {
    const rows = await this.db
      .selectFrom('change_outcomes')
      .selectAll()
      .where('expires_at', '<', now)
      .orderBy('expires_at')
      .limit(limit)
      .execute();
    return rows.map(mapRow);
  }

  async delete(layerId: string, opIds: readonly string[]): Promise<void> {
    if (opIds.length === 0) return;
    await this.db
      .deleteFrom('change_outcomes')
      .where('layer_id', '=', layerId)
      .where('op_id', 'in', [...opIds])
      .execute();
  }
}

type ChangeOutcomeDbRow = {
  layer_id: string;
  op_id: string;
  payload_hash: string;
  status: ChangeOutcomeStatus;
  response: string;
  actor: string;
  audit_id: number | null;
  reverse: string | null;
  capture_key: string | null;
  created_at: number;
  expires_at: number;
};

function mapRow(row: ChangeOutcomeDbRow): ChangeOutcomeRow {
  return {
    layerId: row.layer_id,
    opId: row.op_id,
    payloadHash: row.payload_hash,
    status: row.status,
    response: JSON.parse(row.response) as unknown,
    actor: row.actor,
    auditId: row.audit_id === null ? null : Number(row.audit_id),
    reverse: row.reverse,
    captureKey: row.capture_key,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  };
}
