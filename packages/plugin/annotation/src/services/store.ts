/**
 * The store: the two doors every change goes through, and one path behind them.
 *
 *   commit(message)                       a gesture or a selection verb
 *     → update(model, message)            the core: next session, change set, effects
 *     → op builders                       each effect becomes the engine's ops
 *
 *   apply(changes)                        a change stated in code (the API, comments, links…)
 *     → each change checked by the engine's own rules, as its op
 *
 *   → ctx.changes.stage(…)                one door, one change: the view shows it at once
 *                                         (the records mirror predicts it), and the queue
 *                                         sends it after everything staged before it
 *
 * A change leaves the view once the engine answered: applied, the records
 * hold it; refused, the view shows the engine's records again. New records
 * are named by the object numbers they take, so a record keeps its key from
 * its first frame, and a later change to it is simply staged after its create.
 *
 * The model it hands out is the view's (read/view.ts).
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type ChangeLabel,
  type HeldChange,
  type HoldOptions,
  type Mirror,
  type PendingChange,
} from '@embedpdf/core';
import {
  creationDraftAnchor,
  type Effect,
  type Id,
  type Message,
  type Model,
  newRecordsAtMost,
  refOf,
  update,
  type UpdateResult,
} from '@embedpdf/core-annotation';
import {
  type Annotation,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationPosition,
  type AnnotationRef,
  type AnnotationResources,
  type ChangeOp,
  type ChangeResult,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';
import { createObjectNumbers } from './object-numbers';
import { createSelectionHistory } from './selection-history';
import {
  checkedOpOf,
  idsOf,
  labelOf,
  modelAfter,
  modelOver,
  withFollowUps,
  withoutCoveredDeletes,
  type FollowUp,
} from './staging';
import { withSession } from '../model';
import type { View } from '../read/view';
import { predictRecords, undoOf, type AnnotationRecords } from '../sync/records';

/**
 * Turns one kind of effect into the engine's ops, reading the records it
 * names from `model`, the message's result (a record it deleted is in
 * `before`). Registered by the area that owns the kind; one that writes
 * nothing (a captured drawing) returns nothing. A create it adds without an
 * object number gets one from the store.
 */
export type OpBuilder<K extends Effect['type']> = (
  effect: Extract<Effect, { type: K }>,
  model: Model,
  before: Model,
) => readonly ChangeOp[] | void;

/** How a change the store staged settled. Never a rejection: a refusal is data. */
export interface Written {
  /** The engine's refusal, with the records the change named; empty when it applied or wrote nothing. */
  readonly failed: readonly { readonly ids: readonly Id[]; readonly error: PluginError }[];
  /** What the engine answered, one item per op; `null` when it was refused or wrote nothing. */
  readonly result: ChangeResult | null;
}

/** What committing a message started. */
export interface Commit {
  readonly effects: readonly Effect[];
  /** Settles when the engine answered the message's change. */
  readonly written: Promise<Written>;
}

/**
 * A change stated in code, in the engine's own terms. A create takes an
 * object number, its record is keyed by it, and a later change in the same
 * call can name it.
 */
export type StoreChange =
  | {
      readonly type: 'create';
      readonly page: PageRef;
      readonly draft: AnnotationDraft;
      readonly resources?: AnnotationResources;
    }
  | {
      readonly type: 'update';
      readonly ref: AnnotationRef;
      readonly patch: AnnotationPatch;
      readonly resources?: AnnotationResources;
    }
  | { readonly type: 'delete'; readonly ref: AnnotationRef }
  /** Drawing order: the annotations go together to `position` among the page's others. */
  | {
      readonly type: 'reorder';
      readonly page: PageRef;
      readonly refs: readonly AnnotationRef[];
      readonly position: AnnotationPosition;
    };

export interface ApplyOptions {
  readonly select?: boolean;
}

/** What applying stated changes started: the record each change names, in order. */
export interface Applied {
  readonly ids: readonly Id[];
  /** Settles when the engine answered. */
  readonly written: Promise<AppliedOutcome>;
}

/** How stated changes settled, and what the engine wrote for each. */
export interface AppliedOutcome extends Written {
  /**
   * The annotation each create or update left, as the engine read it back, in
   * the order of the changes. `null` for a delete, a reorder, a change with
   * nothing to write, and a refused one.
   */
  readonly annotations: readonly (Annotation | null)[];
}

