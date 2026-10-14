/**
 * @embedpdf/plugin-actions/contract: the public action vocabulary: triggers,
 * contexts, results, policy, the UI adapter and submit handler ports, and
 * the capability itself. Sibling-plugin registration (commit sinks, script
 * realms, the page-state report) is the host lens (`/contract/host`).
 */
import type {
  DeepPartial,
  EventHook,
  OperationOptions,
  SettingsApi,
  Unsubscribe,
} from '@embedpdf/core';
import type {
  ScriptBudget,
  ScriptDiagnostic,
  ScriptExecutionError,
  ScriptIdentity,
  ScriptSandboxFactory,
} from '@embedpdf/core-acrojs';
import type {
  AnnotationRef,
  FormFieldRef,
  FormSubmissionEntry,
  FormSubmissionReceipt,
  PageRef,
  PdfActionNode,
  PdfActionTargetRef,
  PdfActionTree,
  PdfActionType,
} from '@embedpdf/engine-core/runtime';

export { ActionsToken } from './token';
/** The action trees the verbs take and resolve: what a PDF's links, buttons, pages and document carry. */
export type { PdfActionNode, PdfActionTree, PdfActionType } from '@embedpdf/engine-core/runtime';
export { createHoverPump } from './hover-pump';
export type { HoverPump, HoverTarget } from './hover-pump';
export { submitEntriesToUrlEncoded } from './submit-encoding';

// ── the when/who axes ──────────────────────────────────────────────────────

/** Why a dispatch happened: `'user'` for a real activation gesture,
 *  `'hover'` for pointer enter and exit, `'lifecycle'` for page and document
 *  events. The policy decides per type and origin. */
export type ActionOrigin = 'user' | 'hover' | 'lifecycle';

/** Who initiated the dispatch. Fields are required where an executor needs
 *  them: the JavaScript executor builds `event.target` from the widget
 *  source's `field`. Provenance only: policy never reads it. */
export type ActionSource =
  | { kind: 'widget'; field: FormFieldRef; annotation: AnnotationRef; page: PageRef }
  | { kind: 'link'; annotation?: AnnotationRef; page?: PageRef }
  /** A non-widget annotation's own /AA event (E/X on squares, stamps, …). */
  | { kind: 'annotation'; annotation: AnnotationRef; page: PageRef }
  /** A page /AA tree (O/C) inside a page-trigger fan-out. */
  | { kind: 'page'; page: PageRef }
  /** The document-open sequence (openDestination / OpenAction). */
  | { kind: 'document' }
  | { kind: 'api' };

/** The document lifecycle vocabulary: `open` (the document-open sequence)
 *  plus the five catalog `/AA` verbs (ISO 32000-2 Table 200: /WC, /WS, /DS,
 *  /WP, /DP). Whoever owns the verb dispatches them; `runDocumentVerb` is the
 *  serialized door for save and print, `prepareClose` for close. */
export type DocumentTriggerEvent =
  | 'open'
  | 'will-save'
  | 'did-save'
  | 'will-print'
  | 'did-print'
  | 'will-close';

/** Trigger provenance, derived beside {@link triggerOriginOf}: the
 *  executor-visible "which event fired" (cursorEnter and cursorExit are both
 *  `origin: 'hover'`; this carries the difference). */
export type ActionTriggerEvent =
  | { scope: 'activate' }
  | { scope: 'annotation'; name: PdfAnnotationEventKind }
  | { scope: 'page'; name: 'open' | 'close' | 'visible' | 'invisible' }
  | { scope: 'document'; name: DocumentTriggerEvent };

/** The four field-level /AA scripts (ISO Table 198: K F V C). */
export type PdfFieldEventKind = 'keystroke' | 'format' | 'validate' | 'calculate';

/** The Named verbs the viewer interprets (ISO Table 215's four page verbs
 *  plus Adobe's `Print`); any other name is accepted and reported inert. */
export type PdfNamedAction =
  | 'NextPage'
  | 'PrevPage'
  | 'FirstPage'
  | 'LastPage'
  | 'Print'
  | (string & {});

