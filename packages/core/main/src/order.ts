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
 * Validate `requires` (fail fast) and topologically sort plugins so dependencies
 * are initialised before dependents.
 */
export function planPlugins(plugins: readonly AnyPlugin[]): PluginPlan {
  const providerByToken = new Map<CapabilityToken<unknown>, AnyPlugin>();
  const scopeByToken = new Map<CapabilityToken<unknown>, PluginScope>([
    [DocumentsToken, 'workspace'],
  ]);

  for (const plugin of plugins) {
    if (plugin.token && plugin.capability) {
      providerByToken.set(plugin.token, plugin);
      scopeByToken.set(plugin.token, plugin.scope ?? 'workspace');
    }
  }

  // every required token must be provided (the documents token is always available)
  for (const plugin of plugins) {
    for (const required of plugin.requires ?? []) {
      if (required !== DocumentsToken && !providerByToken.has(required)) {
        throw new Error(
          `Plugin "${plugin.id}" requires capability "${required.name}", which no plugin provides.`,
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
