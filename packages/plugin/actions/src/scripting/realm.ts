/**
 * The ONE per-document ScriptHost (D8). Policy (`javascript.enabled`)
 * decides whether a realm factory exists; the factory carries the session
 * environment and mints this document's own realm here, and detached realms
 * on demand (host lens) — one environment, any number of isolated realms.
 */
import { javaScriptProgramFromActionTree } from '@embedpdf/core-acrojs';

import type { ActionsConfig } from '../contract';
import type { ActionsHostCapability } from '../host-contract';
import type { ActionsContext, ActionsServices } from '../services';
import { createScriptRealmFactory } from './environment';

export function createRealm(
  ctx: ActionsContext,
  { catalog }: Pick<ActionsServices, 'catalog'>,
  config: ActionsConfig,
) {
  const { readDocumentActions } = catalog;
  const js = config.javascript;
  const realms = js?.enabled && ctx.doc ? createScriptRealmFactory(js, ctx.doc) : null;
  const scriptHost =
    realms && ctx.doc
      ? realms.realmFor({
          doc: ctx.doc,
          document: () => ctx.document(),
          bootSources: async () => {
            const snapshot = await readDocumentActions();
            return (snapshot?.nameTreeScripts ?? []).map(({ action }) =>
              javaScriptProgramFromActionTree(action),
            );
          },
        })
      : null;
  if (scriptHost) ctx.cleanup(() => scriptHost.dispose());

  return {
    scriptHost,
    api: {
      isScriptingEnabled: () => scriptHost !== null,
      ...(scriptHost && realms
        ? {
            scriptRealm: {
              transaction: <T>(
                body: (txn: import('@embedpdf/core-acrojs').ScriptTransaction) => Promise<T>,
              ) => scriptHost.transaction(body),
              budget: realms.budget,
            },
            createDetachedScriptRealm: (target) => {
              const host = realms.realmFor(target);
              return {
                transaction: <T>(
                  body: (txn: import('@embedpdf/core-acrojs').ScriptTransaction) => Promise<T>,
                ) => host.transaction(body),
                budget: realms.budget,
                dispose: () => host.dispose(),
              };
            },
          }
        : {}),
    } satisfies Partial<ActionsHostCapability>,
  };
}
export type ActionsRealm = ReturnType<typeof createRealm>;
