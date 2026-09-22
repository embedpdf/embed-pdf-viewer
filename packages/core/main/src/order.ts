import { DocumentsToken, type AnyPlugin, type CapabilityToken, type PluginScope } from './types';

/**
 * The result of analysing a plugin list: a dependency-ordered list, plus lookups
 * for which plugin provides a token and what scope a token has. Pure and testable.
 */
export interface PluginPlan {
  readonly ordered: AnyPlugin[];
  providerOf(token: CapabilityToken<unknown>): AnyPlugin | undefined;
  scopeOf(token: CapabilityToken<unknown>): PluginScope;
}

/**
 * Validate the composition (fail fast, before anything is constructed) and
 * topologically sort plugins so dependencies are initialised before dependents.
 *
 * Rejected compositions, each with both names in the error:
 *   - the same plugin definition installed twice, or two definitions sharing an id;
 *   - two plugins providing the same capability token (no implicit last-wins —
 *     an intentional replacement is a composition-time choice, made by
 *     removing the old definition from the list);
 *   - a workspace plugin that `requires` a document-scoped token (it has no
 *     document to resolve it for; `ctx.forDocument()` is the explicit path);
 *   - a required token no plugin provides;
 *   - a dependency cycle.
 */
export function planPlugins(plugins: readonly AnyPlugin[]): PluginPlan {
  const byId = new Map<string, AnyPlugin>();
  const providerByToken = new Map<CapabilityToken<unknown>, AnyPlugin>();
  const scopeByToken = new Map<CapabilityToken<unknown>, PluginScope>([
    [DocumentsToken, 'workspace'],
  ]);

  for (const plugin of plugins) {
    const prior = byId.get(plugin.id);
    if (prior) {
      throw new Error(
        prior === plugin
          ? `[kernel] plugin "${plugin.id}" is installed twice.`
          : `[kernel] two different plugins use the id "${plugin.id}".`,
      );
    }
    byId.set(plugin.id, plugin);
    if (plugin.token) {
      const other = providerByToken.get(plugin.token);
      if (other) {
        throw new Error(
          `[kernel] capability "${plugin.token.name}" is provided by both "${other.id}" and "${plugin.id}".`,
        );
      }
      providerByToken.set(plugin.token, plugin);
      scopeByToken.set(plugin.token, plugin.scope ?? 'workspace');
    }
  }

  for (const plugin of plugins) {
    for (const required of plugin.requires ?? []) {
      // every required token must be provided (the documents token is always available)
      if (required !== DocumentsToken && !providerByToken.has(required)) {
        // The error carries its own fix: tokens author the remedy (hint), so a
        // forgotten dependency is a ten-second paste, not an investigation.
        throw new Error(
          `Plugin "${plugin.id}" requires capability "${required.name}", which no plugin provides` +
            (required.hint ? ` — ${required.hint}.` : '.'),
        );
      }
      if (plugin.scope !== 'document' && providerByToken.get(required)?.scope === 'document') {
        throw new Error(
          `[kernel] workspace plugin "${plugin.id}" requires document-scoped capability ` +
            `"${required.name}"; resolve it per document with ctx.forDocument() and declare it as optional.`,
        );
      }
    }
  }

  // depth-first topological sort (dependencies pushed before dependents)
  const ordered: AnyPlugin[] = [];
  const status = new Map<string, 'visiting' | 'done'>();
  const visit = (plugin: AnyPlugin) => {
    const state = status.get(plugin.id);
    if (state === 'done') return;
    if (state === 'visiting') throw new Error(`Dependency cycle involving plugin "${plugin.id}".`);
    status.set(plugin.id, 'visiting');
    for (const token of [...(plugin.requires ?? []), ...(plugin.optional ?? [])]) {
      const dependency = providerByToken.get(token);
      if (dependency && dependency !== plugin) visit(dependency);
    }
    status.set(plugin.id, 'done');
    ordered.push(plugin);
  };
  for (const plugin of plugins) visit(plugin);

  return {
    ordered,
    providerOf: (token) => providerByToken.get(token),
    scopeOf: (token) => scopeByToken.get(token) ?? 'workspace',
  };
}
