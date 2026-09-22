import {
  creationDraftAnchor,
  update,
  type Effect,
  type Id,
  type Model,
  type Message,
} from '@embedpdf/core-annotation';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import { setModel } from '../model';
import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';

/** Performs one kind of effect against the engine; registered by the area that owns it. */
export type EffectRunner<K extends Effect['type']> = (
  effect: Extract<Effect, { type: K }>,
  model: Model,
) => void;

/**
 * The model store: the one door the annotation model changes through. The
 * pure `update` runs here so it can emit effects; the resulting model is
 * stored as plugin state, and each effect is handed to the runner its area
 * registered. The selection, draft and editing events are derived from each
 * state change.
 */
export interface AnnotationStore {
  /** The current model — what every read projects from. */
  model(): Model;
  /** Run one message through `update`, store the result, run its effects. */
  commit(message: Message): Effect[];
  /** Claim the effects an area performs (one runner per kind; last wins). */
  onEffect<K extends Effect['type']>(kind: K, runner: EffectRunner<K>): void;
}

/** The refs behind a list of model ids (uncommitted entries have none). */
export const refsOfIn = (model: Model, ids: readonly Id[]): AnnotationRef[] =>
  ids.map((id) => model.byId[id]?.ref ?? null).filter((ref): ref is AnnotationRef => ref != null);

const sameIds = (left: readonly Id[], right: readonly Id[]): boolean =>
  left === right || (left.length === right.length && left.every((id, i) => id === right[i]));

export function createStore(
  ctx: Pick<AnnotationContext, 'state'>,
  events: AnnotationEvents,
): AnnotationStore {
  // Keyed by effect type, so a runner only ever receives effects of its own kind.
  const runners = new Map<Effect['type'], (effect: Effect, model: Model) => void>();
  const model = (): Model => ctx.state.get().model;

  ctx.state.onChange(({ previous, next }) => {
    if (previous.model !== next.model) announceTransition(previous.model, next.model);
  });

  /** Fires the selection, draft and editing events for one model change. */
  const announceTransition = (previous: Model, next: Model): void => {
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
  };

  const commit = (message: Message): Effect[] => {
    const [next, effects] = update(model(), message);
    ctx.state.update(setModel, next);
    for (const effect of effects) runners.get(effect.type)?.(effect, next);
    return effects;
  };

  return {
    model,
    commit,
    onEffect: (kind, runner) => {
      runners.set(kind, (effect, next) =>
        runner(effect as Extract<Effect, { type: typeof kind }>, next),
      );
    },
  };
}
