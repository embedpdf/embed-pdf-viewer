/**
 * The store: the one door every user action goes through.
 *
 *   commit(message)
 *     → update(model, message)            the core: next session, change set, effects
 *     → intents.begin(result)             the change shows at once (state: session + pending)
 *     → effect runners                    each effect becomes an engine write
 *     → intents.run(writes)               the writes run; their entries settle when they do
 *
 * The model it hands out is the view's (read/view.ts): confirmed records with
 * the pending changes on top, composed with the session.
 */
import {
  creationDraftAnchor,
  update,
  type AnnotationView,
  type Effect,
  type Id,
  type Model,
  type Message,
} from '@embedpdf/core-annotation';
import { positionKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';
import type { IntentOutcome, Intents, IntentWrite } from './intents';
import { followRecord } from '../model';
import type { View } from '../read/view';

/**
 * Turns one kind of effect into the engine write it asks for, reading the
 * records it names from `model` (which already shows the change). Registered
 * by the area that owns the kind. Returns nothing when there is nothing to write.
 */
export type EffectRunner<K extends Effect['type']> = (
  effect: Extract<Effect, { type: K }>,
  model: Model,
) => IntentWrite | void;

/** What committing a message started. */
export interface Commit {
  readonly effects: readonly Effect[];
  /** Settles when every engine write the message started has settled. Never rejects. */
  readonly written: Promise<IntentOutcome>;
}

export interface AnnotationStore {
  /** The current model: what every read and gesture works on. */
  model(): Model;
  /** Run one message through the core, show its change, and start its engine writes. */
  commit(message: Message): Commit;
  /** Claim the effects an area performs (one runner per kind; last wins). */
  onEffect<K extends Effect['type']>(kind: K, runner: EffectRunner<K>): void;
}

/** The refs behind a list of model ids (records not yet confirmed have none). */
export const refsOfIn = (model: Model, ids: readonly Id[]): AnnotationRef[] =>
  ids.map((id) => model.byId[id]?.ref ?? null).filter((ref): ref is AnnotationRef => ref != null);

const sameIds = (left: readonly Id[], right: readonly Id[]): boolean =>
  left === right || (left.length === right.length && left.every((id, i) => id === right[i]));

/**
 * Weak records (addressed by their position on the page) that the engine
 * named between two views: gone under their position key, present under a
 * new key at the same position.
 */
function renamesBetween(previous: AnnotationView, next: AnnotationView): Map<Id, Id> {
  const appearedAt = new Map<string, Id>();
  for (const id of next.order) {
    const record = next.byId[id];
    if (!(id in previous.byId) && record?.data) {
      appearedAt.set(positionKey(record.page, record.data.index), id);
    }
  }
  const renamed = new Map<Id, Id>();
  for (const id of previous.order) {
    const to = previous.byId[id]?.ref?.kind === 'index' ? appearedAt.get(id) : undefined;
    if (to !== undefined && !(id in next.byId)) renamed.set(id, to);
  }
  return renamed;
}

export function createStore(
  ctx: Pick<AnnotationContext, 'state' | 'watch'>,
  view: View,
  intents: Intents,
  events: AnnotationEvents,
): AnnotationStore {
  // Keyed by effect type, so a runner only ever receives effects of its own kind.
  const runners = new Map<Effect['type'], (effect: Effect, model: Model) => IntentWrite | void>();
  const model = view.model;

  const commit = (message: Message): Commit => {
    const before = model();
    const result = update(before, message);
    const staged = intents.begin(before, result);
    const writes: IntentWrite[] = [];
    for (const effect of result.effects) {
      const write = runners.get(effect.type)?.(effect, model());
      if (write) writes.push(write);
    }
    return { effects: result.effects, written: intents.run(staged, writes) };
  };

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
        ref: next.editing ? (next.byId[next.editing]?.ref ?? null) : null,
      });
    }
  });

  // Session references follow the view. A weak record the engine named is
  // the same record under a new key: the session and its pending changes
  // follow it. Any other record that left the view (deleted elsewhere, a
  // refused create, a page read again) leaves the selection, the hover and
  // the text editor, and a gesture on it ends.
  ctx.watch(view.view, (next, previous) => {
    const gone = previous.order.filter((id) => !(id in next.byId));
    if (!gone.length) return;
    const renamed = renamesBetween(previous, next);
    for (const [from, to] of renamed) {
      commit({ type: 'rekey', from, to });
      ctx.state.update(followRecord, from, to);
    }
    const forgotten = gone.filter((id) => !renamed.has(id));
    if (forgotten.length) commit({ type: 'forget', ids: forgotten });
  });

  return {
    model,
    commit,
    onEffect: (kind, runner) => {
      runners.set(kind, (effect, current) =>
        runner(effect as Extract<Effect, { type: typeof kind }>, current),
      );
    },
  };
}