/**
 * A change still being made, as typing is: every commit into it replaces its
 * ops, and nothing is sent until it is (after a pause), or until anything
 * else is staged.
 */
export interface StoreHold {
  /** Whether a commit can still go into it. Once it was sent, typing goes on in a new one. */
  readonly open: boolean;
  send(): void;
  cancel(): void;
}

export interface AnnotationStore {
  /** The current model: what every read and gesture works on. */
  model(): Model;
  /**
   * Run one message through the core and stage its change: it shows at once
   * and is sent in turn. Throws, before anything shows, for a message the
   * engine would refuse (a `rect` with a new shape), as `apply` does.
   * `adjust` changes the core's result before it shows: a tool's
   * `afterCreate` decides whether what it just made is selected
   * (write/after-create.ts). `into` makes the message part of a change still
   * being made (typing).
   *
   * A message that may create needs object numbers. When the document's pool
   * has none left (rare: it refills as it goes), the message runs once it
   * has; its commit then reports no effects, and `written` settles after it ran.
   */
  commit(
    message: Message,
    options?: { adjust?: (result: UpdateResult) => UpdateResult; into?: StoreHold },
  ): Commit;
  /**
   * Show changes stated in code at once, as one change, exactly like a
   * gesture's. Throws, before anything shows, for a change the engine would
   * refuse, a record the view doesn't have, or, when the document's pool is
   * out of object numbers, a create (`applyWhenNumbered` waits for them).
   * `select`: the records it names are selected as they show.
   */
  apply(changes: readonly StoreChange[], options?: ApplyOptions): Applied;
  /** `apply`, once the object numbers its creates take are there: at once, in this call, when they are. */
  applyWhenNumbered(changes: readonly StoreChange[], options?: ApplyOptions): Promise<Applied>;
  /**
   * A change that later commits go into (`commit(…, { into })`); its label names it in history,
   * and consecutive holds with the same `merge` key are one step of it.
   */
  hold(label: ChangeLabel, options?: HoldOptions): StoreHold;
  /** Claim the ops of one kind of effect (one builder per kind; last wins). */
  onEffect<K extends Effect['type']>(kind: K, build: OpBuilder<K>): void;
  /** Claim what follows an update (one; last wins). */
  onUpdate(followUp: FollowUp): void;
  /** Resolves once every change staged so far has its answer. */
  whenWritten(): Promise<void>;
}

/** The refs behind a list of model ids. */
export const refsOfIn = (model: Model, ids: readonly Id[]): AnnotationRef[] =>
  ids.map((id) => refOf(model.byId[id])).filter((ref): ref is AnnotationRef => ref != null);

const sameIds = (left: readonly Id[], right: readonly Id[]): boolean =>
  left === right || (left.length === right.length && left.every((id, i) => id === right[i]));

const NOTHING_WRITTEN: Written = { failed: [], result: null };

const noNumbers = (): PluginError =>
  new PluginError(
    'not-ready',
    'annotation',
    'the document holds no object number for a new annotation right now',
  );

