#!/usr/bin/env node
/**
 * Enforces the plugin architecture in docs/conventions/plugins.md and
 * docs/conventions/state-and-sync.md on every plugin's `src/`:
 *
 * - a manifest (`<name>.plugin.ts`) holds imports and one exported plugin
 *   factory, nothing else: behavior lives in the controller and `connect.ts`;
 * - document events are subscribed with `ctx.listen(ctx.doc.events, …)` or a
 *   mirror, never `doc.events.subscribe(…)`, so the kernel owns the unsubscribe;
 * - no `as never` casts: they switch the type checker off instead of stating a type;
 * - no hand-made `ChangeOrigin` literals: an origin always comes from `originOf(event)`.
 *
 *   node scripts/check-architecture.mjs            # fail on any finding
 *   node scripts/check-architecture.mjs packages/plugin/form
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const scopes = process.argv.slice(2);
const pluginRoot = path.join(root, 'packages/plugin');

function sourceFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(full, files);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

const files = fs
  .readdirSync(pluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => sourceFiles(path.join(pluginRoot, entry.name, 'src')))
  .filter((file) => !scopes.length || scopes.some((scope) => file.startsWith(path.resolve(root, scope))));

const findings = [];
const report = (file, node, sourceFile, message) => {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push(`${path.relative(root, file)}:${line + 1}  ${message}`);
};

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  if (file.endsWith('.plugin.ts')) {
    const statements = sourceFile.statements.filter(
      (statement) => !ts.isImportDeclaration(statement),
    );
    const factories = statements.filter(
      (statement) =>
        (ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement)) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
        /\bdefinePlugin\s*(?:<[\s\S]*?>)?\s*\(/.test(statement.getText(sourceFile)),
    );
    for (const statement of statements) {
      if (!factories.includes(statement)) {
        report(file, statement, sourceFile, 'a manifest holds imports and the plugin factory only');
      }
    }
    if (factories.length !== 1) {
      report(file, sourceFile, sourceFile, 'a manifest exports exactly one definePlugin factory');
    }
  }

  const visit = (node) => {
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.NeverKeyword) {
      report(file, node, sourceFile, '`as never` switches type checking off; state the type');
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'subscribe' &&
      /(?:^|\.)doc\.events$/.test(node.expression.expression.getText(sourceFile))
    ) {
      report(file, node, sourceFile, 'subscribe with ctx.listen(ctx.doc.events, …) or a mirror');
    }
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === 'locality',
      )
    ) {
      report(file, node, sourceFile, 'a ChangeOrigin comes from originOf(event), never a literal');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

for (const finding of findings) console.log(finding);
console.log(`\ncheck:architecture: ${findings.length} finding(s). See docs/conventions/plugins.md.`);
process.exit(findings.length ? 1 : 0);