/**
 * Where an action tree lives, for {@link ActionsCapability.getActionTree}.
 * Each arm names its own event vocabulary; the annotation arm defaults to
 * the /A click tree, the page and document arms to their open trees.
 */
export type ActionTreeSource =
  | {
      kind: 'annotation';
      annotation: AnnotationRef;
      page: PageRef;
      event?: 'activate' | PdfAnnotationEventKind;
    }
  | { kind: 'field'; field: FormFieldRef; event: PdfFieldEventKind }
  | { kind: 'page'; page: PageRef; event?: 'open' | 'close' }
  | { kind: 'document'; event?: DocumentTriggerEvent };

/** The document-open sequence has run (once per document). */
export interface OpenSequenceCompletedEvent {
  readonly result: ActionTriggerResult;
}

export interface ActionContext {
  origin: ActionOrigin;
  source: ActionSource;
  event: ActionTriggerEvent;
}

/** The six annotation /AA pointer and focus events (ISO 32000-2 Table 197:
 *  /E /X /D /U /Fo /Bl). The page-lifecycle events (/PO /PC /PV /PI) are not
 *  here: they fan out from page triggers, never from per-annotation dispatch. */
export type PdfAnnotationEventKind =
  | 'cursorEnter'
  | 'cursorExit'
  | 'mouseDown'
  | 'mouseUp'
  | 'focus'
  | 'blur';

/**
 * Trigger vocabulary: what a feed reports. The dispatcher resolves trees,
 * derives the origin ({@link triggerOriginOf}) and fans out. `source` on the
 * annotation-addressed arms is an optional provenance hint from first-party
 * feeds (a widget feed passes its field ref so the JavaScript executor can
 * anchor `event.target`); policy never reads it and it cannot change origin.
 */
export type ActionTrigger =
  | { scope: 'activate'; ref: AnnotationRef; page: PageRef; source?: ActionSource }
  | {
      scope: 'annotation';
      event: PdfAnnotationEventKind;
      ref: AnnotationRef;
      page: PageRef;
      source?: ActionSource;
    }
  | { scope: 'page'; event: 'open' | 'close' | 'visible' | 'invisible'; page: PageRef }
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

/** The one origin mapping, derived by the dispatcher and never claimed by a
 *  caller: a feed cannot launder a hover into a user gesture. */
