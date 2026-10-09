/**
 * Object numbers handed to editing sessions (migration 032): the layer's
 * counter, the sessions, and the blocks of numbers they hold. Every write
 * that moves a number between owners is a compare-and-swap on the owner it
 * read, so two replicas never hand out one number twice, with no row locks
 * (SQLite has none).
 */
import { sql, type Kysely, type Transaction } from 'kysely';

import type { ObjectNumberBlock } from '../../services/objectNumberBlocks';
import { OBJECT_NUMBER_BLOCK_SIZE } from '../../services/objectNumberBlocks';
import type { Database as Schema } from '../schema';

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

export interface EditSessionRow {
  sub: string;
  expiresAt: number;
  createdAt: number;
}

/** A block and who holds it: a session, or nobody (`null`). */
export interface OwnedObjectNumberBlock extends ObjectNumberBlock {
  readonly sessionId: string | null;
}

export class ObjectNumbersRepo {
  // ── the counter ────────────────────────────────────────────────────────────

  /** The layer's counter: every number below it was handed out. `null` until first needed. */
  async counter(executor: DbExecutor, layerId: string): Promise<number | null> {
    const row = await executor
      .selectFrom('layers')
      .select('next_object_number')
      .where('id', '=', layerId)
      .executeTakeFirst();
    return row?.next_object_number == null ? null : Number(row.next_object_number);
  }

  /** Start the counter at `next`, unless another request started it first. */
  async startCounter(executor: DbExecutor, layerId: string, next: number): Promise<void> {
    await executor
      .updateTable('layers')
      .set({ next_object_number: next })
      .where('id', '=', layerId)
      .where('next_object_number', 'is', null)
      .execute();
  }

  /** Move the counter up by `count`; returns the first of the numbers passed. */
  async advanceCounter(executor: DbExecutor, layerId: string, count: number): Promise<number> {
    const row = await executor
      .updateTable('layers')
      .set({ next_object_number: sql`next_object_number + ${count}` })
      .where('id', '=', layerId)
      .returning('next_object_number')
      .executeTakeFirstOrThrow();
    return Number(row.next_object_number) - count;
  }

