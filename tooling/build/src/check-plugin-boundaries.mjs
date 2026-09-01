#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const PLUGIN_ROOT = /^@embedpdf\/plugin-[^/]+$/;
const PLUGIN_PACKAGE = /^(@embedpdf\/plugin-[^/]+)(?:\/(.+))?$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const IMPLEMENTATION_MODULE = /(?:^|\/)(?:[^/]+\.plugin|capability|effects|reducer)$/;

function normalize(file) {
  return file.split(path.sep).join('/');
}

function sourceFilesUnder(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === '__tests__') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'tests') visit(full);
        continue;
      }
      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) continue;
      if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      files.push(full);
    }
  };
  visit(root);
  return files;
}

function parse(file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function importIsTypeOnly(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings) return false;
  return (
    ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function exportIsTypeOnly(node) {
  if (node.isTypeOnly) return true;
  return (
    node.exportClause &&
    ts.isNamedExports(node.exportClause) &&
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

function moduleReferences(source) {
  const references = [];
  const add = (node, specifier, typeOnly) => {
    references.push({ node, specifier, typeOnly });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node.moduleSpecifier, node.moduleSpecifier.text, importIsTypeOnly(node));
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier, node.moduleSpecifier.text, exportIsTypeOnly(node));
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node.arguments[0], node.arguments[0].text, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function position(source, node) {
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { line: point.line + 1, column: point.character + 1 };
}

function resolveRelative(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(fromFile), specifier);
  const extension = path.extname(unresolved);
  const candidates = [unresolved];
  if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') {
    const stem = unresolved.slice(0, -extension.length);
    candidates.push(...SOURCE_EXTENSIONS.map((suffix) => `${stem}${suffix}`));
  } else if (!extension) {
    candidates.push(...SOURCE_EXTENSIONS.map((suffix) => `${unresolved}${suffix}`));
    candidates.push(...SOURCE_EXTENSIONS.map((suffix) => path.join(unresolved, `index${suffix}`)));
  }
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function runtimeRootReexports(source) {
  const roots = new Set();
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      PLUGIN_ROOT.test(statement.moduleSpecifier.text) &&
      !exportIsTypeOnly(statement)
    ) {
      roots.add(statement.moduleSpecifier.text);
    }
  }
  return roots;
}

function implementationRootImports(source) {
  const roots = runtimeRootReexports(source);
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !PLUGIN_ROOT.test(statement.moduleSpecifier.text) ||
      importIsTypeOnly(statement)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some((element) => element.name.text.endsWith('Plugin'))
    ) {
      roots.add(statement.moduleSpecifier.text);
    }
  }
  return roots;
}

function angularOwnedRoots(frameworkRoot) {
  const rootsByDirectory = new Map();
  const angularRoot = path.join(frameworkRoot, 'angular');
  if (!fs.existsSync(angularRoot)) return rootsByDirectory;
  for (const entry of fs.readdirSync(angularRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryRoot = path.join(angularRoot, entry.name);
    const publicApi = path.join(entryRoot, 'src', 'public_api.ts');
    if (!fs.existsSync(publicApi)) continue;
    rootsByDirectory.set(entryRoot, runtimeRootReexports(parse(publicApi)));
  }
  return rootsByDirectory;
}

function publicContractChecks(repoRoot, violations) {
  const pluginRoot = path.join(repoRoot, 'packages', 'plugin');
  if (!fs.existsSync(pluginRoot)) return;
  for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(pluginRoot, entry.name);
    const manifestFile = path.join(packageRoot, 'package.json');
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const contractEntry = manifest.exports?.['./contract'];
    if (contractEntry !== './src/contract.ts') {
      violations.push({
        file: manifestFile,
        line: 1,
        column: 1,
        message: 'plugin packages must export "./contract" from "./src/contract.ts"',
      });
      continue;
    }
    const indexFile = path.join(packageRoot, 'src', 'index.ts');
    const contractFile = path.join(packageRoot, 'src', 'contract.ts');
    if (!fs.existsSync(contractFile)) {
      violations.push({
        file: contractFile,
        line: 1,
        column: 1,
        message: 'declared plugin contract entry does not exist',
      });
      continue;
    }
    if (!fs.existsSync(indexFile)) continue;
    const indexSource = parse(indexFile);
    const exposesContract = indexSource.statements.some(
      (statement) =>
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === './contract' &&
        !exportIsTypeOnly(statement),
    );
    if (!exposesContract) {
      violations.push({
        file: indexFile,
        line: 1,
        column: 1,
        message: 'plugin implementation entry must re-export "./contract" to preserve its public API',
      });
    }

    const contractEntries = [contractFile];
    const hostEntry = manifest.exports?.['./contract/host'];
    if (hostEntry) {
      if (hostEntry !== './src/host-contract.ts') {
        violations.push({
          file: manifestFile,
          line: 1,
          column: 1,
          message: 'plugin host contracts must export from "./src/host-contract.ts"',
        });
      } else {
        const hostFile = path.resolve(packageRoot, hostEntry);
        if (!fs.existsSync(hostFile)) {
          violations.push({
            file: hostFile,
            line: 1,
            column: 1,
            message: 'declared plugin host-contract entry does not exist',
          });
        } else {
          contractEntries.push(hostFile);
        }
      }
    }
    for (const entryFile of contractEntries) {
      checkContractClosure(entryFile, violations);
    }
  }
}

