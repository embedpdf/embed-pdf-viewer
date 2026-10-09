/**
 * The change queue (`ctx.changes`): one per open document, shared by every
 * plugin of it.
 *
 * A user action is one change: a list of the engine's ops, applied all or
 * nothing by `doc.apply`, sent as one request and undone as one step. A plugin
 * stages it; every mirror's `view()` shows it at once (`predict`, mirror.ts),
 * and the queue sends it after everything staged before it. The engine keeps
 * that order, and publishes a change's events before it answers.
 *
 * A change leaves the views once the engine answered:
 *   - applied: once each mirror holds the answer. A mirror that folded the
 *     events already does; one that asked to read again keeps showing the
 *     change until that read lands (mirror.ts).
 *   - refused: at once, together with the changes that name an object only it
 *     would have created (its dependents), which can't apply either.
 *
 * Two ways a change is put together over time:
 *   - a hold can still be amended before it is sent (typing, a form commit
 *     waiting for its scripts). Any later stage sends the open holds first, so
 *     send order is always staging order;
 *   - a group makes everything staged inside it, by any plugin, one change.
 */
import {
  generateUuidV7,
  objectNumbersNamedBy,
  objectNumbersReferencedBy,
  type Annotation,
  type Change,
  type ChangeOp,
  type ChangeResult,
  type DocumentHandle,
  type FormFieldDTO,
} from '@embedpdf/engine-core/runtime';

import { PluginError, toPluginError } from './errors';
import { createEventHook, type EventHook } from './event-hook';

/** What a change is called in history and refusals: an i18n key and its values. */
export interface ChangeLabel {
  readonly key: string;
  readonly [value: string]: string | number;
}

/** An op a view can predict: the engine's ops, and the two only an undo brings back. */
export type PredictedOp =
  | ChangeOp
  | {
      readonly type: 'annotations.restore';
      readonly annotation: Annotation;
      /** Its place among the page's annotations. */
      readonly index: number;
    }
  | { readonly type: 'forms.restore'; readonly field: FormFieldDTO };

/** One user action, as a plugin stages it. */
export type StagedChange =
  | {
      readonly label: ChangeLabel;
      /** The engine's ops, sent as they are. */
      readonly ops: readonly ChangeOp[];
      /** What undoing it looks like, as ops the views can predict. Drawing only; never sent. */
      readonly undo?: readonly PredictedOp[];
      /** `false`: not a step of the history, such as a recalculation another session caused. */
      readonly history?: false;
    }
  | {
      readonly label: ChangeLabel;
      /** Undo the change with this `opId`: the engine applies the reverse it recorded. */
      readonly undoOf: string;
      /** What the views show until the engine answers. */
      readonly shows: readonly PredictedOp[];
    };

/** A change of this session the engine hasn't answered yet. */
export interface PendingChange {
  /** Its name: what the engine's events carry as `origin.tx.id`, and what `undoOf` names. */
  readonly opId: string;
  readonly label: ChangeLabel;
  /** What the views show until the engine answers: its ops, or an undo's prediction. */
  readonly shows: readonly PredictedOp[];
  /** What undoing it looks like (drawing only); empty when the stager gave none. */
  readonly undo: readonly PredictedOp[];
  /** Whether it is a step of the history. An undo isn't: it moves along the history. */
  readonly history: boolean;
  /** An open hold: shown, not sent yet. */
  readonly held: boolean;
  /** The engine's answer: resolves with what the change did, rejects with why it was refused. */
  readonly result: Promise<ChangeResult>;
}

/** A change the engine answered. */
export type SettledChange =
  | { readonly change: PendingChange; readonly status: 'applied'; readonly result: ChangeResult }
  | { readonly change: PendingChange; readonly status: 'refused'; readonly error: PluginError };

/** A change that can still be amended until it is sent. */
export interface HeldChange {
  /** Its ops from now on, and what undoing them looks like. The views show the latest. */
  set(ops: readonly ChangeOp[], undo?: readonly PredictedOp[]): void;
  /**
   * Send it now, after any hold staged before it. A hold is also sent when another change is
   * staged, and before a download. `null` when nothing was ever set.
   */
  send(): PendingChange | null;
  /** Drop it: the views show the truth again, and nothing is sent. */
  cancel(): void;
}

