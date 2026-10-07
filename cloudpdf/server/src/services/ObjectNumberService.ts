/**
 * Object numbers handed to editing sessions: names for objects a client
 * creates, final before the create reaches the server.
 *
 * - **One counter per layer** (`layers.next_object_number`): every number
 *   below it was handed out, to a session or to a write. It only moves up,
 *   except that a write gives back what it didn't use while nobody took
 *   numbers after it.
 * - **Sessions hold blocks** of up to 32 numbers. A session lives while its
 *   expiry keeps moving; once it expires, the next session that needs
 *   numbers takes its blocks over, as it takes the blocks writes returned.
 *   Only what those don't cover comes from the counter.
 * - **A write takes a range** for the objects the engine makes for itself
 *   (appearance streams, fonts): numbers no session holds, from the counter.
 *   When it ends, the part it didn't use goes back.
 *
 * Every step is a conditional write on what it read, so replicas never hand
 * out one number twice, and nothing here takes a row lock.
 */
import {
  EngineError,
  EngineErrorCode,
  OBJECT_NUMBER_CEILING,
  OBJECT_NUMBER_ISSUE_LIMIT,
  type ObjectNumberRange,
} from '@embedpdf/engine-core/runtime';
import type { Kysely, Transaction } from 'kysely';

import {
  bitCount,
  blocksFor,
  hasBit,
  maskOf,
  numbersOf,
  OBJECT_NUMBER_BLOCK_SIZE,
  rangesOf,
} from './objectNumberBlocks';
import { ObjectNumbersRepo } from '../db/repos/object_numbers.repo';
import type { Database as Schema } from '../db/schema';

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

/** How long an editing session lives without a sign of life. */
export const EDIT_SESSION_LIFETIME_MS = 15 * 60_000;
/** How many numbers a new editing session gets. */
export const FIRST_OBJECT_NUMBERS = 8;
/** The most a write response tops a session up by. */
export const MAX_OBJECT_NUMBER_TOP_UP = 32;
/** The most one bulk reservation hands out. */
export const MAX_OBJECT_NUMBER_RESERVATION = 1_000;
/** Expired sessions without blocks a single issue tidies away. */
const TIDY_LIMIT = 16;

/** Who acts: an engine instance's session on a layer, for one token subject. */
export interface EditSessionKey {
  readonly layerId: string;
  readonly sessionId: string;
  readonly sub: string;
}

/** What a request did to its session. */
export type EditSessionState = 'new' | 'revived' | 'live';

/**
 * Numbers a write took from the counter: `floor` up to, not including,
 * `end`, on the layer's base version `baseSha` (a publish numbers anew).
 */
export interface WriteObjectNumberRange {
  readonly floor: number;
  readonly end: number;
  readonly baseSha: string | null;
}

export interface ObjectNumberServiceOptions {
  db: Kysely<Schema>;
  /** The clock sessions expire by. */
  now?: () => number;
  sessionLifetimeMs?: number;
}

export class ObjectNumberService {
  private readonly db: Kysely<Schema>;
  private readonly now: () => number;
  private readonly lifetimeMs: number;
  private readonly repo = new ObjectNumbersRepo();

