import {
  creationDraftAnchor,
  update,
  type Effect,
  type Id,
  type Model,
  type Msg,
} from '@embedpdf/core-annotation';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from './context';
import type { AnnotationEvents } from './events';

/** Performs one kind of effect against the engine; registered by the area that owns it. */
export type EffectRunner<K extends Effect['fx']> = (
  fx: Extract<Effect, { fx: K }>,
  model: Model,
) => void;

/**
 * The model store: the ONE door the annotation model changes through. The
 * pure `update` runs here so it can emit effects; the resulting model is
 * dispatched to the kernel store, each effect is handed to the runner its
 * area registered, and the transition is announced (selection, draft and
 * editing events).
 */
export interface AnnotationStore {
  /** The current model — what every read projects from. */
  model(): Model;
  /** Run one message through `update`, store the result, run its effects. */
  commit(msg: Msg): Effect[];
  /** Claim the effects an area performs (one runner per kind; last wins). */
  onEffect<K extends Effect['fx']>(kind: K, runner: EffectRunner<K>): void;
}

/** The refs behind a list of model ids (uncommitted entries have none). */
export const refsOfIn = (m: Model, ids: readonly Id[]): AnnotationRef[] =>
  ids.map((id) => m.byId[id]?.ref ?? null).filter((r): r is AnnotationRef => r != null);

const sameIds = (a: readonly Id[], b: readonly Id[]): boolean =>
  a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

export function createStore(
  ctx: Pick<AnnotationContext, 'getState' | 'dispatch'>,
  events: AnnotationEvents,
): AnnotationStore {
  const runners: { [K in Effect['fx']]?: EffectRunner<K> } = {};
  const model = (): Model => ctx.getState().model;

  /** Fires the selection / draft / editing events for one model transition. */
  const announceTransition = (prev: Model, next: Model): void => {
    if (!sameIds(prev.selected, next.selected)) {
      events.selectionChanged.emit({
        refs: refsOfIn(next, next.selected),
        previousRefs: refsOfIn(prev, prev.selected),
      });
    }
    if (prev.draft !== next.draft) events.draftChanged.emit({ draft: creationDraftAnchor(next) });
    if (prev.editing !== next.editing) {
      events.editingChanged.emit({
        ref: next.editing ? (next.byId[next.editing]?.ref ?? null) : null,
      });
    }
  };

  const commit = (msg: Msg): Effect[] => {
    const prev = model();
    const [next, effects] = update(prev, msg);
    ctx.dispatch({ type: 'SET_MODEL', model: next });
    for (const fx of effects) {
      const run = runners[fx.fx] as EffectRunner<typeof fx.fx> | undefined;
      run?.(fx as never, next);
    }
    announceTransition(prev, next);
    return effects;
  };

  return {
    model,
    commit,
    onEffect: (kind, runner) => {
      runners[kind] = runner as never;
    },
  };
}
