/**
 * The history controller. It records every change this session stages on the
 * document's change queue, as it is staged, so an undo right after an action
 * undoes that action even before the engine answered it. Undo and redo are
 * changes on the same queue: the undo of a change, by its `opId`. The views
 * show them at once, from what the change said undoing it looks like, and
 * the engine applies the reverse it recorded.
 *
 * The history keeps no copy of the document. What it holds is names, labels
 * and what each step looks like, and it changes on four things: a change
 * staged, a step staged, an answer, and a change that ends undo (a final
 * change, a new version).
 */
import type { PendingChange, PluginContext, PluginError } from '@embedpdf/core';
import { EngineError, EngineErrorCode, type ChangeResult } from '@embedpdf/engine-core/runtime';

import type {
  HistoryCapability,
  HistorySettings,
  HistoryUndoFailedEvent,
  HistoryUndoneEvent,
} from './contract';
import {
  cleared,
  forgotten,
  nextOf,
  recorded,
  stepped,
  stepRefused,
  unavailable,
  type Direction,
  type History,
  type HistoryEntry,
  type HistoryPart,
} from './model';

/** The document events after which nothing before them can be undone. */
const ENDS_UNDO = new Set([
  'redaction.applied',
  'pages.flattened',
  'signatures.completed',
  'forms.repaired',
  'document.versioned',
]);

/** Whether the engine refused an undo because it can't be undone any more. */
const isUnavailable = (error: PluginError): boolean =>
  EngineError.is((error as { cause?: unknown }).cause, EngineErrorCode.UndoUnavailable);

/** How many of an undo's parts were left alone, in whole or in part. */
const skippedIn = (result: ChangeResult): number =>
  result.items.filter(
    (item) => item.type === 'skipped' || ('skipped' in item && (item.skipped?.length ?? 0) > 0),
  ).length;

