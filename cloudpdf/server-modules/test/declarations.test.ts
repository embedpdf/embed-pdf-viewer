import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/**
 * A module's package depends on the kit alone, and the server is the kit's
 * dependency, out of the module's reach. Its declarations still have to name
 * the type `defineServerModule` returns: they name it from the kit.
 */

const here = dirname(fileURLToPath(import.meta.url));
const kit = resolve(here, '..');
const server = resolve(kit, '../server');

let root: string;
let kitDeclarations: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kit-declarations-'));
  // The kit's declarations, from its source as it is now.
  const program = ts.createProgram([join(kit, 'src/index.ts')], {
    ...ts.parseJsonConfigFileContent(
      ts.readConfigFile(join(kit, 'tsconfig.json'), ts.sys.readFile).config,
      ts.sys,
      kit,
    ).options,
    declaration: true,
    emitDeclarationOnly: true,
  });
  program.emit(undefined, (file, text) => {
    if (basename(file) === 'index.d.ts') kitDeclarations = text;
  });
  expect(kitDeclarations).toBeDefined();
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Install the kit (with these declarations) and its server as npm would, then emit the module's. */
function emitModule(declarations: string): { output: string; errors: string[] } {
  const project = mkdtempSync(join(root, 'module-'));
  const installed = join(project, 'node_modules/@cloudpdf/server-modules');
  mkdirSync(join(installed, 'dist'), { recursive: true });
  writeFileSync(
    join(installed, 'package.json'),
    JSON.stringify({
      name: '@cloudpdf/server-modules',
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts' } },
    }),
  );
  writeFileSync(join(installed, 'dist/index.d.ts'), declarations);
  // The server's declarations, reachable from the kit only.
  const nested = join(installed, 'node_modules/@cloudpdf/server');
  cpSync(join(server, 'package.json'), join(nested, 'package.json'));
  for (const file of readdirSync(join(server, 'dist'), { recursive: true, encoding: 'utf8' })) {
    if (file.endsWith('.d.ts')) cpSync(join(server, 'dist', file), join(nested, 'dist', file));
  }

  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'review', type: 'module' }));
  const source = join(project, 'src/index.ts');
  mkdirSync(dirname(source));
  writeFileSync(
    source,
    [
      "import { defineServerModule } from '@cloudpdf/server-modules';",
      "export default defineServerModule({ id: 'review', setup() {} });",
    ].join('\n'),
  );

  let output = '';
  const program = ts.createProgram([source], {
    declaration: true,
    emitDeclarationOnly: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
    types: [],
    outDir: join(project, 'dist'),
  });
  const emitted = program.emit(undefined, (_, text) => (output = text));
  const errors = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics].map(
    (diagnostic) =>
      `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
  );
  return { output, errors };
}

describe("a module's declarations", () => {
  test('name HostedModule from the kit', () => {
    const { output, errors } = emitModule(kitDeclarations);
    expect(errors).toEqual([]);
    expect(output).toContain('import("@cloudpdf/server-modules").HostedModule');
  });

  test("can't name it without the kit's re-export", () => {
    const withoutReexport = kitDeclarations.replace(/\bHostedModule,\s*(?=[\w\s,]*\};)/, '');
    expect(withoutReexport).not.toBe(kitDeclarations);
    const { errors } = emitModule(withoutReexport);
    expect(errors.join('\n')).toMatch(/TS2742/);
  });
});
