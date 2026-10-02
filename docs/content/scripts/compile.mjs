/**
 * What the snippet check (`snippets.mjs`) and the example check (`samples.mjs`) share: where they
 * compile, each framework's compiler and options, and how a compiler's diagnostics read.
 *
 * Both copy their files into a run directory of their own in the system's temporary directory,
 * whose `node_modules` links to the embedpdf.com site's (`website/`), which has every framework
 * installed. Two checks running at the same time never touch each other's files, and nothing is
 * staged under a `node_modules` path, where `svelte-check` reports nothing. Workspace packages
 * resolve to their source, so nothing needs building first. Every run also compiles a canary, a
 * file with known errors: a compiler that doesn't report them isn't checking, and fails the run.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(contentRoot, '../..');
export const siteRoot = path.join(repoRoot, 'website');
export const siteRequire = createRequire(path.join(siteRoot, 'package.json'));

export const FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'];
export const FRAMEWORK_LABELS = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
};

export const toPosix = (file) => file.split(path.sep).join('/');

export function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

// ── options ─────────────────────────────────────────────────────────────────

export const COMPILER_OPTIONS = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  // Workspace packages point `development` (or a plain string) at their source.
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

/** What each framework's own projects set on top of {@link COMPILER_OPTIONS}. */
const FRAMEWORK_OPTIONS = {
  react: { compilerOptions: { jsx: 'react-jsx' } },
  angular: {
    compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    angularCompilerOptions: { strictTemplates: true },
  },
  vue: {
    compilerOptions: { jsx: 'preserve' },
    // Like Angular's `strictTemplates`: a component, prop, event or slot prop the adapter doesn't
    // have is an error, not an unknown element or a fallthrough attribute. `data-*` attributes
    // are the reader's own, on any element.
    vueCompilerOptions: { strictTemplates: true, dataAttributes: ['data-*'] },
  },
  svelte: {
    compilerOptions: {
      verbatimModuleSyntax: true,
      // A Svelte package names its source under the `svelte` condition.
      customConditions: ['development', 'svelte'],
      // SvelteKit's `$app/*` modules, which a snippet written for a SvelteKit app imports.
      types: ['@sveltejs/kit'],
    },
  },
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

/**
 * Write the tsconfig one framework's files compile with: `include` names them, and `overrides`
 * changes one of the framework's option groups (`{ vueCompilerOptions: {…} }`).
 */
export function writeTsconfig(framework, root, include, overrides = {}) {
  const groups = { ...FRAMEWORK_OPTIONS[framework] };
  for (const [group, options] of Object.entries(overrides)) {
    groups[group] = { ...groups[group], ...options };
  }
  const { compilerOptions, ...rest } = groups;
  const tsconfig = {
    compilerOptions: { ...COMPILER_OPTIONS, ...compilerOptions, paths: resolvePaths() },
    include,
    ...rest,
  };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
}

// ── run directories ─────────────────────────────────────────────────────────

/**
 * A fresh run directory for one check, outside any `node_modules`: `svelte-check` skips every
 * file under one. Its `node_modules` links to the site's, so the files staged in it resolve every
 * framework the site has. The caller removes it with {@link removeRunDirectory}.
 */
export function runDirectory(name) {
  const parent = path.join(fs.realpathSync(os.tmpdir()), name);
  fs.mkdirSync(parent, { recursive: true });
  const run = fs.mkdtempSync(path.join(parent, 'run-'));
  fs.symlinkSync(path.join(siteRoot, 'node_modules'), path.join(run, 'node_modules'), 'junction');
  return run;
}

/** Remove a run directory: the link to the site's `node_modules` first, never what it points at. */
export function removeRunDirectory(run) {
  fs.rmSync(path.join(run, 'node_modules'), { force: true });
  fs.rmSync(run, { recursive: true, force: true });
}

// ── the canary ──────────────────────────────────────────────────────────────

const EXPECTED = 'error expected';

/**
 * A file each framework's compiler must reject on every line marked `error expected`: a name a
 * module doesn't export, a module that doesn't exist, and a template naming nothing. A compiler
 * that misses one reads unresolved imports as `any`, or never looked at the file.
 */
const CANARIES = {
  react: {
    file: '_canary.react.tsx',
    source: `// The check's canary (compile.mjs): each marked line must be an error.
import { useState, notAReactExport } from 'react'; // ${EXPECTED}
import { anything } from '@embedpdf/not-a-package'; // ${EXPECTED}
export const Canary = () => <p>{notAField}</p>; // ${EXPECTED}
`,
  },
  angular: {
    file: '_canary.angular.ts',
    source: `// The check's canary (compile.mjs): each marked line must be an error.
import { Component, notAnAngularExport } from '@angular/core'; // ${EXPECTED}
import { anything } from '@embedpdf/not-a-package'; // ${EXPECTED}

@Component({
  selector: 'canary-root',
  template: '<p>{{ notAField }}</p>', // ${EXPECTED}
})
export class Canary {}
`,
  },
  vue: {
    file: '_canary.vue.vue',
    source: `<!-- The check's canary (compile.mjs): each marked line must be an error. -->
<script setup lang="ts">
import { ref, notAVueExport } from 'vue'; // ${EXPECTED}
import { anything } from '@embedpdf/not-a-package'; // ${EXPECTED}
</script>

<template>
  <p>{{ notAField }}</p> <!-- ${EXPECTED} -->
</template>
`,
  },
  svelte: {
    file: '_canary.svelte.svelte',
    source: `<!-- The check's canary (compile.mjs): each marked line must be an error. -->
<script lang="ts">
  import { mount, notASvelteExport } from 'svelte'; // ${EXPECTED}
  import { anything } from '@embedpdf/not-a-package'; // ${EXPECTED}
</script>

<p>{notAField}</p> <!-- ${EXPECTED} -->
`,
  },
};

/** Whether a file is a run's canary (at the root of the run, named `_canary.<framework>.<ext>`). */
const isCanary = (root, file) =>
  path.dirname(file) === root && path.basename(file).startsWith('_canary.');

function writeCanary(framework, root) {
  const { file, source } = CANARIES[framework];
  fs.mkdirSync(root, { recursive: true });
  const absolute = path.join(root, file);
  fs.writeFileSync(absolute, source);
  const lines = source
    .split('\n')
    .flatMap((line, index) => (line.includes(EXPECTED) ? [index + 1] : []));
  return { file: absolute, lines };
}

// ── the compilers ───────────────────────────────────────────────────────────

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
        file: diagnostic.file ? path.resolve(diagnostic.file.fileName) : null,
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
const checkedFiles = (program, root, checks) =>
  program.getSourceFiles().filter((file) => {
    const absolute = path.resolve(file.fileName);
    return absolute.startsWith(`${root}${path.sep}`) && checks(absolute);
  });

/** Compile a React (or plain TypeScript) tree with `tsc`, in this process. */
async function compileWithTsc(root, checks) {
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
async function compileWithNgc(root, checks) {
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
        ...unexportedDeclarations(ts, file),
      ]),
    ],
  });
  return {
    tool: `ngc ${tool.version}`,
    diagnostics: fromTypeScript(ts, [...config.errors, ...diagnostics]),
  };
}

