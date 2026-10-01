import type { Annotation } from '@embedpdf/engine-core/runtime';
import type { Id } from '@embedpdf/core-annotation';

import type { Behavior } from '../contract';
import type { AnnotationStore } from '../services/store';

/**
 * Behaviors: a sibling plugin (forms, links) or an interactive renderer marks
 * some annotations as interactive. While a behavior is engaged its
 * annotations render their own DOM and are not geometry-editable: hit-test,
 * marquee and the selection must not see them.
 */
export function createBehaviors(store: AnnotationStore) {
  const behaviors: Behavior[] = [];

  /** The behavior that owns the annotation now: one that matches it and is engaged. */
  const owner = (annotation: Annotation): Behavior | undefined =>
    behaviors.find((behavior) => behavior.matches(annotation) && behavior.engaged(annotation));

  /**
   * Ids on a page whose Behavior is currently engaged (form widgets under a
   * fill tool). Resolved per event: engagement follows the active tool live.
   */
  const engagedIdsOn = (pageObjectNumber: number): ReadonlySet<Id> | undefined => {
    if (!behaviors.length) return undefined;
    const model = store.model();
    let out: Set<Id> | undefined;
    for (const id of model.order) {
      const record = model.byId[id];
      if (!record || record.annotation.page.objectNumber !== pageObjectNumber) continue;
      if (owner(record.annotation)) (out ??= new Set()).add(id);
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
    getBehaviorFor: (annotation: Annotation) => owner(annotation) ?? null,
    pruneEngagedSelection: () => {
      // Engaged ⇒ hit-test-inert ⇒ must not stay selected either (a widget
      // selected in design mode keeps no chrome once the fill tool engages).
      const model = store.model();
      const drop = model.selected.filter((id) => {
        const record = model.byId[id];
        return !!record && !!owner(record.annotation);
      });
      if (drop.length) store.commit({ type: 'deselect', ids: drop });
    },
  };

  return { engagedIdsOn, api };
}

export type Behaviors = ReturnType<typeof createBehaviors>;
