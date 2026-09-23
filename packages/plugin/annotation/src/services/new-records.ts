/**
 * Records this session created that the engine has not confirmed yet. A new
 * record shows under a `new:<n>` id; its create carries a fresh /NM, and the
 * confirmed record comes back with that /NM under its real key. Whichever
 * arrives first (the event in the records mirror, or the write's own result
 * for an engine that does not echo /NM) confirms it: the selection, hover and
 * text editing move to the real key, and so do the record's pending changes.
 *
 * A write to a new record (an edit or a delete made before the engine
 * confirmed it) runs through `withRef`, which waits for the create.
 */
import { PluginError, type Mirror } from '@embedpdf/core';
import type { Id } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import { followRecord } from '../model';
import type { AnnotationContext } from './context';
import type { AnnotationStore } from './store';
import type { AnnotationRecords } from '../sync/records';

interface Waiter {
  resolve(ref: AnnotationRef): void;
  reject(error: unknown): void;
}

export function createNewRecords(
  ctx: Pick<AnnotationContext, 'state'>,
  store: Pick<AnnotationStore, 'commit'>,
  records: Pick<Mirror<AnnotationRecords>, 'get'>,
) {
  /** New records whose create is in flight: the /NM the create carries → the record's id. */
  const byName = new Map<string, Id>();
  /** New records whose create is in flight, and the writes waiting for their ref. */
  const waiting = new Map<Id, Waiter[]>();
  /** New records the engine confirmed: their id → the confirmed ref. */
  const confirmedAs = new Map<Id, AnnotationRef>();

  /** Remember that the create carrying `nm` writes the new record `id`. */
  const expect = (nm: string, id: Id): void => {
    byName.set(nm, id);
    if (!waiting.has(id)) waiting.set(id, []);
  };

  const forgetName = (id: Id): void => {
    for (const [nm, candidate] of byName) if (candidate === id) byName.delete(nm);
  };

  /** The new record `id` is the engine's record `ref` now. Once per record. */
  const confirm = (id: Id, ref: AnnotationRef): void => {
    if (confirmedAs.has(id)) return;
    forgetName(id);
    confirmedAs.set(id, ref);
    const key = annotationKey(ref);
    // The session follows first, while both ids are in the view; then the
    // record's pending changes follow and its `create` goes.
    store.commit({ type: 'rekey', from: id, to: key });
    ctx.state.update(followRecord, id, key);
    const waiters = waiting.get(id) ?? [];
    waiting.delete(id);
    for (const waiter of waiters) waiter.resolve(ref);
  };

  /** A confirmed record carrying the /NM of one of ours: confirm it. */
  const confirmByName = (nm: string | null, ref: AnnotationRef): void => {
    const id = nm === null ? undefined : byName.get(nm);
    if (id !== undefined) confirm(id, ref);
  };

  /** The create of `id` failed: the writes waiting for it fail too. */
  const abandon = (id: Id): void => {
    forgetName(id);
    const waiters = waiting.get(id) ?? [];
    waiting.delete(id);
    const error = new PluginError(
      'operation-failed',
      'annotation',
      'the annotation was never created: its create was refused',
    );
    for (const waiter of waiters) waiter.reject(error);
  };

  /** The engine ref of a record the engine has confirmed, or null. */
  const refNow = (id: Id): AnnotationRef | null =>
    records.get().byKey[id]?.dto.ref ?? confirmedAs.get(id) ?? null;

  /**
   * Run a write that needs the record's engine ref: at once (in this call)
   * for a record the engine has confirmed, so writes keep the order they
   * were made in; once its create is confirmed for a new one. Rejects for a
   * record that neither exists nor is being created, and when its create is
   * refused.
   */
  const withRef = <T>(id: Id, write: (ref: AnnotationRef) => Promise<T>): Promise<T> => {
    const ref = refNow(id);
    if (ref) return write(ref);
    const waiters = waiting.get(id);
    if (!waiters) {
      return Promise.reject(new PluginError('not-found', 'annotation', `no annotation ${id}`));
    }
    return new Promise<AnnotationRef>((resolve, reject) => waiters.push({ resolve, reject })).then(
      write,
    );
  };

  return { expect, confirm, confirmByName, abandon, withRef };
}

export type NewRecords = ReturnType<typeof createNewRecords>;