const ANGULAR_DECLARATIONS = new Set(['Component', 'Directive', 'Pipe']);
const UNEXPORTED = 'ngc stops reporting template errors when';

/**
 * A component, directive or pipe a file declares without exporting it, as an error. ngc can't
 * type-check a template that uses one the usual way, and falls back to a mode in which it stops
 * reporting template errors, in every file of the program: the check would pass while checking
 * nothing.
 */
function unexportedDeclarations(ts, file) {
  return file.statements.flatMap((statement) => {
    if (!ts.isClassDeclaration(statement) || !statement.name) return [];
    const exported = (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported) return [];
    const decorator = (ts.getDecorators(statement) ?? [])
      .map(({ expression }) =>
        ts.isCallExpression(expression) ? expression.expression : expression,
      )
      .find((callee) => ts.isIdentifier(callee) && ANGULAR_DECLARATIONS.has(callee.text));
    if (!decorator) return [];
    const kind = decorator.text.toLowerCase();
    return [
      {
        category: ts.DiagnosticCategory.Error,
        code: 0,
        file,
        start: statement.name.getStart(file),
        length: statement.name.getWidth(file),
        messageText:
          `The ${kind} ${statement.name.text} isn't exported. ${UNEXPORTED} a ${kind} ` +
          `isn't exported; export it.`,
      },
    ];
  });
}

