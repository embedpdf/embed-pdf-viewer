import {
  createScriptHost,
  DEFAULT_SCRIPT_BUDGET,
  resolveScriptIdentity,
  seedFrom,
  type ScriptBudget,
  type ScriptHost,
} from '@embedpdf/core-acrojs';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';

import type { ActionsScriptEnvironment, ActionsScriptIdentity } from '../contract';
import type { ScriptRealmTarget } from '../host-contract';

/**
 * The scripting environment, the session-level half of the JavaScript
 * switch: sandbox factory, identity, clock, timezone, seed and budget. Policy
 * (`enabled`) decides whether one exists; realms are minted from it.
 *
 * One environment mints any number of realms: the owning document's own
 * host, and detached realms for documents that are not the viewer document
 * (a stamp asset, a template). Every realm gets a fresh sandbox from the
 * factory: the same policy and environment, isolated globals.
 *
 * Identity closes over the owning document: who the user is, is a session
 * fact resolved from the owner's claims plus the `javascript.identity`
 * setting as it is at each run, never from a detached document's
 * (authority-less) handle.
 */
export interface ScriptRealmFactory {
  realmFor(target: ScriptRealmTarget): ScriptHost;
  /** The embedder's budget (or the default): the per-run budget every minted
   *  realm enforces, and the transaction aggregate consumers apply. */
  readonly budget: ScriptBudget;
}

export function createScriptRealmFactory(
  environment: ActionsScriptEnvironment,
  identity: () => ActionsScriptIdentity | undefined,
  identityDoc: DocumentHandle,
): ScriptRealmFactory {
  const sandboxFactory =
    environment.sandboxFactory ??
    (() =>
      import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
        createQuickJsSandbox(),
      ));
  const budget = environment.budget ?? DEFAULT_SCRIPT_BUDGET;
  return {
    budget,
    realmFor: (target) =>
      createScriptHost({
        sandboxFactory,
        document: () => {
          const documentInfo = target.document();
          return {
            id: target.doc.id,
            fileName: environment.fileName?.() ?? documentInfo?.name ?? 'document.pdf',
            pageCount: documentInfo?.pageCount ?? 0,
            pageNumber: 0,
          };
        },
        identity: () => resolveScriptIdentity(identityDoc, identity()),
        environment: (sequence) => {
          const nowMs = environment.now?.() ?? Date.now();
          return {
            nowMs,
            utcOffsetMinutes:
              environment.utcOffsetMinutes?.() ?? -new Date(nowMs).getTimezoneOffset(),
            randomSeed: environment.randomSeed?.() ?? seedFrom(target.doc.id, sequence),
          };
        },
        bootSources: target.bootSources,
        budget,
      }),
  };
}
