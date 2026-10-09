/**
 * The history as a value, and the pure steps that change it.
 *
 * An entry is one step of the history: one change this session staged, or the
 * changes of one typing session (its pauses). Each change is a part. A part is
 * named by the change the next step undoes: the change itself at first, then
 * the undo that undid it, then the redo that undid that undo, and so on. An
 * undo and a redo are the same thing to the engine: the undo of a change.
 *
 * Entries are numbered in the order they were recorded (`seq`). The undo
 * stack holds them oldest first and the redo stack newest first, so the next
 * step is always the last of its stack, and an entry put back after a refused
 * step finds its place by its number.
 */
import type { ChangeLabel, PredictedOp } from '@embedpdf/core';

export interface HistoryPart {
  /** The order it was recorded in. */
  readonly seq: number;
  /** The change it began as, which is what a refusal of that change names. Never changes. */
  readonly id: string;
  /** The change the next step undoes: the change itself, or its latest undo or redo. */
  readonly opId: string;
  /** What the change shows: what a redo of it shows until the engine answers. */
  readonly forward: readonly PredictedOp[];
  /** What undoing it shows until the engine answers. */
  readonly backward: readonly PredictedOp[];
}

export interface HistoryEntry {
  /** The order it was recorded in. */
  readonly seq: number;
  readonly label: ChangeLabel;
  /** Consecutive changes with this key join it (typing); `null` for every other change. */
  readonly merge: string | null;
  /** Its changes, oldest first. */
  readonly parts: readonly HistoryPart[];
}

export interface History {
  /** What undo undoes, oldest first: the last is next. */
  readonly undo: readonly HistoryEntry[];
  /** What redo redoes, newest first: the last is next. */
  readonly redo: readonly HistoryEntry[];
  /**
   * The merge key the newest entry still takes changes under: set when a change with a key is
   * recorded, `null` again once anything else happens.
   */
  readonly merging: string | null;
  readonly nextSeq: number;
}

export type Direction = 'undo' | 'redo';

/** A change this session staged, as the history records it. */
export interface RecordedChange {
  readonly opId: string;
  readonly label: ChangeLabel;
  readonly merge: string | null;
  readonly shows: readonly PredictedOp[];
  readonly undo: readonly PredictedOp[];
}

export const emptyHistory = (): History => ({ undo: [], redo: [], merging: null, nextSeq: 0 });

/** The stack a step takes its entry from, and the one it puts it on. */
const stacksOf = (direction: Direction) =>
  direction === 'undo'
    ? ({ from: 'undo', to: 'redo' } as const)
    : ({ from: 'redo', to: 'undo' } as const);

/** The entry the next step of `direction` takes, or `null`. */
export const nextOf = (history: History, direction: Direction): HistoryEntry | null =>
  history[direction].at(-1) ?? null;

/**
 * A new change: it joins the newest entry when typing goes on under the same key, else it is a
 * new entry on top, and the oldest go past `limit`. Anything that could be redone is forgotten.
 */
export function recorded(history: History, change: RecordedChange, limit: number): History {
  const part: HistoryPart = {
    seq: history.nextSeq,
    id: change.opId,
    opId: change.opId,
    forward: change.shows,
    backward: change.undo,
  };
  const top = history.undo.at(-1);
  if (top && change.merge !== null && history.merging === change.merge) {
    return {
      undo: [...history.undo.slice(0, -1), { ...top, parts: [...top.parts, part] }],
      redo: [],
      merging: change.merge,
      nextSeq: history.nextSeq + 1,
    };
  }
  const entry: HistoryEntry = {
    seq: part.seq,
    label: change.label,
    merge: change.merge,
    parts: [part],
  };
  return {
    undo: [...history.undo, entry].slice(-Math.max(1, limit)),
    redo: [],
    merging: change.merge,
    nextSeq: history.nextSeq + 1,
  };
}

/**
 * A step was staged: the entry `seq` leaves the top of its stack for the top of the other, each
 * part now named by the change that staged it (`opIds`, by part id).
 */
export function stepped(
  history: History,
  direction: Direction,
  seq: number,
  opIds: ReadonlyMap<string, string>,
): History {
  const { from, to } = stacksOf(direction);
  const entry = history[from].find((candidate) => candidate.seq === seq);
  if (!entry) return history;
  const moved: HistoryEntry = {
    ...entry,
    parts: entry.parts.map((part) => ({ ...part, opId: opIds.get(part.id) ?? part.opId })),
  };
  return {
    ...history,
    [from]: history[from].filter((candidate) => candidate !== entry),
    [to]: [...history[to], moved],
    merging: null,
  } as History;
}

/** Every entry without the parts `drop` picks, and without the entries left with none. */
const withoutParts = (
  entries: readonly HistoryEntry[],
  drop: (part: HistoryPart) => boolean,
): readonly HistoryEntry[] => {
  let changed = false;
  const kept: HistoryEntry[] = [];
  for (const entry of entries) {
    const parts = entry.parts.filter((part) => !drop(part));
    if (parts.length === entry.parts.length) {
      kept.push(entry);
      continue;
    }
    changed = true;
    if (parts.length) kept.push({ ...entry, parts });
  }
  return changed ? kept : entries;
};

/**
 * The change `id` never happened (the engine refused it), or did nothing that can be undone:
 * its part goes, from whichever stack holds it.
 */
export function forgotten(history: History, id: string): History {
  const undo = withoutParts(history.undo, (part) => part.id === id);
  const redo = withoutParts(history.redo, (part) => part.id === id);
  return undo === history.undo && redo === history.redo ? history : { ...history, undo, redo };
}

/**
 * The engine refused one change of a step, so that part didn't move: it goes back where it
 * was, as `part` was before the step, into its entry there (or a new one with the entry's
 * number, in its place), wherever a later step had put it since. Its other parts stay where
 * the step put them.
 */
export function stepRefused(
  history: History,
  direction: Direction,
  entry: Pick<HistoryEntry, 'seq' | 'label' | 'merge'>,
  part: HistoryPart,
): History {
  const { from } = stacksOf(direction);
  const { undo, redo } = forgotten(history, part.id);
  const left = { undo, redo };
  const back = [...left[from]];
  const at = back.findIndex((candidate) => candidate.seq === entry.seq);
  if (at >= 0) {
    const parts = [...back[at]!.parts, part].sort((left, right) => left.seq - right.seq);
    back[at] = { ...back[at]!, parts };
  } else {
    // The undo stack is oldest first, the redo stack newest first.
    const before = (candidate: HistoryEntry) =>
      from === 'undo' ? candidate.seq < entry.seq : candidate.seq > entry.seq;
    const index = back.filter(before).length;
    back.splice(index, 0, { ...entry, parts: [part] });
  }
  return { ...history, ...left, [from]: back, merging: null };
}

/**
 * The engine can no longer undo the entry `seq` (a final change or a new version came after
 * it, or it is too old): it goes, and so does everything recorded before it.
 */
export function unavailable(history: History, seq: number): History {
  const newer = (entry: HistoryEntry) => entry.seq > seq;
  return {
    ...history,
    undo: history.undo.filter(newer),
    redo: history.redo.filter(newer),
    merging: null,
  };
}

/** Nothing can be undone or redone. */
export const cleared = (history: History): History =>
  history.undo.length === 0 && history.redo.length === 0 && history.merging === null
    ? history
    : { ...history, undo: [], redo: [], merging: null };
