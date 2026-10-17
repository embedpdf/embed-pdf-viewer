/**
 * The object numbers of one layer write, from its prepare to its commit, or
 * to its failure (see ObjectNumberService):
 *
 * 1. **Prepare.** Every number the write names must be one its editing
 *    session holds. The write takes a range from the counter for the objects
 *    the engine makes for itself; the worker numbers them from the range's
 *    floor.
 * 2. **Dispatch.** The worker reports the layer's last object number with
 *    the artifact it saved.
 * 3. **Commit**, at the layer's version fence, in its transaction: the named
 *    numbers are spent, the range settles, and the session is kept alive and
 *    topped up when the request asked for numbers.
 * 4. **After.** Once the commit's transaction landed, the top-up goes to the
 *    response. Every range that didn't settle (a failed attempt, a rerun)
 *    goes back.
 */
import type { ObjectNumberRange, WorkerResultPayload } from '@embedpdf/engine-core/runtime';
import type { Kysely, Transaction } from 'kysely';

import { rangesOf } from './objectNumberBlocks';
import {
  MAX_OBJECT_NUMBER_TOP_UP,
  objectNumberNotHeld,
  type EditSessionKey,
  type ObjectNumberService,
  type WriteObjectNumberRange,
} from './ObjectNumberService';
import type { Database as Schema } from '../db/schema';

/** How many object numbers a write's own objects are expected to need, by kind of write. */
export const OBJECT_NUMBER_ESTIMATES = {
  /** Annotation writes, metadata, attachments, flattening, redaction, page structure. */
  default: 64,
  /** Form writes regenerate many widget appearances. */
  forms: 256,
  /** Blank pages: one page object and its resources each. */
  blankPages: (count: number) => 64 + 16 * count,
  /** Pages copied from another file: about one object per 512 bytes of it. */
  insertedPages: (byteLength: number) => 1_024 + Math.ceil(byteLength / 512),
} as const;

/**
 * What an editing request asks of its session: a top-up with the write
 * (`EmbedPDF-Reserve-Object-Numbers`), and where the numbers handed out go,
 * for the response (`EmbedPDF-Object-Numbers`).
 */
export interface EditRequest {
  readonly topUp: number;
  issued: ObjectNumberRange[];
}

/** What a write names and needs: its numbered creates, and its estimate. */
export interface WriteObjectNumbersInput {
  readonly named?: readonly number[];
  readonly estimate?: number;
}

export class LayerWriteObjectNumbers {
  /** Ranges taken and not settled: given back after the write. */
  private readonly open: WriteObjectNumberRange[] = [];
  private current: WriteObjectNumberRange | null = null;
  private named: readonly number[] = [];
  private lastObjectNumber: number | null = null;
  /** The top-up of the last commit, for the response once it landed. */
  private issued: ObjectNumberRange[] = [];

  constructor(
    private readonly service: ObjectNumberService,
    private readonly db: Kysely<Schema>,
    readonly layerId: string,
    readonly docId: string,
    readonly layerName: string,
    /** The editing session acting, when the request named one. */
    private readonly session: EditSessionKey | null,
    private readonly edit: EditRequest | undefined,
    /** How many numbers to top the session up by at the commit. */
    private readonly topUp: number,
  ) {}

  /** The first number the write's own objects may take. */
  get floor(): number {
    if (!this.current) throw new Error('the write has no object number range');
    return this.current.floor;
  }

  /**
   * Check what the write names and take its range. A rerun of the write
   * prepares again, with a fresh range; the earlier one goes back after.
   */
  async prepare(baseSha: string | null, input: WriteObjectNumbersInput): Promise<void> {
    this.named = input.named ?? [];
    this.lastObjectNumber = null;
    this.issued = [];
    if (this.named.length > 0) {
      // Numbers are held by editing sessions: a request without one holds none.
      if (!this.session) throw objectNumberNotHeld(this.named[0]!);
      await this.service.assertHeld(this.db, this.session, this.named);
    }
    this.current = await this.service.reserveForWrite(
      this.layerId,
      baseSha,
      input.estimate ?? OBJECT_NUMBER_ESTIMATES.default,
    );
    this.open.push(this.current);
  }

  /** The worker's answer: the layer's last object number, with the artifact it saved. */
  recordResult(payload: WorkerResultPayload): void {
    const saved =
      'artifactFile' in payload && payload.artifactFile
        ? payload.artifactFile
        : 'artifact' in payload && payload.artifact
          ? payload.artifact
          : null;
    if (saved) this.lastObjectNumber = saved.lastObjectNumber;
  }

  /**
   * At the fence, in the commit's transaction: spend the named numbers,
   * settle the range, keep the session alive and top it up. `'overran'`:
   * the write's own objects passed its range while numbers went out, so it
   * must run again.
   */
  async commit(trx: Transaction<Schema>): Promise<'committed' | 'overran'> {
    if (this.named.length > 0 && this.session) {
      await this.service.spend(trx, this.session, this.named);
    }
    if (this.current && this.lastObjectNumber !== null) {
      const settled = await this.service.settleWrite(
        trx,
        this.layerId,
        this.current,
        this.lastObjectNumber,
      );
      if (settled === 'overran') return 'overran';
      this.open.splice(this.open.indexOf(this.current), 1);
    }
    if (this.session) {
      const editing =
        (this.edit?.topUp ?? 0) > 0 ||
        this.named.length > 0 ||
        (await this.service.findSession(trx, this.session)) !== null;
      if (editing) {
        await this.service.touchSession(trx, this.session);
        const topUp = Math.min(this.topUp, MAX_OBJECT_NUMBER_TOP_UP);
        if (topUp > 0) this.issued = rangesOf(await this.service.issue(trx, this.session, topUp));
      }
    }
    return 'committed';
  }

  /** The commit's transaction landed: its top-up goes to the response. */
  answer(): void {
    if (this.edit) this.edit.issued = this.issued;
  }

  /** After the write, won or lost: every range that didn't settle goes back. */
  async release(): Promise<void> {
    for (const range of this.open.splice(0)) {
      await this.service.releaseWrite(this.layerId, range);
    }
  }
}
