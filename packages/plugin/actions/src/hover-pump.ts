import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { ActionSource, ActionTrigger, ActionTriggerResult } from './contract';

/** One hoverable target, as a feed sees it. `events` lets a feed that KNOWS
 *  tree presence (folded model, fill item) skip the inert half of a pair —
 *  omitted flags default to true. */
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

const sameTarget = (a: HoverTarget | null, b: HoverTarget | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.ref.kind !== b.ref.kind || a.page.pageObjectNumber !== b.page.pageObjectNumber) {
    return false;
  }
  if (a.ref.kind === 'objectNumber' && b.ref.kind === 'objectNumber') {
    return a.ref.annotObjectNumber === b.ref.annotObjectNumber;
  }
  if (a.ref.kind === 'nm' && b.ref.kind === 'nm') return a.ref.nm === b.ref.nm;
  if (a.ref.kind === 'index' && b.ref.kind === 'index') {
    return a.ref.index === b.ref.index && a.ref.revision === b.ref.revision;
  }
  return false;
};

/**
 * The ONE hover state machine every event plane shares (D8): per pointer
 * feed, `{ delivered, desired, inFlight }`. On each settle it delivers the
 * transition `delivered → desired` as `Exit(delivered)` then
 * `Enter(desired)`, SUBMITTED BACK-TO-BACK SYNCHRONOUSLY — dispatch takes
 * its queue slot before returning, so the ordered pair can never be split by
 * a slow resolution (the per-annotation-tail reordering the review caught).
 * Under pressure intermediate targets are skipped by design: the pointer
 * sweeping A→B→C while A's exit is in flight delivers `Exit(A) → Enter(C)`,
 * never a stale `Enter(B)`.
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
