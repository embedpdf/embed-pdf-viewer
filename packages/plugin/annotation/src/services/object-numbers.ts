/**
 * The object numbers new records take: the session holds a few for the next
 * creates (`Session.objectNumbers`), taken from the document's pool
 * (`ctx.changes`) as a message needs them. A number the engine reclaims
 * leaves the session too.
 */
import type { ChangeOp } from '@embedpdf/engine-core/runtime';

import { withObjectNumbers, withoutObjectNumbers } from '../model';
import type { AnnotationContext } from './context';

export function createObjectNumbers(ctx: Pick<AnnotationContext, 'state' | 'changes' | 'doc'>) {
  let watchingLost = false;
  /** Numbers the engine reclaimed leave the session too: a create naming one would be refused. */
  const watchLost = (): void => {
    if (watchingLost || !ctx.doc) return;
    watchingLost = true;
    ctx.doc.objectNumbers.onLost(({ numbers }) => ctx.state.update(withoutObjectNumbers, numbers));
  };

  /** Make the session hold `count` object numbers, from the document's pool; false when it has too few. */
  const hold = (count: number): boolean => {
    const held = ctx.state.get().session.objectNumbers.length;
    if (held >= count) return true;
    watchLost();
    const taken: number[] = [];
    while (held + taken.length < count) {
      const number = ctx.changes.takeObjectNumber();
      if (number === null) break;
      taken.push(number);
    }
    if (taken.length) ctx.state.update(withObjectNumbers, taken);
    return held + taken.length >= count;
  };

  /** Take `count` numbers the session holds, for creates stated in code; `null` when it can't hold that many. */
  const take = (count: number): number[] | null => {
    if (!hold(count)) return null;
    const { objectNumbers } = ctx.state.get().session;
    ctx.state.update((state) => ({
      ...state,
      session: { ...state.session, objectNumbers: objectNumbers.slice(count) },
    }));
    return objectNumbers.slice(0, count);
  };

  /**
   * `ops` with a number for every create that has none (a link's child): one
   * of `held`, the numbers the session holds, or one from the pool; without
   * one, the engine names it. Also what the session holds after.
   */
  const named = (
    ops: readonly ChangeOp[],
    held: readonly number[],
  ): { ops: ChangeOp[]; held: readonly number[] } => {
    let left = held;
    const withNumbers = ops.map((op): ChangeOp => {
      if (op.type !== 'annotations.create' || op.objectNumber !== undefined) return op;
      const [first, ...rest] = left;
      const objectNumber = first ?? ctx.changes.takeObjectNumber();
      if (first !== undefined) left = rest;
      return objectNumber === null ? op : { ...op, objectNumber };
    });
    return { ops: withNumbers, held: left };
  };

  return { hold, take, named };
}
