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
 *  widget source's `field`. Provenance only — policy never reads it. */
export type ActionSource =
  | { kind: 'widget'; field: FormFieldRef; annotation: AnnotationRef; pon: PageObjectNumber }
  | { kind: 'link'; annotation?: AnnotationRef; pon?: PageObjectNumber }
  /** A non-widget annotation's own /AA event (E/X on squares, stamps, …). */
  | { kind: 'annotation'; annotation: AnnotationRef; pon: PageObjectNumber }
  /** A page /AA tree (O/C) inside a page-trigger fan-out. */
  | { kind: 'page'; pon: PageObjectNumber }
  /** The document-open sequence (openDestination / OpenAction). */
  | { kind: 'document' }
  | { kind: 'api' };

export interface ActionContext {
  origin: ActionOrigin;
  source: ActionSource;
}

/** The six annotation /AA pointer/focus events (ISO Table 197: E X D U Fo Bl).
 *  Page-lifecycle events (PO/PC/PV/PI) are NOT here — they fan out from page
 *  triggers, never from per-annotation dispatch. */
export type PdfAnnotationEventKind =
  | 'cursorEnter'
  | 'cursorExit'
  | 'mouseDown'
  | 'mouseUp'
  | 'focus'
  | 'blur';

/**
 * Trigger vocabulary — what a feed reports; the dispatcher resolves trees,
 * derives the origin ({@link originOf}), and fans out. `source` on the
 * annotation-addressed arms is an optional PROVENANCE hint from first-party
 * feeds (a widget feed passes its field ref so the interim JS executor can
 * anchor `event.target`); policy never reads it and it cannot change origin.
 */
export type ActionTrigger =
  | { scope: 'activate'; ref: AnnotationRef; pon: PageObjectNumber; source?: ActionSource }
  | {
      scope: 'annotation';
      event: PdfAnnotationEventKind;
      ref: AnnotationRef;
      pon: PageObjectNumber;
      source?: ActionSource;
    }
  | { scope: 'page'; event: 'open' | 'close' | 'visible' | 'invisible'; pon: PageObjectNumber }
  | { scope: 'document'; event: 'open' };

/** The one origin mapping — derived by the dispatcher, never claimed by a
 *  caller: a feed cannot launder a hover into a user gesture. */
export const originOf = (trigger: ActionTrigger): ActionOrigin => {
  switch (trigger.scope) {
    case 'activate':
      return 'user';
    case 'annotation':
      return trigger.event === 'cursorEnter' || trigger.event === 'cursorExit'
        ? 'hover'
        : 'user';
    case 'page':
    case 'document':
      return 'lifecycle';
  }
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
    | 'executor-failed'
    | 'trigger-disabled' // config.triggers gated this family off
    | 'trigger-failed' // resolution threw — dispatch() never rejects
    | 'cascade-budget' // programmatic page-lifecycle rounds exceeded the cap
    | 'open-sequence-replayed'; // a second document-open trigger arrived
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

/**
 * One tree's execution inside a trigger: its true source, its true tree, its
 * own node results — `path`s are REAL walk paths, never prefixed. `onAction`
 * fires once per step with exactly this tree and a ctx built from this
 * source, so the Phase-1 event contract is untouched by fan-out.
 */
export interface ActionStepResult {
  source: ActionSource;
  tree: PdfActionTree;
  result: ActionDispatchResult;
}

/**
 * What `dispatch(trigger)` returns: the aggregate plus per-step truth. A
 * step failure NEVER skips sibling steps (a broken annotation /PC must not
 * cancel the page's /C — degrade, never brick); deferred navigation/external
 * effects flush per step, not per trigger.
 */
export interface ActionTriggerResult {
  status: 'executed' | 'partial' | 'inert' | 'refused';
  steps: ActionStepResult[];
  /** Trigger-level diagnostics (disabled family, resolution failure);
   *  per-node diagnostics live inside each step's `result`. */
  diagnostics: ActionDiagnostic[];
}

/**
 * Stage's page-truth report (the ONE door — see the lifecycle coordinator).
 * Stage stays authoritative for what page the viewer is on; the coordinator
 * owns WHEN page-lifecycle triggers fire: reports are buffered behind the
 * document-open barrier and diffed against the last-emitted state, so
 * pre-open motion (a restored view, the openDestination reveal) never emits
 * close/open churn. `cause` fuels the cascade budget: consecutive
 * programmatic rounds are capped; a user-caused report resets the counter.
 */
export interface PageStateReport {
  currentPon: PageObjectNumber | null;
  visiblePons: readonly PageObjectNumber[];
  /** False until layout exists; pre-placement reports are ignored. */
  placed: boolean;
  cause: 'user' | 'programmatic';
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
  /** Trigger-family gates, default all true. `activate` (the /A click) is
   *  the Phase-1 core door and is never gated. */
  triggers?: { document?: boolean; page?: boolean; annotation?: boolean };
  /**
   * The document-open sequence (§3.9): `'auto'` (default) fires once at the
   * earliest of a UI adapter installing or the first user-origin dispatch —
   * the initial page-open then comes from the stage's page-state report
   * (a stage-less embedder drives page triggers itself, or declares
   * headless); `'headless'` fires at bringup and falls back to the first
   * page for the initial open (no stage will ever report); `'off'` never
   * fires it — but still releases the page-lifecycle barrier.
   */
  openSequence?: 'auto' | 'headless' | 'off';
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
  /**
   * Report a trigger. Submission is SYNCHRONOUS — the queue slot is taken
   * before this returns, so two dispatch calls execute in call order even
   * when their resolutions race; all reads happen inside the queued
   * operation. Never rejects: resolution failures come back as `refused`
   * with a `trigger-failed` diagnostic, so `void dispatch(...)` is safe.
   */
  dispatch(trigger: ActionTrigger): Promise<ActionTriggerResult>;
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
  /** Stage's page-truth push door — see {@link PageStateReport}. */
  reportPageState(report: PageStateReport): void;
}

export interface ActionsState {
  /** Monotonic dispatch counter — store-visible observability. */
  seq: number;
}

export type ActionsAction = { type: 'ACTIONS_DISPATCHED' };

export const ActionsToken = createCapabilityToken<ActionsCapability>('actions', {
  hint: `add actionsPlugin() from '@embedpdf/plugin-actions' to your plugins list`,
});
