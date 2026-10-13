/**
 * What each entry loads before anything runs. A page imports the root entry, `runtime` and
 * `public`; none of them reaches zod, so neither do the page's bundle and its bundler. zod and
 * every schema built with it are behind `validation`, which the engine's worker and the server
 * import, and `wire`, which HTTP clients and routes import.
 *
 * The graph is the one a bundler follows: each module's static imports once TypeScript has
 * dropped those only types use. An `import()` is not followed. The published `dist` is checked
 * the same way in `packages/engine/main/test/entry-graph.test.ts`, which runs after this
 * package is built.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** The specifiers a module imports statically, as the JavaScript TypeScript emits for it. */
function staticSpecifiers(file: string): string[] {
  const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const source = ts.createSourceFile(file, emitted, ts.ScriptTarget.ES2022);
  return source.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

function resolveModule(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  const file = [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`${relative(src, from)} imports '${specifier}', which isn't a module`);
  return file;
}

/**
 * The import chain from `entry` to the first module that imports `target`, a package, or
 * `null` when no module in its static graph does.
 */
function chainTo(entry: string, target: string): string[] | null {
  const start = join(src, entry);
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const specifier of staticSpecifiers(file)) {
      if (specifier === target) {
        const chain = [specifier];
        for (let at: string | null = file; at !== null; at = previous.get(at)!) {
          chain.unshift(relative(src, at));
        }
        return chain;
      }
      if (!specifier.startsWith('.')) continue;
      const next = resolveModule(file, specifier);
      if (previous.has(next)) continue;
      previous.set(next, file);
      queue.push(next);
    }
  }
  return null;
}

describe("the page's entries", () => {
  it.each(['index.ts', 'runtime.ts', 'public.ts'])('%s reaches no zod', (entry) => {
    const chain = chainTo(entry, 'zod');
    expect(chain, chain?.join(' → ')).toBeNull();
  });
});

describe('the entries behind the engine and the HTTP wire', () => {
  it.each(['validation.ts', 'wire.ts'])('%s holds the schemas, built with zod', (entry) => {
    expect(chainTo(entry, 'zod')).not.toBeNull();
  });
});
