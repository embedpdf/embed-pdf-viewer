/**
 * Loads the modules `CLOUDPDF_MODULES` names: a comma-separated list of
 * package names, or of paths (from the working directory) for a module that
 * isn't a package. Each one's default export is its module.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { HostedModule } from './protocol';

export async function loadModules(
  list: string | undefined,
  load: (specifier: string) => Promise<unknown> = (specifier) => import(specifier),
): Promise<HostedModule[]> {
  const names = (list ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  const modules: HostedModule[] = [];
  for (const name of names) {
    const specifier =
      name.startsWith('.') || name.startsWith('/') ? pathToFileURL(resolve(name)).href : name;
    let loaded: unknown;
    try {
      loaded = await load(specifier);
    } catch (err) {
      throw new Error(`module ${name} couldn't be loaded: ${(err as Error).message}`);
    }
    const module = (loaded as { default?: unknown } | null)?.default;
    if (!isHostedModule(module)) {
      throw new Error(`module ${name} has no server module as its default export`);
    }
    modules.push(module);
  }
  return modules;
}

function isHostedModule(value: unknown): value is HostedModule {
  const module = value as Partial<HostedModule> | null | undefined;
  return typeof module?.id === 'string' && typeof module.setup === 'function';
}
