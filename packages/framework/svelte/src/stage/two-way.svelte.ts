/**
 * A value the Stage and its owner both write, for `bind:page` and `bind:zoom`: the owner's
 * value goes in when it differs from the Stage's, and the Stage's goes out when it changes.
 */
import { untrack } from 'svelte';

export interface TwoWayValue<T> {
  /** The Stage's value now. */
  stage: () => T;
  /** The bound prop now; undefined while the owner gives none. */
  bound: () => T | undefined;
  /** Whether the Stage can take a value yet (it has a document). */
  ready: () => boolean;
  /** Write the Stage's value to the bound prop. */
  write: (value: T) => void;
  /** Move the Stage to the owner's value. */
  apply: (value: T) => void;
}

export function syncTwoWay<T>(value: TwoWayValue<T>): void {
  // In first: on mount, the owner's value is where the Stage goes, and only then does the
  // Stage's own value come back out.
  $effect(() => {
    const wanted = value.bound();
    if (wanted === undefined || !value.ready()) return;
    untrack(() => {
      if (!Object.is(wanted, value.stage())) value.apply(wanted);
    });
  });

  let last = untrack(value.stage);
  $effect(() => {
    const current = value.stage();
    if (Object.is(current, last)) return;
    last = current;
    untrack(() => value.write(current));
  });
}
