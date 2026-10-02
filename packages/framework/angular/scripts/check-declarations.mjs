#!/usr/bin/env node
/**
 * Runs after the build: type-checks the built declarations the way an app reads them, with
 * `skipLibCheck: false`. A program imports every entry point in `exports` by its public name, and
 * any error inside `dist` fails the build. Apps check with `skipLibCheck: true`, where an import in
 * a declaration that doesn't resolve is silent: the type behind it becomes an error type, and a
 * service built with `pluginService()` has none of its members.
 *
 * It also fails when an entry point's declarations import that entry point by its own public name
 * (`@embedpdf/angular/stage` in `dist/stage`): the emitter writes that for a type the file needs
 * but doesn't import, and it resolves only where the package can refer to itself.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const dist = join(packageDir, 'dist');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const entries = Object.keys(manifest.exports).map((key) => ({
  name: key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`,
  declarations: join(packageDir, manifest.exports[key].types),
}));

const problems = [];

for (const entry of entries) {
  if (!existsSync(entry.declarations)) {
    problems.push(`${entry.name}: ${relative(packageDir, entry.declarations)} wasn't built`);
    continue;
  }
  const text = readFileSync(entry.declarations, 'utf8');
  if (text.includes(`from '${entry.name}'`)) {
    problems.push(
      `${relative(packageDir, entry.declarations)} imports '${entry.name}', its own entry point: ` +
        'import the type it names into the source file that uses it, or give the member a type',
    );
  }
}

// The app's side: a file in this package that imports every entry point by its public name,
// resolved through `exports` as an app resolves it. Never written to disk.
const consumer = join(packageDir, 'declarations-check.ts');
const consumerText = entries
  .map((entry, index) => `export * as entry${index} from '${entry.name}';`)
  .join('\n');

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: [],
  strict: true,
  skipLibCheck: false,
  noEmit: true,
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
const getSourceFile = host.getSourceFile.bind(host);
host.readFile = (file) => (file === consumer ? consumerText : readFile(file));
host.fileExists = (file) => file === consumer || fileExists(file);
host.getSourceFile = (file, languageVersion, ...rest) =>
  file === consumer
    ? ts.createSourceFile(file, consumerText, languageVersion, true)
    : getSourceFile(file, languageVersion, ...rest);
// Each import resolves on its own, without the cache that shares one folder's answer with the
// folders next to it: one entry point that resolves must not hide another that doesn't.
host.resolveModuleNames = (names, containingFile) =>
  names.map((name) => ts.resolveModuleName(name, containingFile, options, host).resolvedModule);

const program = ts.createProgram([consumer], options, host);
const insideDist = (file) => file && !relative(dist, file.fileName).startsWith('..');
const diagnostics = [
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
  ...program
    .getSourceFiles()
    .filter((file) => file.fileName === consumer || insideDist(file))
    .flatMap((file) => [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ]),
];
for (const diagnostic of diagnostics) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file) {
    problems.push(message);
    continue;
  }
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  const where = `${relative(packageDir, diagnostic.file.fileName)}:${line + 1}:${character + 1}`;
  problems.push(`${where} TS${diagnostic.code}: ${message}`);
}

if (problems.length) {
  console.error(`[declarations] ${problems.length} problem(s) in the built declarations:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `[declarations] ${entries.length} entry points type-check as an app sees them (skipLibCheck: false)`,
);
