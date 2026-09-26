/**
 * Trigger resolution helpers: the config gates, annotation identity, the
 * per-page cache of annotations bearing page-lifecycle trees (the fan-out's
 * read amplifier) and ISO 32000-2 Table 197's page-step order.
 */
import type { PluginContext } from '@embedpdf/core';
import type {
  AnnotationRef,
  DocumentEvent,
  PageObjectNumber,
  PageRef,
  PdfActionTree,
  PdfAnnotationActions,
  PdfPageActions,
} from '@embedpdf/engine-core/runtime';

import type { ActionsConfig, ActionSource, ActionTrigger } from '../contract';

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

/** An annotation that carries at least one page-lifecycle tree (/PO, /PC, /PV, /PI). */
interface LifecycleAnnotation {
  readonly ref: AnnotationRef;
  readonly actions: PdfAnnotationActions;
}

/**
 * The pages whose annotations an event changes: those pages, every page
 * (`'all'`: a redaction, a skipped stretch of the stream, new document
 * bytes), or none.
 */
const annotationPagesOf = (event: DocumentEvent): readonly PageRef[] | 'all' | null => {
  switch (event.type) {
    case 'annotations.created':
    case 'annotations.updated':
    case 'annotations.deleted':
    case 'annotations.moved':
    case 'annotations.flattened':
      return [event.page];
    case 'pages.flattened':
      return event.pages;
    case 'redaction.applied':
    case 'stream.desynced':
    case 'document.versioned':
      return 'all';
    default:
      return null;
  }
};

export function createTriggers(ctx: PluginContext<void>, config: ActionsConfig) {
  const triggerEnabled = (trigger: ActionTrigger): boolean => {
    switch (trigger.scope) {
      case 'activate':
        return true; // the click door is never gated
      case 'annotation':
        return config.triggers?.annotation !== false;
      case 'page':
        return config.triggers?.page !== false;
      case 'document':
        return config.triggers?.document !== false;
    }
  };

  // Per page, the pending or settled read of its lifecycle-bearing
  // annotations. Reads start only inside the queued operation that needs
  // them, so a trigger sees every change made by the operations queued
  // before it. Holding the promise lets concurrent readers share one read,
  // and dropping it on invalidation means a read that was in flight when its
  // page changed is never reused afterwards.
  const lifecycleReads = new Map<PageObjectNumber, Promise<readonly LifecycleAnnotation[]>>();

  const lifecycleAnnotationsOf = (page: PageRef): Promise<readonly LifecycleAnnotation[]> => {
    const key = page.pageObjectNumber;
    const cached = lifecycleReads.get(key);
    if (cached) return cached;
    const read = ctx.doc
      .page(page)
      .annotations.list()
      .then(({ annotations }) =>
        annotations
          .filter(
            (annotation) =>
              annotation.actions &&
              (annotation.actions.pageOpen?.root ||
                annotation.actions.pageClose?.root ||
                annotation.actions.pageVisible?.root ||
                annotation.actions.pageInvisible?.root),
          )
          .map((annotation) => ({ ref: annotation.ref, actions: annotation.actions! })),
      );
    lifecycleReads.set(key, read);
    // A failed read is not kept: the next trigger for the page reads again.
    read.catch(() => {
      if (lifecycleReads.get(key) === read) lifecycleReads.delete(key);
    });
    return read;
  };

  /** Forget the pages a confirmed document event changed. */
  const invalidate = (event: DocumentEvent): void => {
    const pages = annotationPagesOf(event);
    if (pages === 'all') lifecycleReads.clear();
    else if (pages) for (const page of pages) lifecycleReads.delete(page.pageObjectNumber);
  };

  /**
   * ISO 32000-2 Table 197 order: /PO "shall be executed after the O action …
   * and the OpenAction entry"; /PC "shall be executed before the C action".
   * Rootless trees are skipped (a budget-degraded tree with no root has
   * nothing to walk).
   */
  const planPageSteps = (
    event: 'open' | 'close' | 'visible' | 'invisible',
    page: PageRef,
    pageActions: PdfPageActions | undefined,
    lifecycle: readonly LifecycleAnnotation[],
  ): Array<{ source: ActionSource; tree: PdfActionTree }> => {
    const pageSource: ActionSource = { kind: 'page', page };
    const annotationSteps = (key: 'pageOpen' | 'pageClose' | 'pageVisible' | 'pageInvisible') =>
      lifecycle
        .filter((annotation) => annotation.actions[key]?.root)
        .map((annotation) => ({
          source: { kind: 'annotation', annotation: annotation.ref, page } as ActionSource,
          tree: annotation.actions[key]!,
        }));
    switch (event) {
      case 'open':
        return [
          ...(pageActions?.open?.root ? [{ source: pageSource, tree: pageActions.open }] : []),
          ...annotationSteps('pageOpen'),
        ];
      case 'close':
        return [
          ...annotationSteps('pageClose'),
          ...(pageActions?.close?.root ? [{ source: pageSource, tree: pageActions.close }] : []),
        ];
      case 'visible':
        return annotationSteps('pageVisible');
      case 'invisible':
        return annotationSteps('pageInvisible');
    }
  };

  return { triggerEnabled, lifecycleAnnotationsOf, invalidate, planPageSteps };
}
export type ActionsTriggers = ReturnType<typeof createTriggers>;
