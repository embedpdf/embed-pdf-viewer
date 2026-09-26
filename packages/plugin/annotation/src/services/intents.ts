/**
 * Intents: one user action's change, from the moment it shows until the
 * engine's answer is in the confirmed records.
 *
 *   1. stage   the message's session enters the state, and every record it
 *              changed becomes one pending change (new fields, a new record,
 *              or a delete) with a token of its own; the view shows it at once
 *   2. write   the effect runners' engine writes run; each carries the
 *              changes of the records it names
 *   3. settle  a refused write drops its changes at once: they are wrong. An
 *              accepted write settles its changes once the records mirror
 *              holds the result: at once for an event the mirror applied
 *              exactly (the engine publishes before it resolves), after the
 *              page read an event asked for otherwise. If the mirror is stale
 *              (a read failed), the changes stay until a load succeeds: the
 *              engine accepted them, so they are the best knowledge of the
 *              truth. Changes no write carries are dropped when the last
 *              write settled.
 *
 * Rollback is therefore deletion: a refused change disappears and the view
 * shows the engine's record, including anything another session changed.
 *
 * Several messages can share one engine write (keystrokes typed before a
 * pause): each settles its own change, and the refusal is reported once.
 */
import { toPluginError, toPluginErrorInfo, type Mirror, type PluginError } from '@embedpdf/core';
import type { Id, Model, UpdateResult } from '@embedpdf/core-annotation';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import { changedFields, stage, writeSettled, type PendingChange } from '../model';
import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';
import type { AnnotationRecords } from '../sync/records';

/** The confirmed ref of each record a write created, by the id it was created under. */
export type CreatedRefs = Readonly<Record<Id, AnnotationRef>>;

/**
 * One engine write an effect asks for. A record is carried by at most one
 * write of a message.
 */
export interface IntentWrite {
  /** The records whose changes this write carries. */
  readonly ids: readonly Id[];
  /** Runs the engine call. A create resolves with the refs of the records it created. */
  readonly perform: () => Promise<CreatedRefs | void>;
}

export interface IntentOutcome {
  readonly created: CreatedRefs;
  /** The writes the engine refused, with the ids they carried. */
  readonly failed: readonly { readonly ids: readonly Id[]; readonly error: PluginError }[];
}

/** A staged message: the token of each record's change. */
export type Staged = ReadonlyMap<Id, number>;

const NOTHING_WRITTEN: IntentOutcome = { created: {}, failed: [] };

export function createIntents(
  ctx: Pick<AnnotationContext, 'state'>,
  records: Pick<Mirror<AnnotationRecords>, 'settled' | 'getStatus'>,
  events: Pick<AnnotationEvents, 'writeFailed' | 'recordsChanged'>,
  refOf: (id: Id) => AnnotationRef | null,
) {
  /** The last token handed out; every change gets a new one. */
  let token = 0;
  /** Accepted changes waiting for the records to be current again. */
  let held: number[] = [];

  events.recordsChanged.on((change) => {
    if (change.cause !== 'load' || !held.length || records.getStatus() !== 'ready') return;
    const released = held;
    held = [];
    ctx.state.update(writeSettled, released, 'accepted');
  });

  /** The engine errors already reported: one write can carry several messages' changes. */
  const reported = new WeakSet<object>();
  const firstReport = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return true;
    if (reported.has(error)) return false;
    reported.add(error);
    return true;
  };

  /**
   * The change a message made to each record, against the model it acted on.
   * An edit also records how the record renders: until it settles, the
   * record looks the way it did when the user made it, whoever else changes
   * the record meanwhile.
   */
  const changesOf = (before: Model, result: UpdateResult): PendingChange[] => {
    const changes: PendingChange[] = [];
    for (const record of result.change.put) {
      const previous = before.byId[record.id];
      changes.push({
        token: ++token,
        id: record.id,
        change: previous
          ? { kind: 'edit', fields: { ...changedFields(previous, record), source: record.source } }
          : { kind: 'create', record },
      });
    }
    for (const id of result.change.drop) {
      changes.push({ token: ++token, id, change: { kind: 'delete' } });
    }
    return changes;
  };

  /**
   * The refs of the records these changes belong to now: a change follows its
   * record to a new key, so it names the record better than the id the write
   * was made under.
   */
  const refsNow = (tokens: readonly number[]): AnnotationRef[] => {
    const carried = new Set(tokens);
    const ids = new Set(
      ctx.state
        .get()
        .pending.filter((change) => carried.has(change.token))
        .map((change) => change.id),
    );
    return [...ids].map(refOf).filter((ref): ref is AnnotationRef => ref !== null);
  };

  /** Step 1: record the message's result against the model it acted on. */
  const begin = (before: Model, result: UpdateResult): Staged => {
    // Tokens are taken before the update: a reaction to it can commit (and stage) again.
    const changes = changesOf(before, result);
    ctx.state.update(stage, result.session, changes);
    return new Map(changes.map((change) => [change.id, change.token]));
  };

  /** Steps 2 and 3: run the writes and settle the changes they carried. */
  const run = async (staged: Staged, writes: readonly IntentWrite[]): Promise<IntentOutcome> => {
    const tokensOf = (ids: readonly Id[]) =>
      ids.flatMap((id) => (staged.has(id) ? [staged.get(id)!] : []));
    const carried = new Set(writes.flatMap((write) => write.ids));
    const uncarried = [...staged.keys()].filter((id) => !carried.has(id));
    if (!writes.length) {
      if (uncarried.length) ctx.state.update(writeSettled, tokensOf(uncarried), 'refused');
      return NOTHING_WRITTEN;
    }
    let created: Record<Id, AnnotationRef> = {};
    const failed: { ids: readonly Id[]; error: PluginError }[] = [];
    const reports: { refs: AnnotationRef[]; error: PluginError }[] = [];
    await Promise.all(
      writes.map(async (write) => {
        const tokens = tokensOf(write.ids);
        try {
          const refs = await write.perform();
          if (refs) created = { ...created, ...refs };
        } catch (error) {
          const refusal = { ids: write.ids, error: toPluginError('annotation', error) };
          failed.push(refusal);
          if (firstReport(error)) reports.push({ refs: refsNow(tokens), error: refusal.error });
          ctx.state.update(writeSettled, tokens, 'refused');
          return;
        }
        // The write's event may have asked the records for a page read.
        await records.settled();
        if (records.getStatus() === 'ready') ctx.state.update(writeSettled, tokens, 'accepted');
        else held = [...held, ...tokens];
      }),
    );
    if (uncarried.length) ctx.state.update(writeSettled, tokensOf(uncarried), 'refused');
    for (const { refs, error } of reports) {
      events.writeFailed.emit({ refs, error: toPluginErrorInfo(error) });
    }
    return { created, failed };
  };

  return { begin, run };
}

export type Intents = ReturnType<typeof createIntents>;