export function createStore(
  ctx: Pick<AnnotationContext, 'state' | 'changes' | 'doc' | 'watch'>,
  view: View,
  records: Pick<Mirror<AnnotationRecords>, 'view'>,
  events: AnnotationEvents,
): AnnotationStore {
  let followUp: FollowUp | null = null;
  // Keyed by effect type, so a builder only ever receives effects of its own kind.
  const builders = new Map<
    Effect['type'],
    (effect: Effect, model: Model, before: Model) => readonly ChangeOp[] | void
  >();
  const model = view.model;

  /** The changes this plugin staged that the engine hasn't answered: their refusals are reported. */
  const mine = new Set<string>();
  ctx.changes.onSettled((settled) => {
    if (!mine.delete(settled.change.opId) || settled.status !== 'refused') return;
    if (settled.error.code === 'operation-cancelled' || settled.error.code === 'instance-closed') {
      return;
    }
    const refs = settled.change.shows.flatMap((op) =>
      op.type === 'annotations.create' && op.objectNumber !== undefined
        ? [{ kind: 'objectNumber' as const, page: op.page, objectNumber: op.objectNumber }]
        : op.type === 'annotations.update' || op.type === 'annotations.delete'
          ? [op.ref]
          : op.type === 'annotations.reorder'
            ? [...op.refs]
            : [],
    );
    events.writeFailed.emit({ refs, error: toPluginErrorInfo(settled.error) });
  });

  /** How a staged change settles, for the records it names. */
  const writtenOf = (change: PendingChange, ids: readonly Id[]): Promise<Written> =>
    change.result.then(
      (result): Written => ({ failed: [], result }),
      (error: unknown): Written => ({
        failed: [{ ids, error: toPluginError('annotation', error) }],
        result: null,
      }),
    );

  const stage = (ops: readonly ChangeOp[], before: AnnotationRecords): PendingChange => {
    const change = ctx.changes.stage({ label: labelOf(ops), ops, undo: undoOf(before, ops) });
    mine.add(change.opId);
    return change;
  };

  const numbers = createObjectNumbers(ctx);
  const selections = createSelectionHistory(ctx, { model, commit: (message) => commit(message) });

  /* ── the doors ───────────────────────────────────────────────────────── */

  /** A change being made, and the records from before its first commit (what undoing it brings back). */
  interface Hold extends StoreHold {
    readonly held: HeldChange;
    base: AnnotationRecords | null;
  }

  const hold = (label: ChangeLabel, options?: HoldOptions): StoreHold => {
    const held = ctx.changes.hold(label, options);
    const entry: Hold = {
      held,
      base: null,
      get open() {
        return held.open;
      },
      send: () => void held.send(),
      cancel: () => {
        if (held.change) mine.delete(held.change.opId);
        held.cancel();
      },
    };
    return entry;
  };

  const commit: AnnotationStore['commit'] = (message, options = {}) => {
    const needed = newRecordsAtMost(message);
    if (needed > 0 && !numbers.hold(needed)) return commitWhenNumbered(message, options, needed);
    const before = model();
    // A message the engine would refuse (a `rect` with a new shape) throws
    // before anything shows, as a stated change does.
    let result: UpdateResult;
    try {
      result = update(before, message);
    } catch (error) {
      throw toPluginError('annotation', error);
    }
    if (options.adjust) result = options.adjust(result);
    const after = modelAfter(before, result);
    const shown = records.view();
    const built = withFollowUps(
      result.effects.flatMap((effect) => builders.get(effect.type)?.(effect, after, before) ?? []),
      followUp,
      after,
    );
    const named = numbers.named(built, result.session.objectNumbers);
    const ops = withoutCoveredDeletes(shown, named.ops);
    if (named.held !== result.session.objectNumbers) {
      result = { ...result, session: { ...result.session, objectNumbers: named.held } };
    }
    let written = Promise.resolve(NOTHING_WRITTEN);
    if (ops.length) {
      const into = options.into as Hold | undefined;
      if (into) {
        // Typing: the change keeps its place, its ops are the latest, and
        // undoing it brings back what was there before its first keystroke.
        into.base ??= shown;
        into.held.set(ops, undoOf(into.base, ops));
        const change = into.held.change;
        if (change) {
          mine.add(change.opId);
          selections.remember(change.opId, before.selected, result.session.selected);
          written = writtenOf(change, idsOf(ops));
        }
      } else {
        const change = stage(ops, shown);
        selections.remember(change.opId, before.selected, result.session.selected);
        written = writtenOf(change, idsOf(ops));
      }
    }
    // The records this message drew live render live from now on.
    const vector = result.change.put
      .filter((record) => record.source === 'vector')
      .map((record) => record.id);
    ctx.state.update(withSession, result.session, vector);
    return { effects: result.effects, written };
  };

  /** A message that may create, run once the pool has the numbers it needs. */
  const commitWhenNumbered = (
    message: Message,
    options: Parameters<AnnotationStore['commit']>[1],
    needed: number,
  ): Commit => {
    // A gesture that moved on meanwhile (another press) made nothing to finish.
    const draft = model().draft;
    const written = ctx.changes.reserveObjectNumbers(needed).then(
      () => (model().draft === draft ? commit(message, options).written : NOTHING_WRITTEN),
      (error: unknown): Written => ({
        failed: [{ ids: [], error: toPluginError('annotation', error) }],
        result: null,
      }),
    );
    return { effects: [], written };
  };

  const apply: AnnotationStore['apply'] = (changes, options = {}) => {
    // Everything is worked out before anything shows: one refused change
    // stages none. Each change is worked out against the ones before it, as
    // the engine will apply them.
    const shown = records.view();
    const creates = changes.filter((change) => change.type === 'create').length;
    const taken = creates ? numbers.take(creates) : [];
    if (!taken) throw noNumbers();
    const ops: ChangeOp[] = [];
    /** Where each change's op is among `ops`, or -1 for a change that writes nothing. */
    const opIndex: number[] = [];
    const ids: Id[] = [];
    const vector: Id[] = [];
    let current = shown;
    try {
      for (const change of changes) {
        const op = checkedOpOf(change, current, taken, (id) => model().byId[id]);
        ids.push(op.id);
        opIndex.push(op.op ? ops.length : -1);
        if (!op.op) continue;
        ops.push(op.op);
        if (op.live) vector.push(op.id);
        current = predictRecords(current, op.op);
      }
    } catch (error) {
      throw toPluginError('annotation', error);
    }
    if (!ops.length) {
      return {
        ids,
        written: Promise.resolve({ ...NOTHING_WRITTEN, annotations: changes.map(() => null) }),
      };
    }
    // What follows each update joins the change, after the ops stated (the
    // answer's items stay in the order of the changes).
    const following = numbers.named(
      withFollowUps(ops, followUp, modelOver(model(), shown, current)).filter(
        (op) => !ops.includes(op),
      ),
      ctx.state.get().session.objectNumbers,
    );
    if (following.held !== ctx.state.get().session.objectNumbers) {
      ctx.state.update((state) => ({
        ...state,
        session: { ...state.session, objectNumbers: following.held },
      }));
    }
    const selected = model().selected;
    const change = stage(withoutCoveredDeletes(shown, [...ops, ...following.ops]), shown);
    selections.remember(change.opId, selected, options.select ? ids : selected);
    if (vector.length) ctx.state.update(withSession, ctx.state.get().session, vector);
    if (options.select) commit({ type: 'select', ids });
    const written = writtenOf(change, idsOf(ops)).then(
      (outcome): AppliedOutcome => ({
        ...outcome,
        annotations: opIndex.map((index) => {
          const item = index < 0 ? undefined : outcome.result?.items[index];
          return item && 'annotation' in item ? (item.annotation as Annotation) : null;
        }),
      }),
    );
    return { ids, written };
  };

  const applyWhenNumbered: AnnotationStore['applyWhenNumbered'] = async (changes, options) => {
    const creates = changes.filter((change) => change.type === 'create').length;
    while (!numbers.hold(creates)) await ctx.changes.reserveObjectNumbers(creates);
    return apply(changes, options);
  };

  // Session references follow the view. A record that left the view (deleted
  // elsewhere, a refused create, a page read again) leaves the selection, the
  // hover and the text editor, and a gesture on it ends.
  ctx.watch(view.view, (next, previous) => {
    const gone = previous.order.filter((id) => !(id in next.byId));
    if (gone.length) commit({ type: 'forget', ids: gone });
  });

  // The selection, draft and editing events, derived from each change of the
  // model's session (a record leaving the view changes the session too, via `forget`).
  let announced = model();
  ctx.state.onChange(() => {
    const next = model();
    const previous = announced;
    announced = next;
    if (!sameIds(previous.selected, next.selected)) {
      events.selectionChanged.emit({
        refs: refsOfIn(next, next.selected),
        previousRefs: refsOfIn(previous, previous.selected),
      });
    }
    if (previous.draft !== next.draft)
      events.draftChanged.emit({ draft: creationDraftAnchor(next) });
    if (previous.editing !== next.editing) {
      events.editingChanged.emit({
        ref: next.editing ? refOf(next.byId[next.editing]) : null,
      });
    }
    if (previous.hovered !== next.hovered) {
      events.hoverChanged.emit({
        ref: next.hovered ? refOf(next.byId[next.hovered]) : null,
      });
    }
  });

  return {
    model,
    commit,
    apply,
    applyWhenNumbered,
    hold,
    onUpdate: (next) => {
      followUp = next;
    },
    onEffect: (kind, build) => {
      builders.set(kind, (effect, current, before) =>
        build(effect as Extract<Effect, { type: typeof kind }>, current, before),
      );
    },
    whenWritten: () => ctx.changes.whenSettled(),
  };
}