const runTool = (entry, args, cwd) =>
  spawnSync(process.execPath, [entry, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/** The first line of a tool's output that says something, for a reason it failed. */
const firstLine = (run) =>
  `${run.error?.message ?? ''}\n${run.stderr ?? ''}\n${run.stdout ?? ''}`
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? `exit ${run.status}`;

/** Compile a Vue tree with `vue-tsc`, in a child process. */
async function compileWithVueTsc(root) {
  const tool = findTool('vue-tsc', 'bin/vue-tsc.js');
  if (!tool) return { tool: null, reason: "vue-tsc isn't installed in website/" };
  const run = runTool(tool.entry, ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], root);
  // `file(line,column): error TS1234: message`, a message's later lines indented under it.
  const diagnostics = [];
  for (const line of `${run.stdout}${run.stderr}`.split('\n')) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+: (.*)$/);
    if (match) {
      diagnostics.push({
        file: path.resolve(root, match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        message: match[4],
      });
    } else if (/^\s/.test(line) && diagnostics.length) {
      diagnostics.at(-1).message += ` ${line.trim()}`;
    }
  }
  if (run.status !== 0 && diagnostics.length === 0) {
    return { tool: null, reason: `vue-tsc failed: ${firstLine(run)}` };
  }
  return { tool: `vue-tsc ${tool.version}`, diagnostics };
}

/** Compile a Svelte tree with `svelte-check`, in a child process. */
async function compileWithSvelteCheck(root) {
  const tool = findTool('svelte-check', 'bin/svelte-check');
  if (!tool) return { tool: null, reason: "svelte-check isn't installed in website/" };
  const run = runTool(
    tool.entry,
    [
      '--workspace',
      root,
      '--tsconfig',
      './tsconfig.json',
      '--output',
      'machine-verbose',
      '--threshold',
      'error',
    ],
    root,
  );
  // `<time> {"type":"ERROR","filename":…,"start":{"line":0,…},"message":…}`, lines from 0, the
  // file relative to the workspace; a run ends with `<time> COMPLETED …` unless it failed.
  const diagnostics = [];
  let completed = false;
  for (const line of run.stdout.split('\n')) {
    const json = line.match(/^\d+ (\{.*\})$/);
    if (json) {
      const diagnostic = JSON.parse(json[1]);
      if (diagnostic.type !== 'ERROR') continue;
      diagnostics.push({
        file: path.resolve(root, diagnostic.filename),
        line: diagnostic.start.line + 1,
        column: diagnostic.start.character + 1,
        message: diagnostic.message,
      });
    } else if (/^\d+ COMPLETED\b/.test(line)) {
      completed = true;
    } else if (/^\d+ FAILURE\b/.test(line)) {
      return { tool: null, reason: `svelte-check failed: ${line.replace(/^\d+ FAILURE /, '')}` };
    }
  }
  if (!completed) return { tool: null, reason: `svelte-check failed: ${firstLine(run)}` };
  return { tool: `svelte-check ${tool.version}`, diagnostics };
}

const COMPILERS = {
  react: compileWithTsc,
  angular: compileWithNgc,
  vue: compileWithVueTsc,
  svelte: compileWithSvelteCheck,
};

/**
 * Compile one framework's tree at `root` (its `tsconfig.json` written by {@link writeTsconfig})
 * with the framework's own compiler, and the run's canary with it. Returns
 * `{ tool, diagnostics }`, each diagnostic's `file` absolute; or `{ tool: null, reason }` when the
 * compiler isn't installed, fails, or misses an error in the canary. `checks(file)` narrows which
 * files a compiler that can narrow checks; the others report on every file.
 */
export async function compile(framework, root, checks = () => true) {
  const canary = writeCanary(framework, root);
  let result;
  try {
    result = await COMPILERS[framework](root, (file) => isCanary(root, file) || checks(file));
  } catch (error) {
    return {
      tool: null,
      reason: `its compiler failed: ${error instanceof Error ? error.message : error}`,
    };
  }
  if (!result.tool) return result;
  const missed = canary.lines.filter(
    (line) => !result.diagnostics.some((d) => d.file === canary.file && d.line === line),
  );
  if (missed.length) {
    // An unexported component is the one known cause: name it, so the fix is in the message.
    const unexported = result.diagnostics.filter(({ message }) => message.includes(UNEXPORTED));
    if (unexported.length) {
      return {
        tool: null,
        reason: unexported
          .map(
            ({ file, line, message }) =>
              `${toPosix(path.relative(root, file))}:${line}: ${message}`,
          )
          .join('; '),
      };
    }
    return {
      tool: null,
      reason: `${result.tool} missed the errors on line ${missed.join(', ')} of the check's canary, so it isn't checking ${FRAMEWORK_LABELS[framework]} files`,
    };
  }
  return {
    ...result,
    diagnostics: result.diagnostics.filter(({ file }) => !file || !isCanary(root, file)),
  };
}

/** Write through a temporary file, so a build reading it never sees half of it. */
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
