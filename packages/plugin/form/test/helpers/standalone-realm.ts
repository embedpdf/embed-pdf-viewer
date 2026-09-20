/**
 * A STANDALONE realm for direct controller tests — what the actions plugin
 * mints for a viewer document (or, detached, for a stamp asset). Production
 * code never builds one here: the realm factory lives in `plugin-actions`.
 */
import {
  createScriptHost,
  DEFAULT_SCRIPT_BUDGET,
  javaScriptProgramFromActionTree,
  resolveScriptIdentity,
  seedFrom,
  type ScriptBudget,
  type ScriptIdentity,
  type ScriptSandboxFactory,
  type ScriptTransaction,
} from '@embedpdf/core-acrojs';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';
import type { DocumentMeta } from '@embedpdf/core';

export interface StandaloneRealmConfig {
  sandboxFactory?: ScriptSandboxFactory;
  identity?: Partial<ScriptIdentity> | (() => Partial<ScriptIdentity>);
  fileName?: () => string;
  now?: () => number;
  utcOffsetMinutes?: () => number;
  randomSeed?: () => number;
  budget?: ScriptBudget;
}

export interface StandaloneRealm {
  transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  budget: ScriptBudget;
  dispose(): void;
}

export function standaloneRealm(
  doc: DocumentHandle,
  document: () => DocumentMeta | null,
  config: StandaloneRealmConfig = {},
): StandaloneRealm {
  const budget = config.budget ?? DEFAULT_SCRIPT_BUDGET;
  const host = createScriptHost({
    sandboxFactory:
      config.sandboxFactory ??
      (() =>
        import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
          createQuickJsSandbox(),
        )),
    document: () => {
      const meta = document();
      return {
        id: doc.id,
        fileName: config.fileName?.() ?? meta?.name ?? doc.id,
        pageCount: meta?.pageCount ?? 0,
        pageNumber: 0,
      };
    },
    identity: () => resolveScriptIdentity(doc, config.identity),
    environment: (sequence) => {
      const nowMs = config.now?.() ?? Date.now();
      return {
        nowMs,
        utcOffsetMinutes: config.utcOffsetMinutes?.() ?? -new Date(nowMs).getTimezoneOffset(),
        randomSeed: config.randomSeed?.() ?? seedFrom(doc.id, sequence),
      };
    },
    bootSources: async () => {
      const actions = doc.actions ? await doc.actions.read() : null;
      return (
        actions?.nameTreeScripts.map(({ action }) => javaScriptProgramFromActionTree(action)) ?? []
      );
    },
    budget,
  });
  return {
    transaction: (body) => host.transaction(body),
    budget,
    dispose: () => host.dispose(),
  };
}
