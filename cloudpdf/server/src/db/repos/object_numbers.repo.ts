/**
 * Object numbers handed to editing sessions (migrations 032, 036): the
 * layer's counter, the sessions, and the blocks of numbers they hold, by the
 * layer's document and name (a layer nobody changed has no row). Every
 * write that moves a number between owners is a compare-and-swap on the
 * owner it read, so two replicas never hand out one number twice, with no
 * row locks (SQLite has none).
 */
import { sql, type ExpressionBuilder, type Kysely, type Transaction } from 'kysely';

import type { ObjectNumberBlock } from '../../services/objectNumberBlocks';
import { OBJECT_NUMBER_BLOCK_SIZE } from '../../services/objectNumberBlocks';
import type { Database as Schema } from '../schema';

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

/** The layer numbers are handed out on: its document and name. */
export interface NumberedLayer {
  readonly docId: string;
  readonly layerName: string;
}

export interface ObjectNumberCounter {
  /** Every number below it was handed out. */
  readonly next: number;
  /** The base version the numbers count on. */
  readonly baseSha: string | null;
}

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

  /** The layer's counter, or `null` until first needed. */
  async counter(executor: DbExecutor, layer: NumberedLayer): Promise<ObjectNumberCounter | null> {
    const row = await executor
      .selectFrom('object_number_counters')
      .select(['next_object_number', 'base_sha'])
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .executeTakeFirst();
    return row ? { next: Number(row.next_object_number), baseSha: row.base_sha } : null;
  }

  /** Start the counter at `next` on base version `baseSha`, unless another request started it first. */
  async startCounter(
    executor: DbExecutor,
    layer: NumberedLayer,
    baseSha: string | null,
    next: number,
  ): Promise<void> {
    await executor
      .insertInto('object_number_counters')
      .values({
        doc_id: layer.docId,
        layer_name: layer.layerName,
        base_sha: baseSha,
        next_object_number: next,
      })
      .onConflict((oc) => oc.columns(['doc_id', 'layer_name']).doNothing())
      .execute();
  }

  /**
   * Move the counter from base version `from` to `to`, if it still is on
   * `from`: `false` when another request moved it meanwhile.
   */
  async moveCounterToBase(
    executor: DbExecutor,
    layer: NumberedLayer,
    from: string | null,
    to: string | null,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_counters')
      .set({ base_sha: to })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where((eb) => (from === null ? eb('base_sha', 'is', null) : eb('base_sha', '=', from)))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Move the counter up by `count`; returns the first of the numbers passed. */
  async advanceCounter(executor: DbExecutor, layer: NumberedLayer, count: number): Promise<number> {
    const row = await executor
      .updateTable('object_number_counters')
      .set({ next_object_number: sql`next_object_number + ${count}` })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .returning('next_object_number')
      .executeTakeFirstOrThrow();
    return Number(row.next_object_number) - count;
  }

  /** Set the counter to `to` if it still is `from`; `false` when it moved meanwhile. */
  async lowerCounter(
    executor: DbExecutor,
    layer: NumberedLayer,
    from: number,
    to: number,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_counters')
      .set({ next_object_number: to })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('next_object_number', '=', from)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /**
   * Take the counter's lock if it still counts on base version `baseSha`:
   * `false` once a publish moved it to another one (its numbers count anew).
   * Writes on the counter wait for the caller's transaction.
   */
  async lockCounterOnBase(
    executor: DbExecutor,
    layer: NumberedLayer,
    baseSha: string | null,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_counters')
      .set({ next_object_number: sql`next_object_number` })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where((eb) => (baseSha === null ? eb('base_sha', 'is', null) : eb('base_sha', '=', baseSha)))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Raise the counter to at least `atLeast`. */
  async raiseCounter(executor: DbExecutor, layer: NumberedLayer, atLeast: number): Promise<void> {
    await executor
      .updateTable('object_number_counters')
      .set({ next_object_number: atLeast })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('next_object_number', '<', atLeast)
      .execute();
  }

  // ── sessions ───────────────────────────────────────────────────────────────

  async findSession(
    executor: DbExecutor,
    layer: NumberedLayer,
    sessionId: string,
  ): Promise<EditSessionRow | null> {
    const row = await executor
      .selectFrom('edit_sessions')
      .select(['sub', 'expires_at', 'created_at'])
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
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
      layer: NumberedLayer;
      sessionId: string;
      sub: string;
      expiresAt: number;
      createdAt: number;
    },
  ): Promise<boolean> {
    const rows = await executor
      .insertInto('edit_sessions')
      .values({
        doc_id: input.layer.docId,
        layer_name: input.layer.layerName,
        session_id: input.sessionId,
        sub: input.sub,
        expires_at: input.expiresAt,
        created_at: input.createdAt,
      })
      .onConflict((oc) => oc.columns(['doc_id', 'layer_name', 'session_id']).doNothing())
      .returning('session_id')
      .execute();
    return rows.length === 1;
  }

  /** Move the session's expiry to `expiresAt`, for its own subject only. */
  async extendSession(
    executor: DbExecutor,
    layer: NumberedLayer,
    sessionId: string,
    sub: string,
    expiresAt: number,
  ): Promise<void> {
    await executor
      .updateTable('edit_sessions')
      .set({ expires_at: expiresAt })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('session_id', '=', sessionId)
      .where('sub', '=', sub)
      .where('expires_at', '<', expiresAt)
      .execute();
  }

  /** Delete up to `limit` sessions that expired and hold no block. */
  async deleteIdleExpiredSessions(
    executor: DbExecutor,
    layer: NumberedLayer,
    now: number,
    limit: number,
  ): Promise<void> {
    const idle = await executor
      .selectFrom('edit_sessions as s')
      .select('s.session_id')
      .where('s.doc_id', '=', layer.docId)
      .where('s.layer_name', '=', layer.layerName)
      .where('s.expires_at', '<', now)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('object_number_blocks as b')
              .select('b.first')
              .whereRef('b.doc_id', '=', 's.doc_id')
              .whereRef('b.layer_name', '=', 's.layer_name')
              .whereRef('b.session_id', '=', 's.session_id'),
          ),
        ),
      )
      .limit(limit)
      .execute();
    if (idle.length === 0) return;
    await executor
      .deleteFrom('edit_sessions')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
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
    layer: NumberedLayer,
    sessionId: string,
  ): Promise<ObjectNumberBlock[]> {
    const rows = await executor
      .selectFrom('object_number_blocks')
      .select(['first', 'available'])
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
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
    layer: NumberedLayer,
    now: number,
  ): Promise<OwnedObjectNumberBlock | null> {
    const unowned = await executor
      .selectFrom('object_number_blocks')
      .select(['first', 'available'])
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
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
        join
          .onRef('b.doc_id', '=', 's.doc_id')
          .onRef('b.layer_name', '=', 's.layer_name')
          .onRef('b.session_id', '=', 's.session_id'),
      )
      .select(['b.first', 'b.available', 'b.session_id'])
      .where('s.doc_id', '=', layer.docId)
      .where('s.layer_name', '=', layer.layerName)
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
    layer: NumberedLayer,
    first: number,
    from: string | null,
    to: string,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_blocks')
      .set({ session_id: to })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('first', '=', first)
      .where((eb) => (from === null ? eb('session_id', 'is', null) : eb('session_id', '=', from)))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Store fresh blocks, held by `sessionId` or by nobody (`null`). */
  async insertBlocks(
    executor: DbExecutor,
    layer: NumberedLayer,
    blocks: readonly ObjectNumberBlock[],
    sessionId: string | null,
  ): Promise<void> {
    if (blocks.length === 0) return;
    await executor
      .insertInto('object_number_blocks')
      .values(
        blocks.map((block) => ({
          doc_id: layer.docId,
          layer_name: layer.layerName,
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
    layer: NumberedLayer,
    number: number,
  ): Promise<OwnedObjectNumberBlock | null> {
    const row = await executor
      .selectFrom('object_number_blocks')
      .select(['first', 'available', 'session_id'])
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
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
    layer: NumberedLayer,
    first: number,
    sessionId: string,
    mask: number,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('object_number_blocks')
      .set({ available: sql`available - ${mask}` })
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('first', '=', first)
      .where('session_id', '=', sessionId)
      .where(sql<boolean>`(available & ${mask}) = ${mask}`)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Delete those of the blocks at `firsts` that have nothing left in them. */
  async deleteEmptyBlocks(
    executor: DbExecutor,
    layer: NumberedLayer,
    firsts: readonly number[],
  ): Promise<void> {
    if (firsts.length === 0) return;
    await executor
      .deleteFrom('object_number_blocks')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('first', 'in', [...firsts])
      .where('available', '=', 0)
      .execute();
  }

  // ── layers nobody changed ──────────────────────────────────────────────────

  /**
   * Up to `limit` layers without a row (nobody changed them) that have an
   * editing session which expired before `before`, longest ago first.
   */
  async untouchedWithExpiredSessions(
    executor: DbExecutor,
    before: number,
    limit: number,
  ): Promise<NumberedLayer[]> {
    const rows = await executor
      .selectFrom('edit_sessions as s')
      .select(['s.doc_id', 's.layer_name'])
      .where('s.expires_at', '<', before)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('layers as l')
              .select('l.id')
              .whereRef('l.doc_id', '=', 's.doc_id')
              .whereRef('l.name', '=', 's.layer_name'),
          ),
        ),
      )
      .orderBy('s.expires_at')
      .limit(limit)
      .execute();
    const layers = new Map<string, NumberedLayer>();
    for (const row of rows) {
      layers.set(`${row.doc_id}::${row.layer_name}`, {
        docId: row.doc_id,
        layerName: row.layer_name,
      });
    }
    return [...layers.values()];
  }

  /**
   * Delete the layer's numbering (blocks, sessions, then the counter) while
   * it still has no row and no session alive since `before`: `false` when
   * the counter stayed. Each delete checks again, so a session or a write
   * that arrives meanwhile keeps what is left, and the counter goes last.
   */
  async deleteUntouchedNumbering(
    executor: DbExecutor,
    layer: NumberedLayer,
    before: number,
  ): Promise<boolean> {
    const layerRow = executor
      .selectFrom('layers')
      .select('id')
      .where('doc_id', '=', layer.docId)
      .where('name', '=', layer.layerName);
    const liveSession = executor
      .selectFrom('edit_sessions')
      .select('session_id')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where('expires_at', '>=', before);
    const untouched = <TB extends keyof Schema>({
      and,
      not,
      exists,
    }: ExpressionBuilder<Schema, TB>) => and([not(exists(layerRow)), not(exists(liveSession))]);
    await executor
      .deleteFrom('object_number_blocks')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where(untouched)
      .execute();
    await executor
      .deleteFrom('edit_sessions')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where(untouched)
      .execute();
    const result = await executor
      .deleteFrom('object_number_counters')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .where(untouched)
      .executeTakeFirst();
    return Number(result.numDeletedRows) === 1;
  }

  /** Delete the layer's numbering: its blocks, sessions and counter (the layer was deleted). */
  async deleteNumbering(executor: DbExecutor, layer: NumberedLayer): Promise<void> {
    for (const table of [
      'object_number_blocks',
      'edit_sessions',
      'object_number_counters',
    ] as const) {
      await executor
        .deleteFrom(table)
        .where('doc_id', '=', layer.docId)
        .where('layer_name', '=', layer.layerName)
        .execute();
    }
  }

  /** Delete every block of the layer (a publish numbers objects anew). */
  async deleteLayerBlocks(executor: DbExecutor, layer: NumberedLayer): Promise<void> {
    await executor
      .deleteFrom('object_number_blocks')
      .where('doc_id', '=', layer.docId)
      .where('layer_name', '=', layer.layerName)
      .execute();
  }
}
