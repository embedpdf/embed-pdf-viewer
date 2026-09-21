/**
 * The policy matrix (type × origin → decision): the defaults, the fixed
 * `never` / unsupported sets, the row-wise merge, and the live policy with
 * its one decision function.
 */
import type { PdfActionNode, PdfActionType } from '@embedpdf/engine-core/runtime';

import type {
  ActionOrigin,
  ActionPolicy,
  ActionPolicyDecision,
  ActionPolicyPatch,
  ActionPolicyRow,
  ActionsCapability,
  ActionsConfig,
} from '../contract';
import type { ActionsContext } from './context';

const ALLOW_ALL: ActionPolicyRow = { user: 'allow', hover: 'allow', lifecycle: 'allow' };

const DEFAULT_POLICY: ActionPolicy = {
  goto: ALLOW_ALL,
  named: ALLOW_ALL,
  hide: ALLOW_ALL,
  'reset-form': ALLOW_ALL,
  javascript: ALLOW_ALL,
  // No auto-opened tabs: only a real user activation reaches the adapter.
  uri: { user: 'adapter', hover: 'report', lifecycle: 'report' },
  // The Named Print verb: adapter on user gestures, blocked otherwise.
  print: { user: 'adapter', hover: 'block', lifecycle: 'block' },
  // The sink chain (handler → the document's home → blocked) on user
  // gestures only; hover/lifecycle submits never leave the viewer.
  'submit-form': { user: 'adapter', hover: 'block', lifecycle: 'block' },
};

/** Never executable, not configurable — diagnostics only. */
const NEVER_TYPES: ReadonlySet<PdfActionType> = new Set([
  'launch',
  'goto-remote',
  'goto-embedded',
  'sound',
  'movie',
  'import-data',
]);

/** Recognized types with no Phase-1 interpreter. */
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

/** Row-wise merge: a patch names only the origins it changes. */
function mergePolicy(base: ActionPolicy, patch: ActionPolicyPatch | undefined): ActionPolicy {
  if (!patch) return base;
  const next = { ...base };
  for (const key of Object.keys(patch) as (keyof ActionPolicy)[]) {
    const row = patch[key];
    if (row) next[key] = { ...base[key], ...row };
  }
  return next;
}

export function createPolicy(ctx: ActionsContext, config: ActionsConfig) {
  let policy: ActionPolicy = mergePolicy(DEFAULT_POLICY, config.policy);

  /** Policy lookup — `null` means "recognized, no interpreter" (inert). */
  const decisionFor = (
    node: PdfActionNode,
    origin: ActionOrigin,
  ): ActionPolicyDecision | 'never' | 'unsupported' => {
    if (NEVER_TYPES.has(node.type)) return 'never';
    if (UNSUPPORTED_TYPES.has(node.type)) return 'unsupported';
    if (isPrintVerb(node)) return policy.print[origin];
    const row = policy[node.type as keyof ActionPolicy] as ActionPolicyRow | undefined;
    return row ? row[origin] : 'unsupported';
  };

  return {
    decisionFor,
    /** The live policy — read at decision time, never captured. */
    current: (): ActionPolicy => policy,
    api: {
      getPolicy: () => policy,
      updatePolicy: (patch) => {
        policy = mergePolicy(policy, patch);
        ctx.dispatch({ type: 'ACTIONS_POLICY_CHANGED' });
      },
    } satisfies Partial<ActionsCapability>,
  };
}
export type ActionsPolicy = ReturnType<typeof createPolicy>;