  /** Set the counter to `to` if it still is `from`; `false` when it moved meanwhile. */
  async lowerCounter(
    executor: DbExecutor,
    layerId: string,
    from: number,
    to: number,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('layers')
      .set({ next_object_number: to })
      .where('id', '=', layerId)
      .where('next_object_number', '=', from)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /**
   * Take the layer row's lock if it is still on base version `baseSha`:
   * `false` once a publish moved it to another one (its numbers count anew).
   * Writes on that row wait for the caller's transaction.
   */
  async lockLayerOnBase(
    executor: DbExecutor,
    layerId: string,
    baseSha: string | null,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('layers')
      .set({ next_object_number: sql`next_object_number` })
      .where('id', '=', layerId)
      .where((eb) => (baseSha === null ? eb('base_sha', 'is', null) : eb('base_sha', '=', baseSha)))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Raise the counter to at least `atLeast`. */
  async raiseCounter(executor: DbExecutor, layerId: string, atLeast: number): Promise<void> {
    await executor
      .updateTable('layers')
      .set({ next_object_number: atLeast })
      .where('id', '=', layerId)
      .where((eb) =>
        eb.or([eb('next_object_number', 'is', null), eb('next_object_number', '<', atLeast)]),
      )
      .execute();
  }

  // ── sessions ───────────────────────────────────────────────────────────────

  async findSession(
    executor: DbExecutor,
    layerId: string,
    sessionId: string,
  ): Promise<EditSessionRow | null> {
    const row = await executor
      .selectFrom('edit_sessions')
      .select(['sub', 'expires_at', 'created_at'])
      .where('layer_id', '=', layerId)
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    return row
      ? { sub: row.sub, expiresAt: Number(row.expires_at), createdAt: Number(row.created_at) }
      : null;
  }

  /** `false` when the session already exists (another request made it). */
  async insertSession(
    executor: DbExecutor,
    input: {
      layerId: string;
      sessionId: string;
      sub: string;
      expiresAt: number;
      createdAt: number;
    },
  ): Promise<boolean> {
    const rows = await executor
      .insertInto('edit_sessions')
      .values({
        layer_id: input.layerId,
        session_id: input.sessionId,
        sub: input.sub,
        expires_at: input.expiresAt,
        created_at: input.createdAt,
      })
      .onConflict((oc) => oc.columns(['layer_id', 'session_id']).doNothing())
      .returning('session_id')
      .execute();
    return rows.length === 1;
  }

  /** Move the session's expiry to `expiresAt`, for its own subject only. */
  async extendSession(
    executor: DbExecutor,
    layerId: string,
    sessionId: string,
    sub: string,
    expiresAt: number,
  ): Promise<void> {
    await executor
      .updateTable('edit_sessions')
      .set({ expires_at: expiresAt })
      .where('layer_id', '=', layerId)
      .where('session_id', '=', sessionId)
      .where('sub', '=', sub)
      .where('expires_at', '<', expiresAt)
      .execute();
  }

  /** Delete up to `limit` sessions that expired and hold no block. */
  async deleteIdleExpiredSessions(
    executor: DbExecutor,
    layerId: string,
    now: number,
    limit: number,
  ): Promise<void> {
    const idle = await executor
      .selectFrom('edit_sessions as s')
      .select('s.session_id')
      .where('s.layer_id', '=', layerId)
      .where('s.expires_at', '<', now)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('object_number_blocks as b')
              .select('b.first')
              .whereRef('b.layer_id', '=', 's.layer_id')
              .whereRef('b.session_id', '=', 's.session_id'),
          ),
        ),
      )
      .limit(limit)
      .execute();
    if (idle.length === 0) return;
    await executor
      .deleteFrom('edit_sessions')
      .where('layer_id', '=', layerId)
      .where(
        'session_id',
        'in',
        idle.map((row) => row.session_id),
      )
      .where('expires_at', '<', now)
      .execute();
  }

  // ── blocks ─────────────────────────────────────────────────────────────────

  /** The blocks a session holds, in number order. */
  async blocksOf(
    executor: DbExecutor,
    layerId: string,
    sessionId: string,
  ): Promise<ObjectNumberBlock[]> {
    const rows = await executor
      .selectFrom('object_number_blocks')
      .select(['first', 'available'])
      .where('layer_id', '=', layerId)
      .where('session_id', '=', sessionId)
      .orderBy('first')
      .execute();
    return rows.map((row) => ({ first: Number(row.first), available: Number(row.available) }));
  }

  /**
   * A block another session may take over: one a write returned (no
   * owner) first, then one of the session that expired first. `null` when
   * there is none. Both lookups follow an index, so neither grows with the
   * layer's live sessions. (A session row goes only once it holds no
   * block, so every owned block has its session.)
   */
  async reclaimable(
    executor: DbExecutor,
    layerId: string,
    now: number,
  ): Promise<OwnedObjectNumberBlock | null> {
    const unowned = await executor
      .selectFrom('object_number_blocks')
      .select(['first', 'available'])
      .where('layer_id', '=', layerId)
      .where('session_id', 'is', null)
      .orderBy('first')
      .limit(1)
      .executeTakeFirst();
    if (unowned) {
      return {
        first: Number(unowned.first),
        available: Number(unowned.available),
        sessionId: null,
      };
    }
    const expired = await executor
      .selectFrom('edit_sessions as s')
      .innerJoin('object_number_blocks as b', (join) =>
        join.onRef('b.layer_id', '=', 's.layer_id').onRef('b.session_id', '=', 's.session_id'),
      )
      .select(['b.first', 'b.available', 'b.session_id'])
      .where('s.layer_id', '=', layerId)
      .where('s.expires_at', '<', now)
      .orderBy('s.expires_at')
      .orderBy('b.first')
      .limit(1)
      .executeTakeFirst();
    return expired
      ? {
          first: Number(expired.first),
          available: Number(expired.available),
          sessionId: expired.session_id,
        }
      : null;
  }

  /**
   * Give a block to `to`, if `from` (the owner read with it) still holds it:
   * `false` when someone else took it meanwhile.
   */
  async claimBlock(
    executor: DbExecutor,
    layerId: string,
    first: number,
    from: string | null,
    to: string,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_blocks')
      .set({ session_id: to })
      .where('layer_id', '=', layerId)
      .where('first', '=', first)
      .where((eb) => (from === null ? eb('session_id', 'is', null) : eb('session_id', '=', from)))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Store fresh blocks, held by `sessionId` or by nobody (`null`). */
  async insertBlocks(
    executor: DbExecutor,
    layerId: string,
    blocks: readonly ObjectNumberBlock[],
    sessionId: string | null,
  ): Promise<void> {
    if (blocks.length === 0) return;
    await executor
      .insertInto('object_number_blocks')
      .values(
        blocks.map((block) => ({
          layer_id: layerId,
          first: block.first,
          available: block.available,
          session_id: sessionId,
        })),
      )
      .execute();
  }

  /**
   * The block `number` falls in, whoever holds it, or `null`. Blocks differ
   * in size, so several may start within 32 below `number`: only the last
   * of them can hold it (a later block never starts inside an earlier one's
   * numbers, as each number is handed out once).
   */
  async blockHolding(
    executor: DbExecutor,
    layerId: string,
    number: number,
  ): Promise<OwnedObjectNumberBlock | null> {
    const row = await executor
      .selectFrom('object_number_blocks')
      .select(['first', 'available', 'session_id'])
      .where('layer_id', '=', layerId)
      .where('first', '<=', number)
      .where('first', '>', number - OBJECT_NUMBER_BLOCK_SIZE)
      .orderBy('first', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row
      ? { first: Number(row.first), available: Number(row.available), sessionId: row.session_id }
      : null;
  }

  /**
   * Clear the bits of `mask` in the block at `first`, if `sessionId` still
   * holds it and every one of them is still set: `false` otherwise.
   */
  async spend(
    executor: DbExecutor,
    layerId: string,
    first: number,
    sessionId: string,
    mask: number,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_blocks')
      .set({ available: sql`available - ${mask}` })
      .where('layer_id', '=', layerId)
      .where('first', '=', first)
      .where('session_id', '=', sessionId)
      .where(sql<boolean>`(available & ${mask}) = ${mask}`)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Delete those of the blocks at `firsts` that have nothing left in them. */
  async deleteEmptyBlocks(
    executor: DbExecutor,
    layerId: string,
    firsts: readonly number[],
  ): Promise<void> {
    if (firsts.length === 0) return;
    await executor
      .deleteFrom('object_number_blocks')
      .where('layer_id', '=', layerId)
      .where('first', 'in', [...firsts])
      .where('available', '=', 0)
      .execute();
  }

  /** Delete every block of the layer (a publish numbers objects anew). */
  async deleteLayerBlocks(executor: DbExecutor, layerId: string): Promise<void> {
    await executor.deleteFrom('object_number_blocks').where('layer_id', '=', layerId).execute();
  }
}
