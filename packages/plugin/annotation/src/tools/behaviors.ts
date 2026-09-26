import type { Id, Subtype } from '@embedpdf/core-annotation';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { Behavior } from '../contract';
import type { AnnotationStore } from '../services/store';

/**
 * Behaviors: a sibling plugin (forms, links) marks some annotations as
 * interactive. While a behavior is engaged its annotations render their own
 * DOM and are not geometry-editable — hit-test, marquee and the selection
 * must not see them.
 */
export function createBehaviors(store: AnnotationStore) {
  const behaviors: Behavior[] = [];

  const matches = (
    right: Behavior,
    left: { subtype: Subtype; ref: AnnotationRef | null },
  ): boolean => right.matches(left) && right.engaged();

  /**
   * Ids on a page whose Behavior is currently engaged (form widgets under a
   * fill tool). Resolved per event — engagement follows the active tool live.
   */
  const engagedIdsOn = (pageObjectNumber: number): ReadonlySet<Id> | undefined => {
    if (!behaviors.length) return undefined;
    const model = store.model();
    let out: Set<Id> | undefined;
    for (const id of model.order) {
      const annotation = model.byId[id];
      if (!annotation || annotation.page.pageObjectNumber !== pageObjectNumber) continue;
      if (
        behaviors.some((behavior) =>
          matches(behavior, { subtype: annotation.subtype, ref: annotation.ref }),
        )
      ) {
        (out ??= new Set()).add(id);
      }
    }
    return out;
  };

  const api = {
    registerBehavior: (behavior: Behavior) => {
      behaviors.push(behavior);
      return () => {
        const index = behaviors.indexOf(behavior);
        if (index >= 0) behaviors.splice(index, 1);
      };
    },
    getBehaviorFor: (annotation: { subtype: Subtype; ref: AnnotationRef | null }) =>
      behaviors.find((behavior) => matches(behavior, annotation)) ?? null,
    pruneEngagedSelection: () => {
      // Engaged ⇒ hit-test-inert ⇒ must not stay selected either (a widget
      // selected in design mode keeps no chrome once the fill tool engages).
      const model = store.model();
      const drop = model.selected.filter((id) => {
        const annotation = model.byId[id];
        return (
          annotation &&
          behaviors.some((behavior) =>
            matches(behavior, { subtype: annotation.subtype, ref: annotation.ref }),
          )
        );
      });
      if (drop.length) store.commit({ type: 'deselect', ids: drop });
    },
  };

  return { engagedIdsOn, api };
}

export type Behaviors = ReturnType<typeof createBehaviors>;