function checkContractClosure(entryFile, violations) {
  const entrySource = parse(entryFile);
  const inspectTokenFactory = (node) => {
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'createCapabilityToken') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'createCapabilityToken'))
    ) {
      const { line, column } = position(entrySource, node.expression);
      violations.push({
        file: entryFile,
        line,
        column,
        message: 'contract entries must re-export or narrow the package token, never create a second token',
      });
    }
    ts.forEachChild(node, inspectTokenFactory);
  };
  inspectTokenFactory(entrySource);

  const pending = [entryFile];
  const seen = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const source = parse(file);
    for (const reference of moduleReferences(source)) {
      if (reference.typeOnly) continue;
      const target = resolveRelative(file, reference.specifier);
      if (!target) continue;
      const moduleName = normalize(target).replace(/\.[^.]+$/, '');
      if (IMPLEMENTATION_MODULE.test(moduleName)) {
        const { line, column } = position(source, reference.node);
        violations.push({
          file,
          line,
          column,
          message: `contract runtime graph reaches implementation module "${reference.specifier}"`,
        });
        continue;
      }
      pending.push(target);
    }
  }
}

function importBoundaryChecks(repoRoot, violations) {
  const pluginRoot = path.join(repoRoot, 'packages', 'plugin');
  for (const file of sourceFilesUnder(pluginRoot)) {
    const source = parse(file);
    for (const reference of moduleReferences(source)) {
      const match = PLUGIN_PACKAGE.exec(reference.specifier);
      if (!match || (match[2] && match[2] !== 'internal')) continue;
      const { line, column } = position(source, reference.node);
      violations.push({
        file,
        line,
        column,
        message: `plugin source imports implementation entry "${reference.specifier}"; use /contract, /contract/host, or a named helper entry`,
      });
    }
  }

  const frameworkRoot = path.join(repoRoot, 'packages', 'framework');
  const angularRoots = angularOwnedRoots(frameworkRoot);
  for (const file of sourceFilesUnder(frameworkRoot)) {
    const source = parse(file);
    const owned = runtimeRootReexports(source);
    for (const [entryRoot, roots] of angularRoots) {
      if (file === entryRoot || file.startsWith(`${entryRoot}${path.sep}`)) {
        for (const root of roots) owned.add(root);
      }
    }
    for (const reference of moduleReferences(source)) {
      const match = PLUGIN_PACKAGE.exec(reference.specifier);
      if (!match || (match[2] && match[2] !== 'internal') || owned.has(match[1])) continue;
      const { line, column } = position(source, reference.node);
      violations.push({
        file,
        line,
        column,
        message: `framework source imports sibling implementation entry "${reference.specifier}"; use its contract or a named helper entry`,
      });
    }
  }

  const otherSourceRoots = ['packages', 'cloudpdf', 'examples'].map((part) =>
    path.join(repoRoot, part),
  );
  for (const sourceRoot of otherSourceRoots) {
    for (const file of sourceFilesUnder(sourceRoot)) {
      if (
        file === pluginRoot ||
        file.startsWith(`${pluginRoot}${path.sep}`) ||
        file === frameworkRoot ||
        file.startsWith(`${frameworkRoot}${path.sep}`)
      ) {
        continue;
      }
      const source = parse(file);
      const implementationOptIns = implementationRootImports(source);
      for (const reference of moduleReferences(source)) {
        const match = PLUGIN_PACKAGE.exec(reference.specifier);
        if (!match || (match[2] && match[2] !== 'internal')) continue;
        if (!match[2] && implementationOptIns.has(match[1])) continue;
        const { line, column } = position(source, reference.node);
        violations.push({
          file,
          line,
          column,
          message: `consumer source imports implementation entry "${reference.specifier}" without opting in via its plugin factory; use its contract or a named helper entry`,
        });
      }
    }
  }
}

export function checkPluginBoundaries({ repoRoot = process.cwd() } = {}) {
  const violations = [];
  publicContractChecks(repoRoot, violations);
  importBoundaryChecks(repoRoot, violations);
  return violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column ||
      a.message.localeCompare(b.message),
  );
}

export function formatViolations(violations, repoRoot = process.cwd()) {
  return violations
    .map(({ file, line, column, message }) => {
      const shown = normalize(path.relative(repoRoot, file));
      return `  ${shown}:${line}:${column}  ${message}`;
    })
    .join('\n');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const repoRoot = process.cwd();
  const violations = checkPluginBoundaries({ repoRoot });
  if (violations.length > 0) {
    console.error(`Plugin boundary check failed (${violations.length}):\n${formatViolations(violations, repoRoot)}`);
    process.exitCode = 1;
  } else {
    console.log('Plugin boundary check passed.');
  }
}
