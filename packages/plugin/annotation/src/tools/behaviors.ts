import type { Id, Subtype } from '@embedpdf/core-annotation';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import type { Behavior } from '../contract';
import type { AnnotationStore } from '../services/store';

/**
 * Behaviors: a sibling plugin (forms, links) marks some annotations as
 * interactive. While a behavior is ENGAGED its annotations render their own
 * DOM and are not geometry-editable — hit-test, marquee and the selection
 * must not see them.
 */
export function createBehaviors(store: AnnotationStore) {
  const behaviors: Behavior[] = [];

  const matches = (b: Behavior, a: { subtype: Subtype; ref: AnnotationRef | null }): boolean =>
    b.matches(a) && b.engaged();

  /**
   * Ids on a page whose Behavior is currently ENGAGED (form widgets under a
   * fill tool). Resolved per event — engagement follows the active tool live.
   */
  const engagedIdsOn = (pon: number): ReadonlySet<Id> | undefined => {
    if (!behaviors.length) return undefined;
    const m = store.model();
    let out: Set<Id> | undefined;
    for (const id of m.order) {
      const a = m.byId[id];
      if (!a || a.page.pageObjectNumber !== pon) continue;
      if (behaviors.some((b) => matches(b, { subtype: a.subtype, ref: a.ref }))) {
        (out ??= new Set()).add(id);
      }
    }
    return out;
  };

  const api = {
    registerBehavior: (b: Behavior) => {
      behaviors.push(b);
      return () => {
        const i = behaviors.indexOf(b);
        if (i >= 0) behaviors.splice(i, 1);
      };
    },
    getBehaviorFor: (a: { subtype: Subtype; ref: AnnotationRef | null }) =>
      behaviors.find((b) => matches(b, a)) ?? null,
    pruneEngagedSelection: () => {
      // Engaged ⇒ hit-test-inert ⇒ must not STAY selected either (a widget
      // selected in design mode keeps no chrome once the fill tool engages).
      const m = store.model();
      const drop = m.selected.filter((id) => {
        const a = m.byId[id];
        return a && behaviors.some((b) => matches(b, { subtype: a.subtype, ref: a.ref }));
      });
      if (drop.length) store.commit({ t: 'deselect', ids: drop });
    },
  };

  return { engagedIdsOn, api };
}

export type Behaviors = ReturnType<typeof createBehaviors>;
