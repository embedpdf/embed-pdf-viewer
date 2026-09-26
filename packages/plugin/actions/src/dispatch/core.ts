/**
 * The dispatch core as the lifecycle areas see it. The open sequence and the
 * document events run trees, and page-lifecycle emission dispatches page
 * triggers — while dispatch itself resolves through those areas. The cycle
 * is inherent (a document-open trigger runs the open sequence, which runs
 * trees), so it is bound late and explicitly: the controller hands each
 * area this port, backed by the dispatcher it assembles last.
 */
import type { PdfActionTree } from '@embedpdf/engine-core/runtime';

import type {
  ActionContext,
  ActionDispatchResult,
  ActionTrigger,
  ActionTriggerResult,
} from '../contract';

export interface DispatchCore {
  dispatch(trigger: ActionTrigger): Promise<ActionTriggerResult>;
  runAndEmit(tree: PdfActionTree, ctx: ActionContext): Promise<ActionDispatchResult>;
}
