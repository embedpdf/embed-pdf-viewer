import { createCapabilityToken, type EventHook, type Unsubscribe } from '@embedpdf/core';
import type {
  ScriptAnnotEffect,
  ScriptBudget,
  ScriptDiagnostic,
  ScriptExecutionError,
  ScriptIdentity,
  ScriptSandboxFactory,
  ScriptTransaction,
  ScriptUiEffect,
} from '@embedpdf/core-acrojs';
import type {
  AnnotationRef,
  FormEffect,
  FormEffectsResult,
  FormFieldRef,
  FormSubmissionEntry,
  FormSubmissionReceipt,
  PageObjectNumber,
  PdfActionNode,
  PdfActionTargetRef,
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

/** Trigger provenance, derived centrally beside {@link originOf} — the
 *  executor-visible "which event fired" (cursorEnter vs cursorExit are both
 *  `origin: 'hover'`; this carries the difference). */
/** The document lifecycle vocabulary: `open` (§3.9's sequence) plus the
 *  five catalog `/AA` verbs (ISO 32000-2 Table 200 — WC/WS/DS/WP/DP).
 *  Whoever owns the verb dispatches them; `runDocumentVerb` is the
 *  serialized door for save/print, `prepareClose` for close. */
export type DocumentTriggerEvent =
  | 'open'
  | 'will-save'
  | 'did-save'
  | 'will-print'
  | 'did-print'
  | 'will-close';

export type ActionTriggerEvent =
  | { scope: 'activate' }
  | { scope: 'annotation'; name: PdfAnnotationEventKind }
  | { scope: 'page'; name: 'open' | 'close' | 'visible' | 'invisible' }
  | { scope: 'document'; name: DocumentTriggerEvent };

export interface ActionContext {
  origin: ActionOrigin;
  source: ActionSource;
  event: ActionTriggerEvent;
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
  | { scope: 'document'; event: DocumentTriggerEvent };

/** Trigger → provenance descriptor (the {@link ActionContext.event} axis). */
export const eventOf = (trigger: ActionTrigger): ActionTriggerEvent => {
  switch (trigger.scope) {
    case 'activate':
      return { scope: 'activate' };
    case 'annotation':
      return { scope: 'annotation', name: trigger.event };
    case 'page':
      return { scope: 'page', name: trigger.event };
    case 'document':
      return { scope: 'document', name: trigger.event };
  }
};

/** The one origin mapping — derived by the dispatcher, never claimed by a
 *  caller: a feed cannot launder a hover into a user gesture. */
export const originOf = (trigger: ActionTrigger): ActionOrigin => {
  switch (trigger.scope) {
    case 'activate':
      return 'user';
    case 'annotation':
      return trigger.event === 'cursorEnter' || trigger.event === 'cursorExit' ? 'hover' : 'user';
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
    | 'no-commit-sink' // a document effect had no registered owner sink
    | 'trigger-failed' // resolution threw — dispatch() never rejects
    | 'cascade-budget' // programmatic page-lifecycle rounds exceeded the cap
    | 'open-sequence-replayed' // a second document-open trigger arrived
    | 'no-submit-sink' // no handler installed and the document has no home
    | 'no-submit-resolver' // no form plugin registered a dataset resolver
    | 'submit-payload-unavailable' // older-runtime extraction: node stays inert
    | 'submit-entry-unsupported' // an explicitly included entry has no representable value
    | 'reentrant-print'; // a print request during a document print event — suppressed
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
 *  the type's port (the UI adapter; for `submit-form`, the sink chain —
 *  embedder handler → the document's home → blocked); `report` records a
 *  blocked node without executing; `block` refuses.
 *  `launch`/`goto-remote`/`goto-embedded`/media arms are fixed `'never'`
 *  and not configurable. */
export type ActionPolicyDecision = 'allow' | 'adapter' | 'report' | 'block';
export type ActionPolicyRow = Record<ActionOrigin, ActionPolicyDecision>;

export interface ActionPolicy {
  goto: ActionPolicyRow;
  named: ActionPolicyRow;
  hide: ActionPolicyRow;
  'reset-form': ActionPolicyRow;
  javascript: ActionPolicyRow;
  uri: ActionPolicyRow;
  /** The Named `Print` verb — owned by policy + the UI adapter, never stage.
   *  (An Adobe-compat extension: ISO Table 215 defines only the four page
   *  verbs; an unrecognized name "shall take no action".) */
  print: ActionPolicyRow;
  /** SubmitForm — `'adapter'` routes through the sink chain. Default: user
   *  origin only; hover/lifecycle submits stay blocked. */
  'submit-form': ActionPolicyRow;
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
  /**
   * THE JavaScript switch (relocated from `formPlugin({ scripting })`).
   * Default off — no VM ever loads. When enabled, the plugin owns the ONE
   * per-document ScriptHost realm, registers the real `javascript` executor,
   * and exposes the transaction port on the host lens (form's K/V/C/F
   * pipeline rides it).
   */
  javascript?: {
    enabled: boolean;
    /** Override the lazy QuickJS factory (tests or another isolated VM). */
    sandboxFactory?: ScriptSandboxFactory;
    /** Embedder identity fields layered over engine/JWT identity. */
    identity?: Partial<ScriptIdentity> | (() => Partial<ScriptIdentity>);
    fileName?: () => string;
    /** Injected deterministic transaction environment. */
    now?: () => number;
    utcOffsetMinutes?: () => number;
    randomSeed?: () => number;
    budget?: ScriptBudget;
    /**
     * D11's deterministic aggregate: the max JS nodes ONE dispatch may run
     * (a /Next chain shares this instead of multiplying the per-run time
     * budget; a wall-clock aggregate would be the flake class we banned).
     * Exhausted → remaining JS nodes report inert with a budget reason.
     */
    maxScriptNodesPerDispatch?: number;
  };
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

// ── owner commit sinks (D3) — full ISO: every script/Hide effect is a
// DOCUMENT mutation committed by the plugin that owns the model, so the
// engine write and the visible model can never diverge. Calling contract:
// invoked from inside the actions/form serialized operations (the script
// executor calls them while HOLDING the host transaction); a sink never
// enqueues and never acquires the host — the proven deadlock class.

/** One annotation-effect commit entry. `pageObjectNumber` may be absent for
 *  bare Hide object-number targets — the sink resolves it from its model
 *  (`obj:N` is a cross-page key there); unresolvable entries fail honestly. */
export interface AnnotCommitEntry {
  annotObjectNumber: number;
  pageObjectNumber?: number;
  patch: ScriptAnnotEffect['patch'];
}
export interface AnnotCommitResult {
  results: Array<{
    annotObjectNumber: number;
    status: 'applied' | 'failed' | 'skipped';
    error?: string;
  }>;
}
export type AnnotCommitSink = (entries: AnnotCommitEntry[]) => Promise<AnnotCommitResult>;

/** The form plugin's document commit: engine `applyEffects` + snapshot
 *  reconciliation (its existing commit tail, extracted). */
export type FormCommitSink = (effects: FormEffect[]) => Promise<FormEffectsResult>;

/** What a script transaction surfaced besides document effects. */
export interface ScriptSurfaceResult {
  uiEffects: ScriptUiEffect[];
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
  origin: ActionOrigin;
  phase: 'boot' | 'user';
}

/** Origin/phase context every script-produced UI request carries — the
 *  DEFAULT adapter's visibility matrix keys on it; embedder adapters receive
 *  everything and decide for themselves. */
export interface ActionUiContext {
  origin: ActionOrigin;
  /** Script-model axis: `'boot'` = name-tree/document-open boot scripts. */
  phase: 'boot' | 'user';
}

export interface ActionUiAdapter {
  openUri(uri: string, opts: { isMap: boolean; origin: ActionOrigin }): void;
  /** The Named `Print` verb AND script `print()` requests (authority-gated
   *  upstream — `doc.print` refusals never reach the adapter). */
  print(opts?: ActionUiContext): void;
  /** Script `app.alert` — the ONE alert port for every script origin. */
  alert?(message: string, opts: ActionUiContext & { icon: number; title?: string }): void;
  /** Script `this.pageNum = n` navigation requests. */
  gotoPage?(page: number, opts: ActionUiContext): void;
}

// ── the submit pipeline (D7: one intent, one resolver, one sink chain) ─────

/**
 * A normalized submit INTENT — one shape for both sources: a SubmitForm
 * action node's extracted payload, or a script `doc.submitForm()` effect
 * (include-mode names, `exclude` false). Resolution into a dataset is the
 * FORM plugin's job (it owns the field plane) via the registered resolver.
 */
export interface SubmitIntent {
  url: string | null;
  /** Table-239 targets (mixed names/object numbers); `null` = the whole
   *  eligible form. */
  fields: PdfActionTargetRef[] | null;
  exclude: boolean;
  includeNoValueFields: boolean;
  format: 'fdf' | 'html' | 'xfdf' | 'pdf';
  method: 'post' | 'get';
  /** Raw ISO Table 240 word (0 for scripted submits without one). */
  flagsRaw: number;
  charSet?: string;
}

/**
 * The resolved dataset a sink receives. Entries carry the ISO semantics
 * already applied (descendants, the unconditional NoExport veto,
 * push-button/unsupported exclusion — diagnosed, never silent); the
 * document's declared routing survives as METADATA. The stack never
 * fetches `url` — an embedder handler that chooses to must validate it
 * (protocol + destination allowlists) before any network call.
 */
export interface ActionSubmitRequest {
  url: string | null;
  method: 'post' | 'get';
  format: 'fdf' | 'html' | 'xfdf' | 'pdf';
  flagsRaw: number;
  charSet?: string;
  entries: FormSubmissionEntry[];
  origin: ActionOrigin;
  event: ActionTriggerEvent;
}

/**
 * Sink 1 of the chain: the embedder's application. Consent = installation
 * (it receives nothing the embedder couldn't already compute from
 * `forms.list()` under `doc.forms.read`, so no submit scope gates it).
 * Contract: synchronous acceptance marks the node `executed` — "handed to
 * the embedder", NOT "delivered"; a synchronous throw marks it `failed`; a
 * returned promise is DETACHED and a later rejection emits a diagnostic
 * only. `submitToDocumentHome` lets a handler COMPOSE with sink 2 (present
 * only when the document has a submit-capable home).
 */
export type ActionSubmitHandler = (
  request: ActionSubmitRequest,
  ctx: { submitToDocumentHome: (() => Promise<FormSubmissionReceipt>) | null },
) => void | Promise<void>;

/** The form plugin's dataset resolver — registered on the host lens.
 *  `diagnose` is the per-entry observability channel (the honesty rule: an
 *  explicitly listed push-button/signature/unsupported value is DIAGNOSED
 *  as `submit-entry-unsupported`, never silently dropped). */
export type SubmitResolver = (
  intent: SubmitIntent,
  ctx: ActionContext,
  diagnose: (diagnostic: ActionDiagnostic) => void,
) => Promise<ActionSubmitRequest>;

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
  /**
   * Run one embedder-owned document verb as ONE serialized queue operation:
   * open-ordering guard → before-event tree (WS/WP) → `operation()` →
   * after-event tree (DS/DP). Two concurrent calls can never interleave
   * their phases. Laws: a before-event failure never cancels the operation;
   * `operation()` throwing skips the after-event and rethrows; the whole
   * body honors `triggers.document: false` (trees skipped, operation still
   * runs); print verbs hold the document-print latch, so nested
   * `doc.print()` calls are suppressed with a `reentrant-print` diagnostic.
   * The queue is deliberately held for the operation's duration — that IS
   * the serialization (WS mutations are in the bytes a save operation
   * pulls).
   */
  runDocumentVerb<T>(verb: 'save' | 'print', operation: () => Promise<T> | T): Promise<T>;
  /**
   * The cooperative WC door (D4): runs the catalog will-close tree (open
   * ordering guaranteed) and resolves when its effects are committed. Call
   * `documents.close()` AFTER this resolves. Scripts never run inside
   * teardown — closing without this call is a named Acrobat-parity
   * deviation, not an error.
   */
  prepareClose(): Promise<ActionTriggerResult>;
  /**
   * Sink 1 of the submit chain (identity-safe slot, like the UI adapter —
   * but installing it does NOT arm the open-sequence latch). With no
   * handler and no submit-capable document home, submits block with a
   * `no-submit-sink` diagnostic.
   */
  setSubmitHandler(handler: ActionSubmitHandler | null): Unsubscribe;
  onAction: EventHook<ActionDispatchEvent>;
  onDiagnostic: EventHook<ActionDiagnostic>;
  /** Script-plane observability (dispatch-driven AND K/V/C/F-driven — the
   *  form pipeline surfaces through the same doors). */
  onScriptDiagnostic: EventHook<ScriptDiagnostic>;
  onScriptError: EventHook<ScriptExecutionError>;
}

/** HOST lens — plugin-to-plugin only; import the token from
 *  `@embedpdf/plugin-actions/contract/host`, never from application code. */
export interface ActionsHostCapability extends ActionsCapability {
  /** Deterministic LAST-WINS on duplicates (a `duplicate-executor`
   *  diagnostic is emitted); the disposer removes the entry only while it is
   *  still the current one. */
  registerExecutor(type: PdfActionType, executor: ActionExecutor): Unsubscribe;
  registerAnnotCommitSink(sink: AnnotCommitSink): Unsubscribe;
  registerFormCommitSink(sink: FormCommitSink): Unsubscribe;
  /**
   * The realm transaction port — present ONLY when `javascript.enabled`
   * (its presence IS form's "scripting on" signal). The body must perform
   * prefetch, runs, sink commits, and reconciliation before returning
   * (commit-inside-the-boundary).
   */
  scriptTransaction?<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  /** Surface a script transaction's UI effects/diagnostics/error through the
   *  ONE port (adapter matrix + authority print gate + script hooks). */
  surfaceScriptResult(result: ScriptSurfaceResult): void;
  /** Stage's page-truth push door — see {@link PageStateReport}. */
  reportPageState(report: PageStateReport): void;
  /**
   * The form plugin's dataset resolver (D7): both submit sources — action
   * nodes and script `doc.submitForm()` effects — normalize to a
   * {@link SubmitIntent} and resolve through this one door. Identity-safe;
   * without it every submit blocks with `no-submit-resolver`.
   */
  registerSubmitResolver(resolver: SubmitResolver): Unsubscribe;
}

export interface ActionsState {
  /** Monotonic dispatch counter — store-visible observability. */
  seq: number;
}

export type ActionsAction = { type: 'ACTIONS_DISPATCHED' };

export const ActionsToken = createCapabilityToken<ActionsCapability>('actions', {
  hint: `add actionsPlugin() from '@embedpdf/plugin-actions' to your plugins list`,
});