/** The document's change queue, as a plugin uses it (`ctx.changes`). */
export interface ChangeQueue {
  /**
   * Stage one user action. Every mirror's view shows it before this returns, and it is sent
   * after everything staged before it; an open hold is sent first. Inside a group it joins the
   * group's change, and the group's change is what it returns.
   */
  stage(change: StagedChange): PendingChange;
  /**
   * A change that can still be amended until it is sent: typing, or a form commit waiting for
   * its scripts. It keeps its place in the order from its first `set`. Refused inside a group.
   */
  hold(label: ChangeLabel): HeldChange;
  /**
   * Everything staged while `run` runs, by any plugin, becomes one change: one request, one
   * undo step. Only what is staged before `run` returns joins; nested groups join the outer
   * one. When `run` throws, nothing of it is sent.
   */
  group<T>(label: ChangeLabel, run: () => T): T;
  /** A final name for an object this session creates, or `null` when none is held (then `reserve`). */
  takeObjectNumber(): number | null;
  /** Resolves once at least `count` names are held. */
  reserveObjectNumbers(count: number): Promise<void>;
  /** This session's changes the engine hasn't answered, open holds included, in staging order. */
  pending(): readonly PendingChange[];
  hasPending(): boolean;
  /** Resolves once every change sent so far is answered; open holds aren't waited for. Never rejects. */
  whenSettled(): Promise<void>;
  /** A change was staged, or a hold was sent. */
  readonly onStaged: EventHook<PendingChange>;
  /** The engine answered a change, or refused it with one it depended on. */
  readonly onSettled: EventHook<SettledChange>;
}

/** A change in the queue, with the order it was staged in. */
export interface QueuedChange extends PendingChange {
  readonly seq: number;
}

/** What the mirrors read from the queue to show the pending changes. */
export interface ChangeViews {
  /** The changes the views show, in staging order: every one not answered yet. */
  shown(): readonly QueuedChange[];
  /** Moves every time `shown()` does. */
  version(): number;
  /** A change still waiting for its answer, by its `opId`. */
  find(opId: string): QueuedChange | undefined;
}

/** The kernel's side of a document's queue. */
export interface DocumentChanges extends ChangeViews {
  /** The queue as one plugin uses it: its refusals name that plugin. */
  forPlugin(capability: string): ChangeQueue;
  /** Send every open hold, then wait for every answer: what a download waits for. */
  settle(): Promise<void>;
  /** The document closed: every change still waiting rejects `instance-closed`. */
  close(): void;
}

interface Entry {
  readonly seq: number;
  readonly opId: string;
  readonly label: ChangeLabel;
  /** The engine's ops; `null` for an undo. */
  ops: readonly ChangeOp[] | null;
  readonly undoOf: string | null;
  shows: readonly PredictedOp[];
  undo: readonly PredictedOp[];
  history: boolean;
  held: boolean;
  /** The plugin that staged it: its refusal names it. */
  readonly capability: string;
  readonly result: Promise<ChangeResult>;
  answered: boolean;
  abort: ((reason?: unknown) => void) | null;
  resolve(result: ChangeResult): void;
  reject(error: PluginError): void;
}

/** What a group collects while its `run` runs. */
interface Grouping {
  readonly label: ChangeLabel;
  readonly capability: string;
  entry: Entry | null;
}

const changeOf = (entry: Entry): Change =>
  entry.undoOf !== null ? { undoOf: entry.undoOf } : { ops: entry.ops ?? [] };

