import { createCapabilityToken, type EventHook, type Unsubscribe } from '@embedpdf/core';
import type {
  AnnotationRef,
  FormFieldRef,
  PageObjectNumber,
  PdfActionNode,
  PdfActionTree,
  PdfActionType,
} from '@embedpdf/engine-core/runtime';

// ── the when/who axes ──────────────────────────────────────────────────────

/** Why a dispatch happened. Phase 1 dispatches are all `'user'` (a real
 *  activation gesture); `'hover'` and `'lifecycle'` arrive with Phase 2's
 *  trigger sources — the policy axis ships full-shape now. */
export type ActionOrigin = 'user' | 'hover' | 'lifecycle';

/** Who initiated the dispatch. Fields are REQUIRED where an executor needs
 *  them: the interim JavaScript executor builds `event.target` from the
 *  widget source's `field`. */
export type ActionSource =
  | { kind: 'widget'; field: FormFieldRef; annotation: AnnotationRef; pon: PageObjectNumber }
  | { kind: 'link'; annotation?: AnnotationRef; pon?: PageObjectNumber }
  | { kind: 'api' };

export interface ActionContext {
  origin: ActionOrigin;
  source: ActionSource;
}

/** Trigger vocabulary. Phase 1 handles only the `activate` scope (a link or
 *  widget `/A` addressed by annotation ref); Phase 2 adds page/annotation/
 *  document trigger sources through `registerTriggerSource`. */
export type ActionTrigger = {
  scope: 'activate';
  ref: AnnotationRef;
  pon: PageObjectNumber;
};

// ── results ────────────────────────────────────────────────────────────────

export type ActionNodeStatus =
  | 'executed' // the registered executor / built-in interpreter ran
  | 'blocked' // policy said no (submit-form, origin-gated uri, …)
  | 'no-executor' // nothing registered/installed for this type
  | 'inert' // an executor was present but declined (scripting off, unknown verb)
  | 'failed' // the executor threw or reported failure
  | 'skipped'; // an earlier document-lifetime failure stopped this node

export interface ActionNodeResult {
  /** Node address as child indexes from the root ([] = root, [0] = root.next[0]…). */
  path: number[];
  type: PdfActionType;
  status: ActionNodeStatus;
  detail?: string;
}

export interface ActionDiagnostic {
  code:
    | 'incomplete-tree'
    | 'blocked'
    | 'no-executor'
    | 'no-adapter'
    | 'no-session-sink'
    | 'unresolved-target'
    | 'duplicate-executor'
    | 'executor-inert'
    | 'executor-failed';
  message: string;
}

/**
 * One logical dispatch transaction's outcome. Document-lifetime work is
 * NON-ROLLBACK-ATOMIC: an earlier successful reset/script write survives a
 * later failure — `status: 'partial'` says so, and `nodes` carries the
 * per-node truth.
 */
export interface ActionDispatchResult {
  status: 'executed' | 'partial' | 'inert' | 'refused';
  nodes: ActionNodeResult[];
  diagnostics: ActionDiagnostic[];
}

export interface ActionDispatchEvent {
  ctx: ActionContext;
  tree: PdfActionTree;
  result: ActionDispatchResult;
}

// ── policy ─────────────────────────────────────────────────────────────────

/** Per-(type × origin) decision. `allow` executes; `adapter` routes through
 *  the UI adapter; `report` records a blocked node without executing;
 *  `block` refuses. `launch`/`goto-remote`/`goto-embedded`/media arms are
 *  fixed `'never'` and not configurable; `submit-form` is fixed `'blocked'`. */
export type ActionPolicyDecision = 'allow' | 'adapter' | 'report' | 'block';
export type ActionPolicyRow = Record<ActionOrigin, ActionPolicyDecision>;

export interface ActionPolicy {
  goto: ActionPolicyRow;
  named: ActionPolicyRow;
  hide: ActionPolicyRow;
  'reset-form': ActionPolicyRow;
  javascript: ActionPolicyRow;
  uri: ActionPolicyRow;
  /** The Named `Print` verb — owned by policy + the UI adapter, never stage. */
  print: ActionPolicyRow;
}

export interface ActionsPluginConfig {
  /** Declarative overrides merged over the defaults (umbrella §3.5). */
  policy?: Partial<ActionPolicy>;
}

// ── registration surfaces (host lens) ──────────────────────────────────────

export type ActionExecutorResult =
  | { status: 'executed' }
  | { status: 'inert'; reason: string }
  | { status: 'failed'; error: string };

/** One node of one registered type, executed in dispatch order. Executors
 *  never see the tree or the capability — the anti-cascade law. */
export type ActionExecutor = (
  node: PdfActionNode,
  ctx: ActionContext,
) => Promise<ActionExecutorResult> | ActionExecutorResult;

/** The annotation plugin's session-visibility door (umbrella §3.6): apply
 *  session-hidden overrides by annotation object number. Returns how many
 *  resolved; unresolved numbers surface as `unresolved-target` diagnostics. */
export interface SessionEffectSink {
  applyVisibility(entries: Array<{ annotObjectNumber: number; hidden: boolean }>): number;
}

/** Phase-2 shape, defined now: a domain plugin's trigger feed. */
export interface TriggerSource {
  id: string;
}

export interface ActionUiAdapter {
  openUri(uri: string, opts: { isMap: boolean; origin: ActionOrigin }): void;
  print(): void;
}

// ── capabilities ───────────────────────────────────────────────────────────

/** PUBLIC — embedders and chrome. Twins follow permissions.md: same name,
 *  same arguments, boolean, answering "would the dispatcher accept this and
 *  attempt execution" (per-node truth lives in the result's `nodes`). */
export interface ActionsCapability {
  execute(tree: PdfActionTree, ctx: ActionContext): Promise<ActionDispatchResult>;
  canExecute(tree: PdfActionTree, ctx: ActionContext): boolean;
  dispatch(trigger: ActionTrigger): Promise<ActionDispatchResult>;
  canDispatch(trigger: ActionTrigger): boolean;
  /** Identity-safe port install: the returned disposer clears the slot only
   *  while THIS adapter is still current; `null` force-clears. */
  setUiAdapter(adapter: ActionUiAdapter | null): Unsubscribe;
  onAction: EventHook<ActionDispatchEvent>;
  onDiagnostic: EventHook<ActionDiagnostic>;
}

/** INTERNAL host lens — plugin-to-plugin only; import the token from
 *  `@embedpdf/plugin-actions/internal`, never from application code. */
export interface ActionsHostCapability extends ActionsCapability {
  /** Deterministic LAST-WINS on duplicates (a `duplicate-executor`
   *  diagnostic is emitted); the disposer removes the entry only while it is
   *  still the current one. */
  registerExecutor(type: PdfActionType, executor: ActionExecutor): Unsubscribe;
  registerSessionSink(sink: SessionEffectSink): Unsubscribe;
  registerTriggerSource(source: TriggerSource): Unsubscribe;
}

export interface ActionsState {
  /** Monotonic dispatch counter — store-visible observability. */
  seq: number;
}

export type ActionsAction = { type: 'ACTIONS_DISPATCHED' };

export const ActionsToken = createCapabilityToken<ActionsCapability>('actions', {
  hint: `add actionsPlugin() from '@embedpdf/plugin-actions' to your plugins list`,
});
