/**
 * What the snippet check (`snippets.mjs`) and the example check (`samples.mjs`) share: where they
 * compile, with which options, and how a compiler's diagnostics read.
 *
 * Both copy their files into a run directory of their own inside the embedpdf.com site
 * (`website/node_modules/.cache/`), which has every framework installed, so two checks running at
 * the same time never touch each other's files. Workspace packages resolve to their source
 * (`development`), so nothing needs building first.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(contentRoot, '../..');
export const siteRoot = path.join(repoRoot, 'website');
export const siteRequire = createRequire(path.join(siteRoot, 'package.json'));

export const toPosix = (file) => file.split(path.sep).join('/');

export function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

export const COMPILER_OPTIONS = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  // Workspace packages point `development` at their source.
  customConditions: ['development'],
  moduleDetection: 'force',
  strict: true,
  skipLibCheck: true,
  esModuleInterop: true,
  isolatedModules: true,
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  types: [],
  noEmit: true,
};

/**
 * Bare imports the site can't resolve, or would resolve to a build: the cloud engine and the
 * Angular adapter at their source, and RxJS (whose `Observable` the Angular events are) where the
 * adapter gets it.
 */
export function resolvePaths() {
  const angular = path.join(repoRoot, 'packages/framework/angular');
  const rxjs = path.dirname(
    createRequire(path.join(angular, 'package.json')).resolve('rxjs/package.json'),
  );
  return {
    '@cloudpdf/engine': [path.join(repoRoot, 'cloudpdf/engine/src/index.ts')],
    '@embedpdf/angular': [path.join(angular, 'src/public_api.ts')],
    '@embedpdf/angular/*': [path.join(angular, '*/src/public_api.ts')],
    rxjs: [rxjs],
    'rxjs/*': [path.join(rxjs, '*')],
    // SvelteKit's alias for the reader's own modules.
    '$lib/*': ['./_lib/*'],
  };
}

/** A fresh run directory for one check, removed by the caller when it's done. */
export function runDirectory(name) {
  const root = path.join(siteRoot, 'node_modules/.cache', name);
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, 'run-'));
}

/** The tool a framework compiles with, from the site: `{ version, entry }`, or null when it isn't installed. */
export function findTool(name, bin) {
  try {
    const manifest = siteRequire.resolve(`${name}/package.json`);
    const { version } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return { version, entry: bin ? path.join(path.dirname(manifest), bin) : manifest };
  } catch {
    return null;
  }
}

export function fromTypeScript(ts, diagnostics) {
  return diagnostics
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const position =
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
          : null;
      return {
        file: diagnostic.file?.fileName ?? null,
        line: position ? position.line + 1 : null,
        column: position ? position.character + 1 : null,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      };
    });
}

/**
 * The files of a program that the check owns: only they are checked. The packages they import are
 * read for their types, not checked themselves, which keeps the check fast (and a package's own
 * errors are its own check's business). `checks(file)` narrows it further, such as to one area.
 */
export const checkedFiles = (program, root, checks = () => true) =>
  program.getSourceFiles().filter((file) => {
    const absolute = path.resolve(file.fileName);
    return absolute.startsWith(`${root}${path.sep}`) && checks(absolute);
  });

/** Compile a React (or plain TypeScript) tree with `tsc`, in this process. */
export async function compileWithTsc(root, checks) {
  const tool = findTool('typescript');
  if (!tool) return { tool: null, reason: "typescript isn't installed in website/" };
  const ts = siteRequire('typescript');
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(root, 'tsconfig.json'),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
  );
  const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
  const diagnostics = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...checkedFiles(program, root, checks).flatMap((file) => [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ]),
  ];
  return { tool: `tsc ${tool.version}`, diagnostics: fromTypeScript(ts, diagnostics) };
}

/** Compile an Angular tree with `ngc` and `strictTemplates`, in this process. */
export async function compileWithNgc(root, checks) {
  const tool = findTool('@angular/compiler-cli');
  if (!tool) return { tool: null, reason: "@angular/compiler-cli isn't installed in website/" };
  const ts = siteRequire('typescript');
  const ngc = await import(pathToFileURL(siteRequire.resolve('@angular/compiler-cli')).href);
  const config = ngc.readConfiguration(path.join(root, 'tsconfig.json'));
  const { diagnostics } = ngc.performCompilation({
    rootNames: config.rootNames,
    options: { ...config.options, noEmit: true },
    emitFlags: config.emitFlags,
    // ngc stops at the first stage with an error, so one file's missing import would hide every
    // template error in the others. Every stage, for each checked file:
    gatherDiagnostics: (program) => [
      ...program.getTsOptionDiagnostics(),
      ...program.getNgOptionDiagnostics(),
      ...checkedFiles(program.getTsProgram(), root, checks).flatMap((file) => [
        ...program.getTsSyntacticDiagnostics(file),
        ...program.getTsSemanticDiagnostics(file),
        ...program.getNgSemanticDiagnostics(file.fileName),
      ]),
    ],
  });
  return {
    tool: `ngc ${tool.version}`,
    diagnostics: fromTypeScript(ts, [...config.errors, ...diagnostics]),
  };
}

/** Write through a temporary file, so a build reading it never sees half of it. */
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
