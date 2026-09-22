import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { ActionSource, ActionTrigger, ActionTriggerResult } from './contract';

/** One hoverable target, as a feed sees it. `events` lets a feed that knows
 *  which trees exist (a folded model, a fill item) skip the inert half of a
 *  pair; omitted flags default to true. */
export interface HoverTarget {
  ref: AnnotationRef;
  page: PageRef;
  /** Optional provenance hint forwarded on the trigger (widget/link feeds). */
  source?: ActionSource;
  events?: { enter?: boolean; exit?: boolean };
}

export interface HoverPump {
  /** Report where the pointer is now (null = nowhere interesting). */
  hover(target: HoverTarget | null): void;
  /** Forget everything without dispatching (teardown; document switch). */
  reset(): void;
}

const sameTarget = (left: HoverTarget | null, right: HoverTarget | null): boolean => {
  if (left === null || right === null) return left === right;
  if (
    left.ref.kind !== right.ref.kind ||
    left.page.pageObjectNumber !== right.page.pageObjectNumber
  ) {
    return false;
  }
  if (left.ref.kind === 'objectNumber' && right.ref.kind === 'objectNumber') {
    return left.ref.annotObjectNumber === right.ref.annotObjectNumber;
  }
  if (left.ref.kind === 'nm' && right.ref.kind === 'nm') return left.ref.nm === right.ref.nm;
  if (left.ref.kind === 'index' && right.ref.kind === 'index') {
    return left.ref.index === right.ref.index && left.ref.revision === right.ref.revision;
  }
  return false;
};

/**
 * The one hover state machine every event plane shares: per pointer feed,
 * `{ delivered, desired, inFlight }`. On each settle it delivers the
 * transition `delivered → desired` as `Exit(delivered)` then
 * `Enter(desired)`, submitted back to back synchronously: dispatch takes its
 * queue slot before returning, so a slow resolution can never split or
 * reorder the pair. Under pressure intermediate targets are skipped by
 * design: the pointer sweeping A→B→C while A's exit is in flight delivers
 * `Exit(A) → Enter(C)`, never a stale `Enter(B)`.
 */
export function createHoverPump(
  dispatch: (trigger: ActionTrigger) => Promise<ActionTriggerResult>,
): HoverPump {
  let delivered: HoverTarget | null = null;
  let desired: HoverTarget | null = null;
  let inFlight = false;

  const pump = (): void => {
    if (inFlight || sameTarget(delivered, desired)) return;
    inFlight = true;
    const from = delivered;
    const to = desired;
    delivered = to;
    const submissions: Array<Promise<unknown>> = [];
    if (from && from.events?.exit !== false) {
      submissions.push(
        dispatch({
          scope: 'annotation',
          event: 'cursorExit',
          ref: from.ref,
          page: from.page,
          ...(from.source ? { source: from.source } : {}),
        }),
      );
    }
    if (to && to.events?.enter !== false) {
      submissions.push(
        dispatch({
          scope: 'annotation',
          event: 'cursorEnter',
          ref: to.ref,
          page: to.page,
          ...(to.source ? { source: to.source } : {}),
        }),
      );
    }
    void Promise.allSettled(submissions).then(() => {
      inFlight = false;
      pump(); // the pointer may have moved on — deliver the latest transition
    });
  };

  return {
    hover(target) {
      desired = target;
      pump();
    },
    reset() {
      delivered = null;
      desired = null;
    },
  };
}
