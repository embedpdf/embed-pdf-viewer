import {
  createScriptHost,
  DEFAULT_SCRIPT_BUDGET,
  resolveScriptIdentity,
  seedFrom,
  type ScriptBudget,
  type ScriptHost,
} from '@embedpdf/core-acrojs';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';

import type { ActionsPluginConfig, ScriptRealmTarget } from './types';

export type JavaScriptConfig = NonNullable<ActionsPluginConfig['javascript']>;

/**
 * The scripting ENVIRONMENT — the session-level half of the JavaScript
 * switch: sandbox factory, identity, clock, timezone, seed, and budget.
 * Policy (`enabled`) decides whether one exists; realms are minted from it.
 *
 * One environment mints any number of realms: the owning document's own
 * host, and DETACHED realms for documents that are not the viewer document
 * (a stamp asset, a template). Every realm gets a FRESH sandbox from the
 * factory — same policy and environment, isolated globals (WP4).
 *
 * Identity closes over the OWNING document: who the user is, is a session
 * fact resolved from the owner's claims plus the embedder decoration —
 * never from a detached document's (authority-less) handle.
 */
export interface ScriptRealmFactory {
  realmFor(target: ScriptRealmTarget): ScriptHost;
  /** The embedder's budget (or the default) — the per-run budget every
   *  minted realm enforces AND the transaction aggregate consumers apply. */
  readonly budget: ScriptBudget;
}

export function createScriptRealmFactory(
  js: JavaScriptConfig,
  identityDoc: DocumentHandle,
): ScriptRealmFactory {
  const sandboxFactory =
    js.sandboxFactory ??
    (() =>
      import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
        createQuickJsSandbox(),
      ));
  const budget = js.budget ?? DEFAULT_SCRIPT_BUDGET;
  return {
    budget,
    realmFor: (target) =>
      createScriptHost({
        sandboxFactory,
        document: () => {
          const meta = target.document();
          return {
            id: target.doc.id,
            fileName: js.fileName?.() ?? meta?.name ?? 'document.pdf',
            pageCount: meta?.pageCount ?? 0,
            pageNumber: 0,
          };
        },
        identity: () => resolveScriptIdentity(identityDoc, js.identity),
        environment: (sequence) => {
          const nowMs = js.now?.() ?? Date.now();
          return {
            nowMs,
            utcOffsetMinutes: js.utcOffsetMinutes?.() ?? -new Date(nowMs).getTimezoneOffset(),
            randomSeed: js.randomSeed?.() ?? seedFrom(target.doc.id, sequence),
          };
        },
        bootSources: target.bootSources,
        budget,
      }),
  };
}
