import {
  createScriptHost,
  DEFAULT_SCRIPT_BUDGET,
  resolveScriptIdentity,
  seedFrom,
  type ScriptBudget,
  type ScriptHost,
} from '@embedpdf/core-acrojs';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';

import type { ActionsConfig } from '../contract';
import type { ScriptRealmTarget } from '../host-contract';

export type JavaScriptConfig = NonNullable<ActionsConfig['javascript']>;

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
 * fact resolved from the owner's claims plus the embedder decoration, never
 * from a detached document's (authority-less) handle.
 */
export interface ScriptRealmFactory {
  realmFor(target: ScriptRealmTarget): ScriptHost;
  /** The embedder's budget (or the default): the per-run budget every minted
   *  realm enforces, and the transaction aggregate consumers apply. */
  readonly budget: ScriptBudget;
}

export function createScriptRealmFactory(
  javascript: JavaScriptConfig,
  identityDoc: DocumentHandle,
): ScriptRealmFactory {
  const sandboxFactory =
    javascript.sandboxFactory ??
    (() =>
      import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
        createQuickJsSandbox(),
      ));
  const budget = javascript.budget ?? DEFAULT_SCRIPT_BUDGET;
  return {
    budget,
    realmFor: (target) =>
      createScriptHost({
        sandboxFactory,
        document: () => {
          const documentInfo = target.document();
          return {
            id: target.doc.id,
            fileName: javascript.fileName?.() ?? documentInfo?.name ?? 'document.pdf',
            pageCount: documentInfo?.pageCount ?? 0,
            pageNumber: 0,
          };
        },
        identity: () => resolveScriptIdentity(identityDoc, javascript.identity),
        environment: (sequence) => {
          const nowMs = javascript.now?.() ?? Date.now();
          return {
            nowMs,
            utcOffsetMinutes:
              javascript.utcOffsetMinutes?.() ?? -new Date(nowMs).getTimezoneOffset(),
            randomSeed: javascript.randomSeed?.() ?? seedFrom(target.doc.id, sequence),
          };
        },
        bootSources: target.bootSources,
        budget,
      }),
  };
}