export function createDocumentChanges(options: {
  /** The document's engine handle; `null` until it opened. */
  handle: () => DocumentHandle | null;
  /** Wake the store's readers: the views changed. */
  notify: () => void;
  report: (error: unknown) => void;
}): DocumentChanges {
  let entries: Entry[] = [];
  let version = 0;
  let nextSeq = 0;
  let grouping: Grouping | null = null;
  let closed = false;
  const staged = createEventHook<PendingChange>(options.report);
  const settled = createEventHook<SettledChange>(options.report);

  const handleFor = (capability: string): DocumentHandle => {
    const handle = options.handle();
    if (!handle) throw new PluginError('not-ready', capability, 'the document has not opened yet');
    return handle;
  };

  const assertOpen = (capability: string): void => {
    if (closed) throw new PluginError('instance-closed', capability, 'the document closed');
  };

  const changed = (): void => {
    version += 1;
    options.notify();
  };

  const createEntry = (init: {
    label: ChangeLabel;
    ops: readonly ChangeOp[] | null;
    undoOf: string | null;
    shows: readonly PredictedOp[];
    undo: readonly PredictedOp[];
    history: boolean;
    held: boolean;
    capability: string;
  }): Entry => {
    let resolve!: (result: ChangeResult) => void;
    let reject!: (error: PluginError) => void;
    const result = new Promise<ChangeResult>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    // Whoever staged it may never await the answer: a refusal is reported through `onSettled`.
    result.catch(() => {});
    return {
      ...init,
      seq: nextSeq++,
      opId: generateUuidV7(),
      result,
      answered: false,
      abort: null,
      resolve,
      reject,
    };
  };

  const remove = (entry: Entry): void => {
    entries = entries.filter((candidate) => candidate !== entry);
  };

  const applied = (entry: Entry, result: ChangeResult): void => {
    if (entry.answered) return;
    entry.answered = true;
    remove(entry);
    changed();
    entry.resolve(result);
    settled.emit({ change: entry, status: 'applied', result });
  };

  const refused = (entry: Entry, error: PluginError): void => {
    if (entry.answered) return;
    entry.answered = true;
    remove(entry);
    entry.reject(error);
    settled.emit({ change: entry, status: 'refused', error });
    refuseDependents(entry);
    changed();
  };

  /** The changes staged after `entry` that name an object only it would have created. */
  const refuseDependents = (entry: Entry): void => {
    const created = new Set(objectNumbersNamedBy(changeOf(entry)));
    if (created.size === 0) return;
    for (const later of entries) {
      if (later.seq < entry.seq || later.answered) continue;
      if (!objectNumbersReferencedBy(changeOf(later)).some((number) => created.has(number))) {
        continue;
      }
      later.abort?.();
      refused(
        later,
        new PluginError(
          'conflict',
          later.capability,
          `a change it depends on (${entry.label.key}) was refused`,
          { details: { reason: 'dependency-refused', dependsOn: entry.opId } },
        ),
      );
    }
  };

  const send = (entry: Entry): void => {
    entry.held = false;
    let answer: PromiseLike<ChangeResult> & { abort?: (reason?: unknown) => void };
    try {
      answer = handleFor(entry.capability).apply(changeOf(entry), { opId: entry.opId });
    } catch (error) {
      refused(entry, toPluginError(entry.capability, error));
      return;
    }
    if (typeof answer.abort === 'function') entry.abort = (reason) => answer.abort!(reason);
    answer.then(
      (result) => applied(entry, result),
      (error: unknown) => refused(entry, toPluginError(entry.capability, error)),
    );
  };

  const cancel = (entry: Entry, capability: string): void => {
    if (entry.answered) return;
    entry.answered = true;
    remove(entry);
    entry.reject(new PluginError('operation-cancelled', capability, 'the change was cancelled'));
    changed();
  };

  /** Send the open holds staged before `before`, in staging order. */
  const sendHolds = (before = Infinity): void => {
    for (const entry of entries) {
      if (!entry.held || entry.seq >= before) continue;
      if ((entry.ops ?? []).length === 0) {
        cancel(entry, entry.capability);
        continue;
      }
      staged.emit(entry);
      send(entry);
    }
  };

  const invalid = (capability: string, message: string): PluginError =>
    new PluginError('invalid-input', capability, message);

  /** One stage inside a group: its ops join the group's change. */
  const join = (group: Grouping, change: Extract<StagedChange, { ops: unknown }>): Entry => {
    const entry = group.entry;
    if (!entry) {
      group.entry = createEntry({
        label: group.label,
        ops: change.ops,
        undoOf: null,
        shows: change.ops,
        undo: change.undo ?? [],
        history: change.history !== false,
        held: false,
        capability: group.capability,
      });
      entries.push(group.entry);
      changed();
      return group.entry;
    }
    entry.ops = [...(entry.ops ?? []), ...change.ops];
    entry.shows = entry.ops;
    // Undoing the group undoes its parts last first.
    entry.undo = [...(change.undo ?? []), ...entry.undo];
    entry.history = entry.history || change.history !== false;
    changed();
    return entry;
  };

  const forPlugin = (capability: string): ChangeQueue => ({
    stage(change) {
      assertOpen(capability);
      if ('undoOf' in change) {
        if (grouping) throw invalid(capability, 'an undo can not join a group');
      } else if (change.ops.length === 0) {
        throw invalid(capability, 'a change needs at least one op');
      } else if (grouping) {
        return join(grouping, change);
      }
      sendHolds();
      const entry =
        'undoOf' in change
          ? createEntry({
              label: change.label,
              ops: null,
              undoOf: change.undoOf,
              shows: change.shows,
              undo: [],
              history: false,
              held: false,
              capability,
            })
          : createEntry({
              label: change.label,
              ops: change.ops,
              undoOf: null,
              shows: change.ops,
              undo: change.undo ?? [],
              history: change.history !== false,
              held: false,
              capability,
            });
      entries.push(entry);
      changed();
      staged.emit(entry);
      send(entry);
      return entry;
    },

    hold(label) {
      assertOpen(capability);
      if (grouping) throw invalid(capability, 'a change can not be held inside a group');
      let entry: Entry | null = null;
      return {
        set(ops, undo = []) {
          if (closed || (entry && !entry.held)) return;
          if (!entry) {
            entry = createEntry({
              label,
              ops,
              undoOf: null,
              shows: ops,
              undo,
              history: true,
              held: true,
              capability,
            });
            entries.push(entry);
          } else {
            entry.ops = ops;
            entry.shows = ops;
            entry.undo = undo;
          }
          changed();
        },
        send() {
          if (entry?.held) sendHolds(entry.seq + 1);
          return entry;
        },
        cancel() {
          if (entry?.held) cancel(entry, capability);
        },
      };
    },

    group(label, run) {
      assertOpen(capability);
      if (grouping) return run();
      sendHolds();
      const group: Grouping = { label, capability, entry: null };
      grouping = group;
      let value: ReturnType<typeof run>;
      try {
        value = run();
      } catch (error) {
        grouping = null;
        if (group.entry) cancel(group.entry, capability);
        throw error;
      }
      grouping = null;
      if (group.entry) {
        staged.emit(group.entry);
        send(group.entry);
      }
      return value;
    },

    takeObjectNumber: () => handleFor(capability).objectNumbers.take(),
    async reserveObjectNumbers(count) {
      try {
        await handleFor(capability).objectNumbers.reserve(count);
      } catch (error) {
        throw toPluginError(capability, error);
      }
    },
    pending: () => entries,
    hasPending: () => entries.length > 0,
    whenSettled: () => whenSettled(),
    onStaged: staged.on,
    onSettled: settled.on,
  });

  const whenSettled = async (): Promise<void> => {
    await Promise.allSettled(entries.filter((entry) => !entry.held).map((entry) => entry.result));
  };

  return {
    shown: () => entries,
    version: () => version,
    find: (opId) => entries.find((entry) => entry.opId === opId),
    forPlugin,
    settle() {
      sendHolds();
      return whenSettled();
    },
    close() {
      if (closed) return;
      closed = true;
      const open = entries;
      entries = [];
      version += 1;
      for (const entry of open) {
        entry.answered = true;
        entry.reject(new PluginError('instance-closed', entry.capability, 'the document closed'));
      }
      staged.dispose();
      settled.dispose();
    },
  };
}
