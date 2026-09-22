/**
 * Trigger resolution helpers: the config gates, annotation identity, the
 * page-lifecycle tree cache (the fan-out's read amplifier) and ISO Table
 * 197's page-step order.
 */
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type {
  AnnotationRef,
  PageObjectNumber,
  PdfActionTree,
  PdfAnnotationActions,
  PdfPageActions,
} from '@embedpdf/engine-core/runtime';

import type { ActionsConfig, ActionSource, ActionTrigger } from '../contract';
import type { ActionsContext } from '../services';

export const sameRef = (left: AnnotationRef, right: AnnotationRef): boolean => {
  if (left.kind === 'objectNumber' && right.kind === 'objectNumber') {
    return left.annotObjectNumber === right.annotObjectNumber;
  }
  if (left.kind === 'nm' && right.kind === 'nm') {
    return left.page.pageObjectNumber === right.page.pageObjectNumber && left.nm === right.nm;
  }
  if (left.kind === 'index' && right.kind === 'index') {
    return left.page.pageObjectNumber === right.page.pageObjectNumber && left.index === right.index;
  }
  return false;
};

export function createTriggers(ctx: ActionsContext, config: ActionsConfig) {
  const triggerEnabled = (trigger: ActionTrigger): boolean => {
    switch (trigger.scope) {
      case 'activate':
        return true; // the Phase-1 core door — never gated
      case 'annotation':
        return config.triggers?.annotation !== false;
      case 'page':
        return config.triggers?.page !== false;
      case 'document':
        return config.triggers?.document !== false;
    }
  };

  /**
   * Per-pon cache of annotations bearing page-lifecycle trees (PO/PC/PV/PI)
   * — the fan-out's read amplifier. Invalidated wholesale on any
   * `annotation.*` document event and on `stream.desynced` (gap events never
   * arrive, so every cached page may be stale); rebuilt lazily per pon.
   */
  type LifecycleAnnot = { ref: AnnotationRef; actions: PdfAnnotationActions };
  const lifecycleCache = new Map<PageObjectNumber, LifecycleAnnot[]>();
  const lifecycleTreesFor = async (pon: PageObjectNumber): Promise<LifecycleAnnot[]> => {
    const hit = lifecycleCache.get(pon);
    if (hit) return hit;
    const doc = ctx.doc;
    if (!doc) return [];
    const { annotations } = await doc.page(toPageRef(pon)).annotations.list();
    const bearing = annotations
      .filter(
        (a) =>
          a.actions &&
          (a.actions.pageOpen?.root ||
            a.actions.pageClose?.root ||
            a.actions.pageVisible?.root ||
            a.actions.pageInvisible?.root),
      )
      .map((a) => ({ ref: a.ref, actions: a.actions! }));
    lifecycleCache.set(pon, bearing);
    return bearing;
  };
  {
    // Optional-chained end to end: unit harnesses fake `ctx.doc` without an
    // event stream; a real DocumentHandle always carries one.
    const unsubscribe = ctx.doc?.events?.subscribe((event) => {
      if (event.type.startsWith('annotation.') || event.type === 'stream.desynced') {
        lifecycleCache.clear();
      }
    });
    if (unsubscribe) ctx.cleanup(unsubscribe);
  }

  /**
   * ISO order, verified against 32000-2 Table 197 (2026-09-02): PO "shall be
   * executed after the O action … and the OpenAction entry"; PC "shall be
   * executed before the C action". Rootless trees are skipped (a
   * budget-degraded tree with no root has nothing to walk).
   */
  const planPageSteps = (
    event: 'open' | 'close' | 'visible' | 'invisible',
    pon: PageObjectNumber,
    pageActions: PdfPageActions | undefined,
    lifecycle: LifecycleAnnot[],
  ): Array<{ source: ActionSource; tree: PdfActionTree }> => {
    const page = toPageRef(pon);
    const pageSource: ActionSource = { kind: 'page', page };
    const annotSteps = (key: 'pageOpen' | 'pageClose' | 'pageVisible' | 'pageInvisible') =>
      lifecycle
        .filter((a) => a.actions[key]?.root)
        .map((a) => ({
          source: { kind: 'annotation', annotation: a.ref, page } as ActionSource,
          tree: a.actions[key]!,
        }));
    switch (event) {
      case 'open':
        return [
          ...(pageActions?.open?.root ? [{ source: pageSource, tree: pageActions.open }] : []),
          ...annotSteps('pageOpen'),
        ];
      case 'close':
        return [
          ...annotSteps('pageClose'),
          ...(pageActions?.close?.root ? [{ source: pageSource, tree: pageActions.close }] : []),
        ];
      case 'visible':
        return annotSteps('pageVisible');
      case 'invisible':
        return annotSteps('pageInvisible');
    }
  };

  return { triggerEnabled, lifecycleTreesFor, planPageSteps };
}
export type ActionsTriggers = ReturnType<typeof createTriggers>;
