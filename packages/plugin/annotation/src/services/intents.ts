/**
 * Intents: one user action's change, from the moment it shows until the
 * engine's answer is in the confirmed records.
 *
 *   1. stage   the message's session enters the state, and every record it
 *              changed becomes one pending change (an edit and its patch, a
 *              new record, or a delete) with a token of its own; the view
 *              shows it at once. A change stated in code (`store.apply`) is
 *              staged the same way.
 *   2. write   the effect runners' engine writes run; each carries exactly
 *              the pending changes it was bound to (their tokens), and
 *              answers with what the engine wrote
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
import type { Annotation, AnnotationRef } from '@embedpdf/engine-core/runtime';

import {
  changedFields,
  stage,
  writeSettled,
  type PendingChange,
  type RecordChange,
} from '../model';
import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';
import type { AnnotationRecords } from '../sync/records';

/** The confirmed ref of each record a write created, by the id it was created under. */
export type CreatedRefs = Readonly<Record<Id, AnnotationRef>>;

/** What the engine answered one write. */
export interface WriteAnswer {
  /** The confirmed ref of each record the write created, by the id it was created under. */
  readonly created?: CreatedRefs;
  /** The annotation a single create or update left, as the engine read it back. */
  readonly annotation?: Annotation;
}

/** One engine write an effect or a stated change asks for. */
export interface IntentWrite {
  /** The records whose changes this write carries. */
  readonly ids: readonly Id[];
  /** Runs the engine call, and resolves with what the engine answered. */
  readonly perform: () => Promise<WriteAnswer | void>;
}

/**
 * A write, bound to the pending changes it carries: their tokens settle when
 * it does. Binding by token, not by record, lets two changes to one record
 * each settle with their own write.
 */
export interface CarriedWrite {
  readonly write: IntentWrite;
  readonly tokens: readonly number[];
}

export interface IntentOutcome {
  readonly created: CreatedRefs;
  /** The writes the engine refused, with the ids they carried. */
  readonly failed: readonly { readonly ids: readonly Id[]; readonly error: PluginError }[];
  /** What each write answered, in the order the writes were given; `null` for a refused one. */
  readonly answers: readonly (WriteAnswer | null)[];
}

const NOTHING_WRITTEN: IntentOutcome = { created: {}, failed: [], answers: [] };

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
          ? {
              kind: 'edit',
              ...(result.change.patches[record.id]
                ? { patch: result.change.patches[record.id] }
                : {}),
              fields: { ...changedFields(previous, record), source: record.source },
            }
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

  /** Step 1: record the message's result against the model it acted on; its staged changes. */
  const begin = (before: Model, result: UpdateResult): readonly PendingChange[] => {
    // Tokens are taken before the update: a reaction to it can commit (and stage) again.
    const changes = changesOf(before, result);
    ctx.state.update(stage, result.session, changes);
    return changes;
  };

  /** Step 1 for changes stated in code: each record's change, with the session as it is. */
  const beginStated = (
    stated: readonly { id: Id; change: RecordChange }[],
  ): readonly PendingChange[] => {
    const changes = stated.map(({ id, change }): PendingChange => ({ token: ++token, id, change }));
    ctx.state.update(stage, ctx.state.get().session, changes);
    return changes;
  };

  /** Runs whose writes haven't all answered yet. */
  const running = new Set<Promise<IntentOutcome>>();

  /**
   * Steps 2 and 3: run the writes and settle the changes each carried. A
   * staged change no write carries is dropped: nothing will write it.
   */
  const run = (
    staged: readonly PendingChange[],
    writes: readonly CarriedWrite[],
  ): Promise<IntentOutcome> => {
    const done = runWrites(staged, writes);
    running.add(done);
    void done.finally(() => running.delete(done));
    return done;
  };

  /**
   * Resolves once every write started so far has its answer, and every write
   * started while waiting too: what a download waits for (`ctx.onSettle`).
   */
  const idle = async (): Promise<void> => {
    while (running.size) await Promise.allSettled([...running]);
  };

  const runWrites = async (
    staged: readonly PendingChange[],
    writes: readonly CarriedWrite[],
  ): Promise<IntentOutcome> => {
    const carried = new Set(writes.flatMap(({ tokens }) => tokens));
    const uncarried = staged.map((change) => change.token).filter((each) => !carried.has(each));
    if (!writes.length) {
      if (uncarried.length) ctx.state.update(writeSettled, uncarried, 'refused');
      return NOTHING_WRITTEN;
    }
    let created: Record<Id, AnnotationRef> = {};
    const failed: { ids: readonly Id[]; error: PluginError }[] = [];
    const reports: { refs: AnnotationRef[]; error: PluginError }[] = [];
    const answers: (WriteAnswer | null)[] = writes.map(() => null);
    await Promise.all(
      writes.map(async ({ write, tokens }, index) => {
        try {
          const answer = await write.perform();
          if (answer?.created) created = { ...created, ...answer.created };
          answers[index] = answer ?? {};
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
    if (uncarried.length) ctx.state.update(writeSettled, uncarried, 'refused');
    for (const { refs, error } of reports) {
      events.writeFailed.emit({ refs, error: toPluginErrorInfo(error) });
    }
    return { created, failed, answers };
  };

  return { begin, beginStated, run, idle };
}

export type Intents = ReturnType<typeof createIntents>;
