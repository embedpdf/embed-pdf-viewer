/**
 * Record identity: the one place a record changes its key, which happens
 * when a new record is confirmed. It shows under the key of the `nm` ref its
 * create is written under (a fresh /NM), and the engine's record comes back
 * with that /NM under its real key. Whichever arrives first (the event in the
 * records mirror, or the write's own result) confirms it. A confirmed record
 * keeps its key for life.
 *
 * `follow` moves everything keyed by the record: the session (selection,
 * hover, text editing, the gesture), its pending changes, its render
 * preference and text range, and whatever an area keeps per record
 * (`onFollow`: text waiting for its write, a link sync in progress).
 *
 * A new record's create change follows it too, and settles as soon as the
 * records mirror holds the record (`settleHeldCreates`): until then (the
 * write's result can arrive while a page read that started earlier is still
 * running) it keeps the record on screen; from then on only the mirror says
 * whether the record exists.
 *
 * A write to a record runs through `withRef`: at once for a record the engine
 * has confirmed, after its create for a new one.
 */
import { PluginError, type Mirror } from '@embedpdf/core';
import { refOf, type Id } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import { followRecord, writeSettled } from '../model';
import type { AnnotationContext } from './context';
import type { AnnotationStore } from './store';
import type { View } from '../read/view';
import type { AnnotationRecords } from '../sync/records';

interface Waiter {
  resolve(ref: AnnotationRef): void;
  reject(error: unknown): void;
}

export function createRecordIdentity(
  ctx: Pick<AnnotationContext, 'state' | 'watch'>,
  store: Pick<AnnotationStore, 'commit'>,
  view: Pick<View, 'view'>,
  records: Pick<Mirror<AnnotationRecords>, 'get'>,
) {
  /** New records whose create is in flight: the /NM the create carries → the record's id. */
  const byName = new Map<string, Id>();
  /** New records whose create is in flight, and the writes waiting for their ref. */
  const waiting = new Map<Id, Waiter[]>();
  const followers: ((from: Id, to: Id) => void)[] = [];

  /** The record `from` is the record `to` now: everything keyed by it moves. */
  const follow = (from: Id, to: Id, ref: AnnotationRef): void => {
    // The session moves first, while both keys are in the view; then the
    // record's pending changes, render preference and text range.
    store.commit({ type: 'rekey', from, to });
    ctx.state.update(followRecord, from, to, ref);
    for (const follower of followers) follower(from, to);
  };

  /** Keep something keyed by record in step with `follow`. */
  const onFollow = (follower: (from: Id, to: Id) => void): void => {
    followers.push(follower);
  };

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
    const waiters = waiting.get(id);
    if (!waiters) return;
    waiting.delete(id);
    forgetName(id);
    follow(id, annotationKey(ref), ref);
    for (const waiter of waiters) waiter.resolve(ref);
  };

  /** A confirmed record carrying the /NM of one of ours: confirm it. */
  const confirmByName = (nm: string | null, ref: AnnotationRef): void => {
    const id = nm === null ? undefined : byName.get(nm);
    if (id !== undefined) confirm(id, ref);
  };

  /** Settle the create change of every new record the records mirror holds now. */
  const settleHeldCreates = (): void => {
    const { byKey } = records.get();
    const held = ctx.state
      .get()
      .pending.flatMap(({ token, id, change }) =>
        change.kind === 'create' && id in byKey ? [token] : [],
      );
    if (held.length) ctx.state.update(writeSettled, held, 'accepted');
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

  /** The ref of a confirmed new record the mirror does not hold yet: its create change has it. */
  const confirmedCreateRef = (id: Id): AnnotationRef | null => {
    for (const { id: changed, change } of ctx.state.get().pending) {
      const ref = changed === id && change.kind === 'create' ? refOf(change.record) : null;
      if (ref) return ref;
    }
    return null;
  };

  /**
   * Run a write that needs the record's engine ref: at once (in this call)
   * for a record the engine has confirmed, so writes keep the order they
   * were made in; once its create is confirmed for a new one. Rejects for a
   * record that neither exists nor is being created, and when its create is
   * refused.
   */
  const withRef = <T>(id: Id, write: (ref: AnnotationRef) => Promise<T>): Promise<T> => {
    const ref = records.get().byKey[id]?.dto.ref ?? confirmedCreateRef(id);
    if (ref) return write(ref);
    const waiters = waiting.get(id);
    if (!waiters) {
      return Promise.reject(new PluginError('not-found', 'annotation', `no annotation ${id}`));
    }
    return new Promise<AnnotationRef>((resolve, reject) => waiters.push({ resolve, reject })).then(
      write,
    );
  };

  // Session references follow the view. A record that left the view
  // (deleted elsewhere, a refused create, a page read again) leaves the
  // selection, the hover and the text editor, and a gesture on it ends.
  ctx.watch(view.view, (next, previous) => {
    const gone = previous.order.filter((id) => !(id in next.byId));
    if (gone.length) store.commit({ type: 'forget', ids: gone });
  });

  return { onFollow, expect, confirm, confirmByName, settleHeldCreates, abandon, withRef };
}

export type RecordIdentity = ReturnType<typeof createRecordIdentity>;
