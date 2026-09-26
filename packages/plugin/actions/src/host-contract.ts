/**
 * @embedpdf/plugin-actions/contract/host — the HOST lens: what sibling
 * plugins (stage, annotation, link, form) need to register commit sinks,
 * the submit resolver, script realms and the page-state report. Same
 * runtime token as the public one, typed wider.
 */
import type { CapabilityToken, DocumentMeta, Unsubscribe } from '@embedpdf/core';
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
export type { ActionsAction, ActionsState } from './model';

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
  currentPage: PageRef | null;
  visiblePages: readonly PageRef[];
  /** False until layout exists; pre-placement reports are ignored. */
  placed: boolean;
  cause: 'user' | 'programmatic';
}

// ── owner commit sinks (D3) — full ISO: every script/Hide effect is a
// DOCUMENT mutation committed by the plugin that owns the model, so the
// engine write and the visible model can never diverge. Calling contract:
// invoked from inside the actions/form serialized operations (the script
// executor calls them while HOLDING the host transaction); a sink never
// enqueues and never acquires the host — the proven deadlock class.

/** One annotation-effect commit entry. `page` may be absent for bare Hide
 *  object-number targets — the sink resolves it from its model (`obj:N` is a
 *  cross-page key there); unresolvable entries fail honestly. */
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

/** What a script transaction surfaced besides document effects. */
/**
 * Which realm produced a script result. `'document'` = this document's own
 * realm: every effect targets the viewer document. `'detached'` = a realm
 * minted for a document that is NOT displayed (a stamp asset): it has no
 * document surface, so only alerts reach the adapter — print, page
 * navigation, and submit are suppressed with a diagnostic rather than
 * acting on the wrong document.
 */
export type ScriptRealmKind = 'document' | 'detached';

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
 *  lazily booted the realm). Structurally `FormCommitResult`'s surface half —
 *  typed here so the actions plane never imports the form package. */
export interface ScriptCommitSurface {
  uiEffects: Array<ScriptUiEffect & { phase: 'boot' | 'user' }>;
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
}

// ── script realms (host lens) ───────────────────────────────────────────────

/** What a realm is minted FOR. `doc` is the document the scripts operate on
 *  (the viewer document, or a detached asset); `document()` is the metadata
 *  scripts observe (`this.documentFileName` …) — for a detached stamp that is
 *  the TARGET document's, by Acrobat's dynamic-stamp contract. */
export interface ScriptRealmTarget {
  doc: DocumentHandle;
  document(): DocumentMeta | null;
  /** Name-tree programs, fetched lazily once per realm build. */
  bootSources(): Promise<string[]>;
}

/** The realm transaction port plus the budget consumers apply as their
 *  transaction aggregate — the same shape whether the realm is this
 *  document's own (owned by actions) or a detached one (owned by the caller). */
export interface ScriptRealmPort {
  /** The body must perform prefetch, runs, sink commits, and reconciliation
   *  before returning (commit-inside-the-boundary). */
  transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  budget: ScriptBudget;
}

/** A detached realm: the caller OWNS its lifetime. */
export interface DetachedScriptRealm extends ScriptRealmPort {
  dispose(): void;
}

/** The form plugin's dataset resolver — registered on the host lens.
 *  `diagnose` is the per-entry observability channel (the honesty rule: an
 *  explicitly listed push-button/signature/unsupported value is DIAGNOSED
 *  as `submit-entry-unsupported`, never silently dropped). */
export type SubmitResolver = (
  intent: SubmitIntent,
  ctx: ActionContext,
  diagnose: (diagnostic: ActionDiagnostic) => void,
) => Promise<ActionSubmitRequest>;

/** HOST lens — plugin-to-plugin only; import the token from
 *  `@embedpdf/plugin-actions/contract/host`, never from application code. */
export interface ActionsHostCapability extends ActionsCapability {
  registerAnnotCommitSink(sink: AnnotCommitSink): Unsubscribe;
  registerFormCommitSink(sink: FormCommitSink): Unsubscribe;
  /**
   * THIS document's realm — present ONLY when `javascript.enabled` (its
   * presence IS form's "scripting on" signal).
   */
  scriptRealm?: ScriptRealmPort;
  /**
   * Mint a realm for a DETACHED document under this document's policy and
   * environment (same sandbox factory, identity, clock, budget; a fresh
   * sandbox, so isolated globals). Present ONLY when `javascript.enabled`,
   * like `scriptRealm`. The caller owns the returned realm's lifetime and
   * surfaces its results with `realm: 'detached'`.
   */
  createDetachedScriptRealm?(target: ScriptRealmTarget): DetachedScriptRealm;
  /** Surface a script transaction's UI effects/diagnostics/error through the
   *  ONE port (adapter matrix + authority print gate + script hooks). */
  surfaceScriptResult(result: ScriptSurfaceResult): void;
  /** Surface a K/V/C/F commit result: splits boot-phase and user-phase
   *  effects into their own surfaces (diagnostics and the error ride the
   *  user phase) — the one place that split lives. */
  surfaceScriptCommit(
    commit: ScriptCommitSurface,
    context: { origin: ActionOrigin; realm: ScriptRealmKind },
  ): void;
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

export const ActionsToken = PublicActionsToken as unknown as CapabilityToken<ActionsHostCapability>;