  constructor(opts: ObjectNumberServiceOptions) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
    this.lifetimeMs = opts.sessionLifetimeMs ?? EDIT_SESSION_LIFETIME_MS;
  }

  // ── the counter ──────────────────────────────────────────────────────────

  /**
   * Start the layer's counter, once, past `lastObjectNumber`: what the engine
   * reports when it opens the layer, its base and its stored changes
   * together. Later reports change nothing.
   */
  async startCounter(
    executor: DbExecutor,
    layerId: string,
    lastObjectNumber: number,
  ): Promise<void> {
    await this.repo.startCounter(executor, layerId, lastObjectNumber + 1);
  }

  /** Whether the layer's counter started: numbers can be handed out. */
  async hasCounter(executor: DbExecutor, layerId: string): Promise<boolean> {
    return (await this.repo.counter(executor, layerId)) !== null;
  }

  // ── sessions ─────────────────────────────────────────────────────────────

  /**
   * Make, revive or keep alive the session. Its expiry moves only when less
   * than half its lifetime is left: one write about every 7 minutes. A
   * session id another subject made is refused.
   */
  async touchSession(
    executor: DbExecutor,
    key: EditSessionKey,
  ): Promise<{ state: EditSessionState; expiresIn: number }> {
    const now = this.now();
    const expiresAt = now + this.lifetimeMs;
    let session = await this.repo.findSession(executor, key.layerId, key.sessionId);
    if (!session) {
      const made = await this.repo.insertSession(executor, {
        layerId: key.layerId,
        sessionId: key.sessionId,
        sub: key.sub,
        expiresAt,
        createdAt: now,
      });
      if (made) return { state: 'new', expiresIn: this.lifetimeMs };
      session = await this.repo.findSession(executor, key.layerId, key.sessionId);
      if (!session) throw new EngineError(EngineErrorCode.Unknown, 'edit session vanished');
    }
    if (session.sub !== key.sub) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        'this engine session belongs to another user',
      );
    }
    const revived = session.expiresAt <= now;
    if (revived || session.expiresAt - now < this.lifetimeMs / 2) {
      await this.repo.extendSession(executor, key.layerId, key.sessionId, key.sub, expiresAt);
      return { state: revived ? 'revived' : 'live', expiresIn: this.lifetimeMs };
    }
    return { state: 'live', expiresIn: session.expiresAt - now };
  }

  /** The session's state without changing it, or `null` when it doesn't exist. */
  async findSession(
    executor: DbExecutor,
    key: EditSessionKey,
  ): Promise<{ expiresIn: number } | null> {
    const session = await this.repo.findSession(executor, key.layerId, key.sessionId);
    if (!session || session.sub !== key.sub) return null;
    return { expiresIn: Math.max(0, session.expiresAt - this.now()) };
  }

  // ── handing numbers out ──────────────────────────────────────────────────

  /**
   * Hand the session at least `count` numbers, or as many as there are:
   * blocks writes returned first, then those of expired sessions (taken
   * whole, so it may get a few more), and only the rest fresh from the
   * counter, which stops at `OBJECT_NUMBER_ISSUE_LIMIT`. Returns the numbers
   * it now holds that it didn't before. The counter must have started.
   *
   * Moving the counter locks the layer's row until the transaction ends, so
   * it comes last: callers issue as their transaction's last step.
   */
  async issue(executor: DbExecutor, key: EditSessionKey, count: number): Promise<number[]> {
    await this.repo.deleteIdleExpiredSessions(executor, key.layerId, this.now(), TIDY_LIMIT);
    const issued: number[] = [];
    let wanted = count;
    while (wanted > 0) {
      const block = await this.repo.reclaimable(executor, key.layerId, this.now());
      if (!block) break;
      const claimed = await this.repo.claimBlock(
        executor,
        key.layerId,
        block.first,
        block.sessionId,
        key.sessionId,
      );
      if (!claimed) continue; // another request took it: look again
      issued.push(...numbersOf(block));
      wanted -= bitCount(block.available);
    }
    if (wanted > 0) {
      const counter = (await this.repo.counter(executor, key.layerId)) ?? 0;
      const fresh = Math.min(wanted, Math.max(0, OBJECT_NUMBER_ISSUE_LIMIT + 1 - counter));
      if (fresh > 0) {
        const first = await this.repo.advanceCounter(executor, key.layerId, fresh);
        await this.repo.insertBlocks(executor, key.layerId, blocksFor(first, fresh), key.sessionId);
        for (let i = 0; i < fresh; i++) issued.push(first + i);
      }
    }
    return issued;
  }

  /** Every number the session holds now, as runs. */
  async held(executor: DbExecutor, key: EditSessionKey): Promise<ObjectNumberRange[]> {
    const blocks = await this.repo.blocksOf(executor, key.layerId, key.sessionId);
    return rangesOf(blocks.flatMap(numbersOf));
  }

  // ── writes ───────────────────────────────────────────────────────────────

  /**
   * Before a write runs: every number it names must be one this session
   * holds and hasn't spent, else `ObjectNumberUnavailable` (`not-held`),
   * whatever the reason. An expired session whose blocks nobody took yet is
   * revived.
   */
  async assertHeld(
    executor: DbExecutor,
    key: EditSessionKey,
    numbers: readonly number[],
  ): Promise<void> {
    if (numbers.length === 0) return;
    const session = await this.repo.findSession(executor, key.layerId, key.sessionId);
    if (!session || session.sub !== key.sub) throw objectNumberNotHeld(numbers[0]!);
    for (const number of numbers) {
      const block = await this.repo.blockHolding(executor, key.layerId, number);
      if (
        !block ||
        block.sessionId !== key.sessionId ||
        !hasBit(block.available, number - block.first)
      ) {
        throw objectNumberNotHeld(number);
      }
    }
    if (session.expiresAt <= this.now()) await this.touchSession(executor, key);
  }

  /**
   * At commit: the numbers the write created objects at are spent. Each bit
   * is cleared only if the session still holds it; if a block moved since
   * the check, the write is refused `not-held` and its transaction rolls
   * back.
   */
  async spend(
    executor: DbExecutor,
    key: EditSessionKey,
    numbers: readonly number[],
  ): Promise<void> {
    const masks = new Map<number, number>();
    for (const number of new Set(numbers)) {
      const block = await this.repo.blockHolding(executor, key.layerId, number);
      if (!block) throw objectNumberNotHeld(number);
      masks.set(block.first, (masks.get(block.first) ?? 0) + maskOf(number - block.first, 1));
    }
    for (const [first, mask] of masks) {
      if (!(await this.repo.spend(executor, key.layerId, first, key.sessionId, mask))) {
        throw objectNumberNotHeld(first + lowestBit(mask));
      }
    }
    await this.repo.deleteEmptyBlocks(executor, key.layerId, [...masks.keys()]);
  }

  /**
   * Before a write runs: numbers for the objects the engine makes for
   * itself, `estimate` of them from the counter. The worker starts its own
   * numbering at `floor`; held numbers are all below it. Refused
   * (`LayerFull`) past the ceiling.
   */
  async reserveForWrite(
    layerId: string,
    baseSha: string | null,
    estimate: number,
  ): Promise<WriteObjectNumberRange> {
    const floor = await this.repo.advanceCounter(this.db, layerId, estimate);
    const range = { floor, end: floor + estimate, baseSha };
    if (range.end - 1 > OBJECT_NUMBER_CEILING) {
      await this.releaseWrite(layerId, range);
      throw new EngineError(
        EngineErrorCode.LayerFull,
        `the document would pass object number ${OBJECT_NUMBER_CEILING}`,
        { details: { lastObjectNumber: floor - 1 } },
      );
    }
    return range;
  }

  /**
   * At commit: the worker numbered its objects up to `lastObjectNumber`.
   * - Nobody took numbers since the write's range: the counter moves to just
   *   past what the write used, below the range's end or past it.
   * - Somebody did, and the write stayed inside its range: the part it
   *   didn't use goes back as blocks nobody holds.
   * - Somebody did, and the write needed more: its objects may sit on
   *   numbers handed out since, so `'overran'`: the caller runs it again.
   */
  async settleWrite(
    executor: DbExecutor,
    layerId: string,
    range: WriteObjectNumberRange,
    lastObjectNumber: number,
  ): Promise<'settled' | 'overran'> {
    const next = Math.max(lastObjectNumber + 1, range.floor);
    if (await this.repo.lowerCounter(executor, layerId, range.end, next)) return 'settled';
    if (next > range.end) return 'overran';
    await this.repo.insertBlocks(executor, layerId, blocksFor(next, range.end - next), null);
    return 'settled';
  }

  /**
   * A write that failed or runs again gives its whole range back: the
   * counter goes back down when nobody took numbers since, else the range
   * becomes blocks nobody holds. Nothing used them: they only ever existed
   * in a transaction that rolled back. Once a publish moved the layer to
   * another base version, its numbers count anew and the range is dropped.
   */
  async releaseWrite(layerId: string, range: WriteObjectNumberRange): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      if (!(await this.repo.lockLayerOnBase(trx, layerId, range.baseSha))) return;
      if (await this.repo.lowerCounter(trx, layerId, range.end, range.floor)) return;
      await this.repo.insertBlocks(
        trx,
        layerId,
        blocksFor(range.floor, range.end - range.floor),
        null,
      );
    });
  }

  /**
   * A publish numbers objects anew: every block of the layer goes, and the
   * counter moves past the new version's last number. Sessions stay, with
   * nothing held.
   */
  async publish(executor: DbExecutor, layerId: string, lastObjectNumber: number): Promise<void> {
    await this.repo.deleteLayerBlocks(executor, layerId);
    await this.repo.raiseCounter(executor, layerId, lastObjectNumber + 1);
  }
}

/** A write named a number its session doesn't hold (or never had one). */
export function objectNumberNotHeld(objectNumber: number): EngineError {
  return new EngineError(
    EngineErrorCode.ObjectNumberUnavailable,
    `object number ${objectNumber} isn't one this session holds`,
    { details: { objectNumber, reason: 'not-held' } },
  );
}

function lowestBit(mask: number): number {
  for (let index = 0; index < OBJECT_NUMBER_BLOCK_SIZE; index++) {
    if (hasBit(mask, index)) return index;
  }
  return 0;
}
