/**
 * The thin React binding. One store wrapping the pure `update`; one hook over
 * useSyncExternalStore. The same ~25 lines would be a Svelte store, a Vue ref,
 * or an Angular signal — the brain (core/) is identical across all four.
 */
import { useRef, useSyncExternalStore } from 'react';
import { Effect, Model, Msg, initialModel } from '../core/model';
import { update } from '../core/update';

export function createStore(seed: Model = initialModel) {
  let model = seed;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  // The ONE impure seam. In the real plugin this calls the AnnotationRepository
  // (local PDFium engine or cloud layer service). Here we just log it — the model
  // already changed optimistically inside `update`.
  const perform = (fx: Effect) => console.debug('[persist]', fx.fx, fx);

  return {
    getModel: () => model,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    dispatch: (msg: Msg) => {
      const [next, effects] = update(model, msg);
      model = next;
      effects.forEach(perform);
      emit();
    },
  };
}

export type Store = ReturnType<typeof createStore>;

/** Selector hook. Caches per model identity so getSnapshot is stable across renders. */
export function useModel<T>(store: Store, select: (m: Model) => T): T {
  const cache = useRef<{ model: Model; v: T } | null>(null);
  const get = () => {
    const model = store.getModel();
    if (cache.current && cache.current.model === model) return cache.current.v;
    const v = select(model);
    cache.current = { model, v };
    return v;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}
