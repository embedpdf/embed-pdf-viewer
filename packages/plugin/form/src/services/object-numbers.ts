/**
 * The object numbers a new field and its widgets take: final names from the
 * document's pool (`ctx.changes`), so a field shows under the ref it keeps
 * from its first frame. A few taken and not used yet wait here for the next
 * create; one the engine reclaims leaves.
 */
import type { FormContext } from './context';

export interface ObjectNumbers {
  /** `count` numbers now, or `null` when the pool has too few (it refills as it goes). */
  takeNow(count: number): number[] | null;
  /** `count` numbers, once the pool has them. */
  take(count: number): Promise<number[]>;
}

export function createObjectNumbers(ctx: Pick<FormContext, 'changes' | 'doc'>): ObjectNumbers {
  const held: number[] = [];
  let watching = false;
  const watchLost = (): void => {
    if (watching || !ctx.doc) return;
    watching = true;
    ctx.doc.objectNumbers.onLost(({ numbers }) => {
      const lost = new Set(numbers);
      held.splice(0, held.length, ...held.filter((number) => !lost.has(number)));
    });
  };

  const takeNow = (count: number): number[] | null => {
    watchLost();
    while (held.length < count) {
      const number = ctx.changes.takeObjectNumber();
      if (number === null) return null;
      held.push(number);
    }
    return held.splice(0, count);
  };

  return {
    takeNow,
    async take(count) {
      for (;;) {
        const taken = takeNow(count);
        if (taken) return taken;
        await ctx.changes.reserveObjectNumbers(count - held.length);
      }
    },
  };
}