export const triggerOriginOf = (trigger: ActionTrigger): ActionOrigin => {
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
    | 'trigger-disabled' // the `triggers` setting turned this family off
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
 * One logical dispatch transaction's outcome. Document-lifetime work is not
 * rolled back: an earlier successful reset or script write survives a later
 * failure; `status: 'partial'` says so, and `nodes` carries the per-node
 * truth. `'cancelled'`: the caller's signal fired while the tree ran, so the
 * walk stopped before its next node and no navigation or external effect
 * fired.
 */
export interface ActionDispatchResult {
  status: 'executed' | 'partial' | 'inert' | 'refused' | 'cancelled';
  nodes: ActionNodeResult[];
  diagnostics: ActionDiagnostic[];
}

/**
 * One tree's execution inside a trigger: its true source, its true tree, its
 * own node results (`path`s are real walk paths, never prefixed).
 * `onExecuted` fires once per step with exactly this tree and a context
 * built from this source, so fan-out never merges trees in the event.
 */
export interface ActionStepResult {
  source: ActionSource;
  tree: PdfActionTree;
  result: ActionDispatchResult;
}

/**
 * What `dispatch(trigger)` returns: the aggregate plus per-step truth. A step
 * failure never skips sibling steps (a broken annotation /PC must not cancel
 * the page's /C); deferred navigation and external effects flush per step,
 * not per trigger.
 */
export interface ActionTriggerResult {
  /** `'cancelled'`: the caller's signal fired before or while the trigger ran. */
  status: 'executed' | 'partial' | 'inert' | 'refused' | 'cancelled';
  steps: ActionStepResult[];
  /** Trigger-level diagnostics (disabled family, resolution failure);
   *  per-node diagnostics live inside each step's `result`. */
  diagnostics: ActionDiagnostic[];
}

// ── events ─────────────────────────────────────────────────────────────────

/** Actions ran: one tree, whatever started it (a click, a page, the document, your code). */
export interface ActionExecutedEvent {
  readonly tree: PdfActionTree;
  readonly result: ActionDispatchResult;
  /** What started them. */
  readonly source: ActionSource;
}

/**
 * An action was blocked, reported or couldn't run. `action` is its type and
 * `source` what started it; both are `null` for a diagnostic about no one
 * action (a trigger family turned off, an executor replaced). The result of
 * the run that reported it lists the same diagnostic with its message.
 */
export interface ActionDiagnosticReportedEvent {
  readonly code: ActionDiagnostic['code'];
  readonly action: PdfActionType | null;
  readonly source: ActionSource | null;
}

/**
 * A script was stopped from doing something, such as reaching the network,
 * or used something the viewer doesn't support.
 */
export type ScriptDiagnosticReportedEvent = Readonly<ScriptDiagnostic>;

/**
 * A script threw an error. `source` is what started it, or `null` for a
 * script no action started: a form field's keystroke, format, validate or
 * calculate script, or a stamp's template.
 */
export interface ScriptFailedEvent {
  readonly error: ScriptExecutionError;
  readonly source: ActionSource | null;
}

// ── policy ─────────────────────────────────────────────────────────────────

/** The decision per type and origin. `allow` executes; `adapter` routes
 *  through the type's port (the UI adapter; for `submit-form`, the sink
 *  chain: embedder handler → the document's home → blocked); `report`
 *  records a blocked node without executing; `block` refuses. The `launch`,
 *  `goto-remote`, `goto-embedded` and media types are fixed `'never'` and
 *  not configurable. */
export type ActionPolicyDecision = 'allow' | 'adapter' | 'report' | 'block';
export type ActionPolicyRow = Readonly<Record<ActionOrigin, ActionPolicyDecision>>;

export interface ActionPolicy {
  readonly goto: ActionPolicyRow;
  readonly named: ActionPolicyRow;
  readonly hide: ActionPolicyRow;
  readonly 'reset-form': ActionPolicyRow;
  readonly javascript: ActionPolicyRow;
  readonly uri: ActionPolicyRow;
  /** The Named `Print` verb, owned by policy and the UI adapter, never the
   *  stage. (An Acrobat-compatible extension: ISO 32000-2 Table 215 defines
   *  only the four page verbs; an unrecognized name "shall take no action".) */
  readonly print: ActionPolicyRow;
  /** SubmitForm: `'adapter'` routes through the sink chain. Default: user
   *  origin only; hover and lifecycle submits stay blocked. */
  readonly 'submit-form': ActionPolicyRow;
}

/** Who scripts think the user is: fields over the document's user, or a function that returns them. */
export type ActionsScriptIdentity = Partial<ScriptIdentity> | (() => Partial<ScriptIdentity>);

/**
 * The actions plugin's settings. `actionsPlugin(config)` registers them over
 * {@link ACTIONS_DEFAULTS}, and `updateSettings()` changes them for every
 * document while the app runs. `policy`, `triggers` and
 * `javascript.identity` apply to the next action; `javascript.enabled`
 * applies to the documents opened after the change (a document's script
 * engine starts when it opens); `openSequence` applies until a document's
 * opening actions have run.
 */
export interface ActionsSettings {
  /** The rules: per kind of action and per origin. Rows merge, so a change names only what it changes. */
  readonly policy: ActionPolicy;
  /** Run the actions of the `document`, its `page`s, or `annotation`s. A click on a link or button always runs. */
  readonly triggers: {
    readonly document: boolean;
    readonly page: boolean;
    readonly annotation: boolean;
  };
  /**
   * When the document's opening actions run (the open destination, then the
   * catalog /OpenAction, then the first page's /O). `'auto'` runs them once
   * at the first sign of a person: a UI adapter installing, or a first
   * click; the first page's /O then comes from the Stage's page report.
   * `'headless'` runs them as the document opens, for an app without a
   * Stage; `'off'` never runs them.
   */
  readonly openSequence: 'auto' | 'headless' | 'off';
  readonly javascript: {
    /** Run the document's JavaScript. Off by default: no script engine ever loads. */
    readonly enabled: boolean;
    /** Who scripts think the user is, on top of the document's user. `null`: the document's user. */
    readonly identity: ActionsScriptIdentity | null;
  };
}

/** What the actions settings are when the app registers none. */
export const ACTIONS_DEFAULTS: ActionsSettings = {
  policy: {
    goto: { user: 'allow', hover: 'allow', lifecycle: 'allow' },
    named: { user: 'allow', hover: 'allow', lifecycle: 'allow' },
    hide: { user: 'allow', hover: 'allow', lifecycle: 'allow' },
    'reset-form': { user: 'allow', hover: 'allow', lifecycle: 'allow' },
    javascript: { user: 'allow', hover: 'allow', lifecycle: 'allow' },
    // No tab opens by itself: only a real click reaches the adapter.
    uri: { user: 'adapter', hover: 'report', lifecycle: 'report' },
    print: { user: 'adapter', hover: 'block', lifecycle: 'block' },
    // Form data leaves the viewer only on a click: handler, then the document's home.
    'submit-form': { user: 'adapter', hover: 'block', lifecycle: 'block' },
  },
  triggers: { document: true, page: true, annotation: true },
  openSequence: 'auto',
  javascript: { enabled: false, identity: null },
};

/**
 * The script environment, given once when the plugin is registered: not a
 * setting, because a document's script engine is built with it when the
 * document opens.
 */
export interface ActionsScriptEnvironment {
  /** Override the lazy QuickJS factory (tests or another isolated VM). */
  readonly sandboxFactory?: ScriptSandboxFactory;
  readonly fileName?: () => string;
  /** Injected deterministic transaction environment. */
  readonly now?: () => number;
  readonly utcOffsetMinutes?: () => number;
  readonly randomSeed?: () => number;
  readonly budget?: ScriptBudget;
  /**
   * The deterministic aggregate: the most JavaScript nodes one dispatch may
   * run (default 16). A /Next chain shares it instead of multiplying the
   * per-run time budget, and a count stays deterministic where a wall-clock
   * aggregate would not. Once exhausted, the remaining JavaScript nodes
   * report inert with a budget reason.
   */
  readonly maxScriptNodesPerDispatch?: number;
}

/**
 * What `actionsPlugin(config)` takes: any of the settings, merged over the
 * defaults, and the script environment beside `javascript`'s settings.
 */
export interface ActionsConfig extends DeepPartial<Omit<ActionsSettings, 'javascript'>> {
  readonly javascript?: DeepPartial<ActionsSettings['javascript']> & ActionsScriptEnvironment;
}

// ── registration surfaces (host lens) ──────────────────────────────────────

export type ActionExecutorResult =
  | { status: 'executed' }
  | { status: 'inert'; reason: string }
  | { status: 'failed'; error: string };

/** One node of one registered type, executed in dispatch order. Executors
 *  never see the tree or the capability, so an executor cannot cascade into
 *  further dispatches. */
export type ActionExecutor = (
  node: PdfActionNode,
  actionContext: ActionContext,
) => Promise<ActionExecutorResult> | ActionExecutorResult;

/** The origin and phase every script-produced UI request carries: the
 *  default adapter's visibility matrix keys on it; embedder adapters receive
 *  everything and decide for themselves. */
export interface ActionUiContext {
  origin: ActionOrigin;
  /** Script-model axis: `'boot'` = name-tree/document-open boot scripts. */
  phase: 'boot' | 'user';
}

export interface ActionUiAdapter {
  /** A URI action to open; `isMap` is the /IsMap flag. */
  openUri(uri: string, options: { isMap: boolean; origin: ActionOrigin }): void;
  /** The Named `Print` verb and script `print()` requests (authority-gated
   *  upstream: `doc.print` refusals never reach the adapter). */
  print(uiContext?: ActionUiContext): void;
  /** Script `app.alert`: the one alert port for every script origin. */
  alert?(message: string, options: ActionUiContext & { icon: number; title?: string }): void;
  /** Script `this.pageNum = n` navigation requests. */
  gotoPage?(page: number, uiContext: ActionUiContext): void;
}

// ── the submit pipeline: one intent, one resolver, one sink chain ──

/**
 * A normalized submit intent, one shape for both sources: a SubmitForm action
 * node's extracted payload, or a script `doc.submitForm()` effect
 * (include-mode names, `exclude` false). Resolving it into a dataset is the
 * form plugin's job (it owns the field plane), through the registered
 * resolver.
 */
export interface SubmitIntent {
  url: string | null;
  /** ISO 32000-2 Table 239 targets (names and object numbers mixed); `null`
   *  is the whole eligible form. */
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
 * already applied (descendants, the unconditional NoExport veto, push-button
 * and unsupported exclusion, diagnosed and never silent); the document's
 * declared routing survives as metadata. The stack never fetches `url`: an
 * embedder handler that chooses to must validate it (protocol and
 * destination allowlists) before any network call.
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
 * The first sink of the chain: the embedder's application. Installing it is
 * the consent (it receives nothing the embedder could not already compute
 * from `forms.list()` under `doc.forms.read`, so no submit scope gates it).
 * Contract: synchronous acceptance marks the node `executed` ("handed to the
 * embedder", not "delivered"); a synchronous throw marks it `failed`; a
 * returned promise is not awaited, and a later rejection only emits a
 * diagnostic. `submitToDocumentHome` lets a handler compose with the second
 * sink (present only when the document has a submit-capable home).
 */
export type ActionSubmitHandler = (
  request: ActionSubmitRequest,
  chain: { submitToDocumentHome: (() => Promise<FormSubmissionReceipt>) | null },
) => void | Promise<void>;

// ── capabilities ───────────────────────────────────────────────────────────

/**
 * The public capability, for embedders and chrome. Each `can*` twin takes the
 * same arguments as its verb and answers "would the dispatcher accept this
 * and attempt execution" (per-node truth lives in the result's `nodes`). Its
 * settings (`getSettings`, `updateSettings`, `resetSettings`,
 * `onSettingsChanged`) belong to the plugin, not to a document: a change
 * reaches every open document.
 */
export interface ActionsCapability extends SettingsApi<ActionsSettings> {
  /**
   * Run a resolved tree on the dispatch queue and fire `onExecuted`; a
   * failing node is reported in the result, not thrown. Rejects
   * `operation-cancelled` when `options.signal` fires: before the tree
   * starts, nothing runs; while it runs, it stops before its next node.
   */
  execute(
    tree: PdfActionTree,
    actionContext: ActionContext,
    options?: OperationOptions,
  ): Promise<ActionDispatchResult>;
  /** The tree is complete and its root node's policy decision is `allow` or `adapter`. */
  canExecute(tree: PdfActionTree, actionContext: ActionContext): boolean;
  /**
   * Run one Named verb (`NextPage`, `Print`, …) as a user-origin action
   * without building a tree — the programmatic twin of a Named link click.
   * `context` overrides the default `{ origin: 'user', source: { kind: 'api' } }`.
   * Rejects `operation-cancelled` like `execute()`.
   */
  executeNamed(
    name: PdfNamedAction,
    context?: Partial<ActionContext>,
    options?: OperationOptions,
  ): Promise<ActionDispatchResult>;
  /**
   * Whether the rules would run this Named verb from `context` (a click from
   * your code by default); `'Print'` also needs `doc.print`.
   */
  canExecuteNamed(name: PdfNamedAction, context?: Partial<ActionContext>): boolean;
  /**
   * Read the /A or /AA tree behind a source straight from the document
   * (`null` when absent). This is the raw tree: dispatch-time rules such as
   * ISO 32000-2 Table 197's "/A shadows /AA U" are not applied here. Rejects
   * `operation-cancelled` when `options.signal` fires.
   */
  getActionTree(
    source: ActionTreeSource,
    options?: OperationOptions,
  ): Promise<PdfActionTree | null>;
  /** Did `javascript.enabled` take effect — a script realm exists for this
   *  document. */
  isScriptingEnabled(): boolean;
  /**
   * Report a trigger. Submission is synchronous: the queue slot is taken
   * before this returns, so two dispatch calls execute in call order even
   * when their resolutions race; all reads happen inside the queued
   * operation. Never rejects: resolution failures come back as `refused`
   * with a `trigger-failed` diagnostic, and a fired `options.signal` as
   * `cancelled`, so `void dispatch(...)` is safe.
   */
  dispatch(trigger: ActionTrigger, options?: OperationOptions): Promise<ActionTriggerResult>;
  /** The trigger's family is enabled (the `triggers` setting). */
  canDispatch(trigger: ActionTrigger): boolean;
  /** Identity-safe port install: the returned disposer clears the slot only
   *  while this adapter is still current; `null` force-clears. Installing an
   *  adapter fires an armed document-open sequence. */
  setUiAdapter(adapter: ActionUiAdapter | null): Unsubscribe;
  /**
   * Run one embedder-owned document verb as one serialized queue operation:
   * the document-open sequence if it is still armed → the before-event tree
   * (/WS, /WP) → `operation()` → the after-event tree (/DS, /DP). Two
   * concurrent calls never interleave their phases. A before-event failure
   * never cancels the operation; `operation()` throwing skips the
   * after-event and rethrows; the whole body honors `triggers.document:
   * false` (trees skipped, operation still runs); print verbs hold the
   * document-print latch, so nested `doc.print()` calls are suppressed with
   * a `reentrant-print` diagnostic. The queue is held for the operation's
   * duration on purpose: that is the serialization (/WS mutations are in the
   * bytes a save operation pulls). `options.signal` firing before
   * `operation()` starts skips it and rejects `operation-cancelled`; once it
   * has started, it finishes, and so does the after-event.
   */
  runDocumentVerb<T>(
    verb: 'save' | 'print',
    operation: () => Promise<T> | T,
    options?: OperationOptions,
  ): Promise<T>;
  /**
   * The cooperative /WC door: runs the catalog will-close tree (after the
   * document-open sequence) and resolves when its effects are committed.
   * Call `documents.close()` after this resolves. Scripts never run inside
   * teardown, so closing without this call skips /WC (unlike Acrobat); it is
   * not an error. Never rejects, like `dispatch()`.
   */
  prepareClose(options?: OperationOptions): Promise<ActionTriggerResult>;
  /**
   * The first sink of the submit chain (an identity-safe slot like the UI
   * adapter, but installing it does not fire the document-open sequence).
   * With no handler and no submit-capable document home, submits block with
   * a `no-submit-sink` diagnostic.
   */
  setSubmitHandler(handler: ActionSubmitHandler | null): Unsubscribe;
  /**
   * Interpret (or override) one action type from application code: the same
   * door the stage and form plugins use for GoTo, Named, Hide and ResetForm.
   * Deterministic last-wins on duplicates (a `duplicate-executor` diagnostic
   * is reported); the disposer removes the entry only while it is still the
   * current one.
   */
  registerExecutor(type: PdfActionType, executor: ActionExecutor): Unsubscribe;
  /** Actions ran, whatever started them: one event per tree. */
  readonly onExecuted: EventHook<ActionExecutedEvent>;
  /** An action was blocked, reported or couldn't run; also dispatch, sink and budget problems. */
  readonly onDiagnosticReported: EventHook<ActionDiagnosticReportedEvent>;
  /** A script was stopped from doing something, or used something the viewer doesn't support. */
  readonly onScriptDiagnosticReported: EventHook<ScriptDiagnosticReportedEvent>;
  /** A script run ended with an error. */
  readonly onScriptFailed: EventHook<ScriptFailedEvent>;
  /** The document-open sequence ran (OpenAction / open destination). */
  readonly onOpenSequenceCompleted: EventHook<OpenSequenceCompletedEvent>;
}
