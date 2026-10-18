/**
 * An engine whose documents hold every change until the test lets it go, so
 * a test sees what the reads show while a change is on its way.
 */
import type { DocumentHandle, Engine } from '@embedpdf/core';
import type { Change } from '@embedpdf/engine-core/runtime';

export interface HeldChange {
  readonly change: Change;
  readonly options: unknown;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

export interface Gate {
  readonly engine: Engine;
  /** The changes held so far, oldest first. */
  readonly held: HeldChange[];
  /** Whether changes are held; when not, they go straight to the engine. */
  holding: boolean;
  /** Send the oldest held change to the engine, and wait for its answer to land. */
  release(): Promise<void>;
  /** Refuse the oldest held change, as the engine would. */
  refuse(error: unknown): void;
}

export function gate(engine: Engine): Gate {
  const held: HeldChange[] = [];
  let inner: DocumentHandle | null = null;
  const state: Gate = {
    engine: null as unknown as Engine,
    held,
    holding: false,
    async release() {
      const next = held.shift();
      if (!next || !inner) throw new Error('nothing is held');
      await inner.apply(next.change, next.options as never).then(next.resolve, next.reject);
    },
    refuse(error) {
      const next = held.shift();
      if (!next) throw new Error('nothing is held');
      next.reject(error);
    },
  };
  const wrap = (doc: DocumentHandle): DocumentHandle =>
    new Proxy(doc, {
      get(target, prop) {
        if (prop === 'apply') {
          return (change: Change, options: unknown) =>
            state.holding
              ? new Promise((resolve, reject) => held.push({ change, options, resolve, reject }))
              : target.apply(change, options as never);
        }
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === 'with' && typeof value === 'function') {
          return (...args: unknown[]) => wrap(value.apply(target, args) as DocumentHandle);
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  (state as { engine: Engine }).engine = new Proxy(engine, {
    get(target, prop) {
      if (prop === 'open') {
        return async (...args: Parameters<Engine['open']>) => {
          const doc = await target.open(...args);
          inner = doc;
          return wrap(doc);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return state;
}
