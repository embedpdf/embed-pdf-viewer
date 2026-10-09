/**
 * The policy matrix (type × origin → decision): the fixed `never` and
 * unsupported sets, and the one decision function over the `policy` setting.
 * The setting itself (its defaults and its merge) is the plugin's settings.
 */
import type { PdfActionNode, PdfActionType } from '@embedpdf/engine-core/runtime';

import type {
  ActionOrigin,
  ActionPolicy,
  ActionPolicyDecision,
  ActionPolicyRow,
} from '../contract';
import type { ActionsContext } from './context';

/** Never executable, not configurable — diagnostics only. */
const NEVER_TYPES: ReadonlySet<PdfActionType> = new Set([
  'launch',
  'goto-remote',
  'goto-embedded',
  'sound',
  'movie',
  'import-data',
]);

/** Recognized types with no interpreter: reported, never executed. */
const UNSUPPORTED_TYPES: ReadonlySet<PdfActionType> = new Set([
  'rendition',
  'thread',
  'set-ocg-state',
  'transition',
  'goto-3d-view',
  'unknown',
]);

/** Document-lifetime node types: engine mutations, committed in walk order. */
export const DOCUMENT_TYPES: ReadonlySet<PdfActionType> = new Set(['reset-form', 'javascript']);

export const isPrintVerb = (node: PdfActionNode): boolean =>
  node.type === 'named' && node.name === 'Print';

export function createPolicy(ctx: ActionsContext) {
  const settings = ctx.settings();
  /** The live policy: read at decision time, never captured. */
  const current = (): ActionPolicy => settings.get().policy;

  /** The decision for one node and origin; `'never'` and `'unsupported'` are fixed, not configurable. */
  const decisionFor = (
    node: PdfActionNode,
    origin: ActionOrigin,
  ): ActionPolicyDecision | 'never' | 'unsupported' => {
    if (NEVER_TYPES.has(node.type)) return 'never';
    if (UNSUPPORTED_TYPES.has(node.type)) return 'unsupported';
    const policy = current();
    if (isPrintVerb(node)) return policy.print[origin];
    const row = policy[node.type as keyof ActionPolicy] as ActionPolicyRow | undefined;
    return row ? row[origin] : 'unsupported';
  };

  return { decisionFor, current };
}
export type ActionsPolicy = ReturnType<typeof createPolicy>;
