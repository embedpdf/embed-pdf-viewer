import { DocumentsToken, type EffectContext } from '@embedpdf/core';
import type { ViewManagerAction, ViewManagerState } from './types';

/**
 * Keep panes consistent with the document registry. Whenever the set of open
 * documents changes (open/close), reconcile:
 *  - newly opened documents land in the FOCUSED pane (creating a default pane
 *    on first open — so "one open document" shows as "one pane, one tab"),
 *  - closed documents are dropped from whatever pane held them.
 */
export function registerViewManagerEffects(
  ctx: EffectContext<ViewManagerState, ViewManagerAction>,
): void {
  const documents = ctx.get(DocumentsToken);
  ctx.watch(
    () => documents.order().join('|'),
    () => {
      ctx.dispatch({
        type: 'RECONCILE',
        open: documents.order(),
        preferViewId: ctx.getState().focusedViewId,
      });
    },
  );
}
