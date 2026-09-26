/**
 * @embedpdf/plugin-actions/contract/host: the host lens, what sibling
 * plugins (stage, annotation, link, form) need to register commit sinks,
 * the submit resolver, script realms and the page-state report. Same
 * runtime token as the public one, typed wider.
 */
import { createHostToken, type DocumentMeta, type Unsubscribe } from '@embedpdf/core';
import type {
  ScriptAnnotEffect,
  ScriptBudget,
  ScriptDiagnostic,
  ScriptExecutionError,
  ScriptTransaction,
  ScriptUiEffect,
} from '@embedpdf/core-acrojs';
import type {
  DocumentHandle,
  FormEffect,
  FormEffectsResult,
  PageRef,
} from '@embedpdf/engine-core/runtime';

import type {
  ActionContext,
  ActionDiagnostic,
  ActionOrigin,
  ActionsCapability,
  ActionSubmitRequest,
  SubmitIntent,
} from './contract';
import { ActionsToken as PublicActionsToken } from './token';

export * from './contract';

/**
 * The stage's page-truth report, the one door into the lifecycle
 * coordinator. The stage stays authoritative for what page the viewer is on;
 * the coordinator owns when page-lifecycle triggers fire: reports are
 * buffered until the document-open sequence has run and diffed against the
 * last-emitted state, so pre-open motion (a restored view, the open
 * destination's reveal) never emits close and open churn. `cause` feeds the
 * cascade budget: consecutive programmatic rounds are capped, and a
 * user-caused report resets the count.
 */
export interface PageStateReport {
  currentPage: PageRef | null;
  visiblePages: readonly PageRef[];
  /** False until layout exists; pre-placement reports are ignored. */
  placed: boolean;
  cause: 'user' | 'programmatic';
}

// ── owner commit sinks ──
// Every script and Hide effect is a document mutation committed by the plugin
// that owns the model, so the engine write and the visible model never
// diverge. Sinks are invoked from inside the actions and form serialized
// operations (the script executor calls them while holding the host
// transaction), so a sink must never enqueue and never acquire the host:
// either would deadlock.

/** One annotation-effect commit entry. `page` may be absent for bare Hide
 *  object-number targets: the sink resolves it from its model (`obj:N` is a
 *  cross-page key there), and entries it cannot resolve fail. */
export interface AnnotCommitEntry {
  annotObjectNumber: number;
  page?: PageRef;
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

/**
 * Which realm produced a script result. `'document'` = this document's own
 * realm: every effect targets the viewer document. `'detached'` = a realm
 * minted for a document that is not displayed (a stamp asset): it has no
 * document surface, so only alerts reach the adapter — print, page
 * navigation, and submit are suppressed with a diagnostic rather than
 * acting on the wrong document.
 */
export type ScriptRealmKind = 'document' | 'detached';

/** What a script transaction surfaced besides document effects. */
export interface ScriptSurfaceResult {
  uiEffects: ScriptUiEffect[];
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
  origin: ActionOrigin;
  phase: 'boot' | 'user';
  realm: ScriptRealmKind;
}

/** A K/V/C/F transaction's result as the form controller reports it: effects
 *  carry their own phase (boot effects belong to the first transaction that
 *  lazily booted the realm). Structurally the surface half of the form
 *  plugin's commit result, typed here so the actions plane never imports the
 *  form package. */
export interface ScriptCommitSurface {
  uiEffects: Array<ScriptUiEffect & { phase: 'boot' | 'user' }>;
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
}

// ── script realms ──

/** What a realm is minted for. `doc` is the document the scripts operate on
 *  (the viewer document, or a detached asset); `document()` is the metadata
 *  scripts observe (`this.documentFileName` …): for a detached stamp that is
 *  the target document's, matching Acrobat's dynamic stamps. */
/** What a script realm reads of the document it runs for. */
export type ScriptDocument = Pick<DocumentMeta, 'name' | 'pageCount' | 'pages'>;

export interface ScriptRealmTarget {
  doc: DocumentHandle;
  document(): ScriptDocument | null;
  /** Name-tree programs, fetched lazily once per realm build. */
  bootSources(): Promise<string[]>;
}

/** The realm transaction port plus the budget consumers apply as their
 *  transaction aggregate: the same shape whether the realm is this document's
 *  own (owned by actions) or a detached one (owned by the caller). */
export interface ScriptRealmPort {
  /** The body must perform prefetch, runs, sink commits and reconciliation
   *  before returning: commits happen inside the transaction. */
  transaction<T>(body: (transaction: ScriptTransaction) => Promise<T>): Promise<T>;
  budget: ScriptBudget;
}

/** A detached realm: the caller owns its lifetime. */
export interface DetachedScriptRealm extends ScriptRealmPort {
  dispose(): void;
}

/** The form plugin's dataset resolver, registered on the host lens.
 *  `diagnose` is the per-entry observability channel: an explicitly listed
 *  push-button, signature or unsupported value is diagnosed as
 *  `submit-entry-unsupported`, never silently dropped. */
export type SubmitResolver = (
  intent: SubmitIntent,
  actionContext: ActionContext,
  diagnose: (diagnostic: ActionDiagnostic) => void,
) => Promise<ActionSubmitRequest>;

/** The host lens, plugin-to-plugin only: import the token from
 *  `@embedpdf/plugin-actions/contract/host`, never from application code. */
export interface ActionsHostCapability extends ActionsCapability {
  /** The annotation plugin's commit sink for script and Hide annotation effects. Identity-safe. */
  registerAnnotCommitSink(sink: AnnotCommitSink): Unsubscribe;
  /** The form plugin's commit sink for script and Hide form effects. Identity-safe. */
  registerFormCommitSink(sink: FormCommitSink): Unsubscribe;
  /**
   * This document's realm, present only when `javascript.enabled` (its
   * presence is the form plugin's "scripting on" signal).
   */
  scriptRealm?: ScriptRealmPort;
  /**
   * Mint a realm for a detached document under this document's policy and
   * environment (the same sandbox factory, identity, clock and budget; a
   * fresh sandbox, so isolated globals). Present only when
   * `javascript.enabled`, like `scriptRealm`. The caller owns the returned
   * realm's lifetime and surfaces its results with `realm: 'detached'`.
   */
  createDetachedScriptRealm?(target: ScriptRealmTarget): DetachedScriptRealm;
  /** Surface a script transaction's UI effects, diagnostics and error through
   *  the one port (the adapter matrix, the authority print gate, the script
   *  events). */
  surfaceScriptResult(result: ScriptSurfaceResult): void;
  /** Surface a K/V/C/F commit result: splits boot-phase and user-phase
   *  effects into their own surfaces (diagnostics and the error ride the
   *  user phase); the one place that split lives. */
  surfaceScriptCommit(
    commit: ScriptCommitSurface,
    context: { origin: ActionOrigin; realm: ScriptRealmKind },
  ): void;
  /** The stage's page-truth report (see {@link PageStateReport}). */
  reportPageState(report: PageStateReport): void;
  /**
   * The form plugin's dataset resolver: both submit sources (action nodes
   * and script `doc.submitForm()` effects) normalize to a
   * {@link SubmitIntent} and resolve through this one door. Identity-safe;
   * without it every submit blocks with `no-submit-resolver`.
   */
  registerSubmitResolver(resolver: SubmitResolver): Unsubscribe;
}

export const ActionsToken = createHostToken<ActionsHostCapability>(PublicActionsToken);