export function createHistoryController(ctx: PluginContext<History, HistorySettings>) {
  const settings = ctx.settings();
  const undone = ctx.events.source<HistoryUndoneEvent>();
  const undoFailed = ctx.events.source<HistoryUndoFailedEvent>();

  /**
   * The changes the engine will never apply, while a step is on its way: a refused change, and
   * a step that undid one. A step that names one is refused too, and changes nothing more.
   */
  const dead = new Set<string>();
  /** The parts forgotten while a step is on its way: a refusal of their step puts nothing back. */
  const gone = new Set<string>();
  let inFlight = 0;

  const forget = (ids: Iterable<string>): void => {
    if (inFlight === 0) return;
    for (const id of ids) gone.add(id);
  };
  const partsOf = (entries: readonly HistoryEntry[]) =>
    entries.flatMap((entry) => entry.parts.map((part) => part.id));

  const clear = (): void => {
    const history = ctx.state.get();
    forget(partsOf([...history.undo, ...history.redo]));
    ctx.state.update(cleared);
  };

  /**
   * One step's change for one part, and what its answer does. `moot`: it named a change the
   * engine never applied, or a part the history forgot, so its refusal says nothing new.
   */
  const answerOf = (
    direction: Direction,
    entry: HistoryEntry,
    part: HistoryPart,
    change: PendingChange,
  ): Promise<{ skipped: number } | { error: PluginError } | { moot: true }> =>
    change.result.then(
      (result) => {
        if (!result.meta.undoable) {
          // It did nothing (every part was left alone): there is nothing to step back over.
          forget([part.id]);
          ctx.state.update(forgotten, part.id);
        }
        return { skipped: skippedIn(result) };
      },
      (error: PluginError) => {
        dead.add(change.opId);
        if (dead.has(part.opId) || gone.has(part.id)) return { moot: true };
        if (isUnavailable(error)) {
          const history = ctx.state.get();
          const older = [...history.undo, ...history.redo].filter(
            (other) => other.seq <= entry.seq,
          );
          forget(partsOf(older));
          ctx.state.update(unavailable, entry.seq);
        } else {
          // The part didn't move: it goes back, and the step can be tried again.
          ctx.state.update(stepRefused, direction, entry, part);
        }
        return { error };
      },
    );

  /**
   * Take one step: the undo of each part of the next entry, as one change each (undo goes
   * newest first, redo oldest first), staged now, so the views show it at once.
   */
  const step = (direction: Direction): void => {
    // What is still being typed is part of the history from now on: send it first.
    ctx.changes.sendHolds();
    const entry = nextOf(ctx.state.get(), direction);
    if (!entry) return;
    const parts = direction === 'undo' ? [...entry.parts].reverse() : entry.parts;
    const staged: { part: HistoryPart; change: PendingChange }[] = [];
    for (const part of parts) {
      try {
        const change = ctx.changes.stage({
          label: entry.label,
          undoOf: part.opId,
          shows: direction === 'undo' ? part.backward : part.forward,
        });
        staged.push({ part, change });
      } catch (error) {
        // The document closed: the parts staged so far move, the rest stay.
        if (staged.length === 0) throw error;
        break;
      }
    }
    ctx.state.update(
      stepped,
      direction,
      entry.seq,
      new Map(staged.map(({ part, change }) => [part.id, change.opId])),
    );
    inFlight += 1;
    void Promise.all(
      staged.map(({ part, change }) => answerOf(direction, entry, part, change)),
    ).then((answers) => {
      inFlight -= 1;
      if (inFlight === 0) {
        dead.clear();
        gone.clear();
      }
      const redo = direction === 'redo';
      if (answers.every((answer) => 'moot' in answer)) return;
      const failure = answers.find((answer) => 'error' in answer);
      if (failure && 'error' in failure) {
        undoFailed.emit({
          label: entry.label,
          redo,
          reason: isUnavailable(failure.error) ? 'unavailable' : 'refused',
          error: failure.error,
        });
        return;
      }
      const skipped = answers.reduce(
        (sum, answer) => sum + ('skipped' in answer ? answer.skipped : 0),
        0,
      );
      undone.emit({ label: entry.label, redo, skipped });
    });
  };

  /** A change still being typed: what undo would undo before anything in the history. */
  const openHold = (): PendingChange | null =>
    ctx.changes.pending().find((change) => change.held && change.history) ?? null;

  const api: HistoryCapability = {
    ...settings.api,
    undo: () => step('undo'),
    redo: () => step('redo'),
    canUndo: () => openHold() !== null || ctx.state.get().undo.length > 0,
    canRedo: () => openHold() === null && ctx.state.get().redo.length > 0,
    getUndoLabel: () => openHold()?.label ?? nextOf(ctx.state.get(), 'undo')?.label ?? null,
    getRedoLabel: () =>
      openHold() === null ? (nextOf(ctx.state.get(), 'redo')?.label ?? null) : null,
    clear,
    onUndone: undone.on,
    onUndoFailed: undoFailed.on,
  };

  return {
    api,
    connect() {
      // A change this session staged is a step of the history, unless it moves along the
      // history (an undo or a redo) or isn't one (`history: false`).
      ctx.listen(ctx.changes.onStaged, (change) => {
        if (change.undoOf !== null || !change.history) return;
        ctx.state.update(recorded, change, settings.get().limit);
      });
      ctx.listen(ctx.changes.onSettled, (settled) => {
        const { change } = settled;
        if (change.undoOf !== null || !change.history) return;
        // A change the engine refused never happened; one that did nothing can't be undone.
        if (settled.status === 'refused' || !settled.result.meta.undoable) {
          if (settled.status === 'refused' && inFlight > 0) dead.add(change.opId);
          forget([change.opId]);
          ctx.state.update(forgotten, change.opId);
        }
      });
      ctx.listen(ctx.doc.events, (event) => {
        if (ENDS_UNDO.has(event.type)) clear();
      });
    },
  };
}
