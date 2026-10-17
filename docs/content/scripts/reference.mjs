#!/usr/bin/env node
/**
 * The headless reference check: the docs list every public member of every plugin, and nothing
 * the code doesn't have.
 *
 *   node scripts/reference.mjs                    check, exit 1 on a mismatch
 *   node scripts/reference.mjs --list             print every capability's members
 *   node scripts/reference.mjs --manifest <file>  check against another manifest (drafting)
 *
 * A headless plugin page ends with its reference: a `## Methods` table (the call in its `Method`
 * column), a `## State` table (the getter in its `Read once` column) and a
 * `## Events` table (its `Event` column). `../reference.mjs` says which pages document which
 * capability. The check reads each capability interface from its TypeScript source, following
 * `extends` and nested nouns (`selection: { … }` makes `selection.update`), and fails when:
 *
 * - a member is on no page, or on two;
 * - a page lists a name the capability doesn't have;
 * - a `pending` entry is no longer needed: the name is now in both the code and the docs, or in
 *   neither.
 *
 * `pending` holds the names where the docs describe the API the code is moving to: each entry
 * says why, so the list shrinks as the code lands.
 *
 * The same run compares the tables with the declarations the code keeps next to its contract:
 *
 * - a `## State` table's `Field` column with the `empty` keys of the plugin's `defineState()`;
 * - a `## Settings` table's `Setting` column with the plugin's settings defaults, as dotted paths
 *   (a row may name a group, such as `chrome`, that a page of its own details);
 * - every `From CSS` column with `EPDF_VARIABLES` in `@embedpdf/web`, both ways.
 *
 * A plugin that doesn't declare its state or settings yet is skipped: it adopts them in phase 3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { pathToFileURL } from 'node:url';

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(contentRoot, '../..');
const packagesRoot = path.join(repoRoot, 'packages');
const ts = createRequire(path.join(repoRoot, 'package.json'))('typescript');

// ── reading a capability from its source ────────────────────────────────────

const sourceCache = new Map();
function sourceOf(file) {
  if (!sourceCache.has(file)) {
    const text = fs.readFileSync(file, 'utf8');
    sourceCache.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  return sourceCache.get(file);
}

/** Package name → its directory, for following imports between packages. */
const packageDirs = (() => {
  const dirs = new Map();
  const visit = (dir, depth) => {
    if (depth > 3) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const child = path.join(dir, entry.name);
      const manifest = path.join(child, 'package.json');
      if (fs.existsSync(manifest)) {
        const { name } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (name) dirs.set(name, child);
      }
      visit(child, depth + 1);
    }
  };
  visit(packagesRoot, 0);
  return dirs;
})();

function resolveModule(fromFile, specifier) {
  const candidates = [];
  if (specifier.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    candidates.push(`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'));
  } else {
    const parts = specifier.split('/');
    const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const subpath = parts.slice(specifier.startsWith('@') ? 2 : 1).join('/');
    const dir = packageDirs.get(name);
    if (!dir) return null;
    if (subpath) {
      candidates.push(
        path.join(dir, 'src', `${subpath}.ts`),
        path.join(dir, 'src', subpath, 'index.ts'),
        path.join(dir, 'src', `${subpath.replaceAll('/', '-')}.ts`),
      );
    }
    candidates.push(path.join(dir, 'src', 'index.ts'));
  }
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

/** Find the interface or type alias `name` as seen from `file`, following imports and re-exports. */
function findDeclaration(file, name, seen = new Set()) {
  const key = `${file}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const source = sourceOf(file);
  for (const statement of source.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
    ) {
      return { file, node: statement };
    }
  }
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings) {
      const bindings = statement.importClause.namedBindings;
      if (!ts.isNamedImports(bindings)) continue;
      const match = bindings.elements.find((element) => element.name.text === name);
      if (!match) continue;
      const target = resolveModule(file, statement.moduleSpecifier.text);
      const original = match.propertyName?.text ?? name;
      if (target) return findDeclaration(target, original, seen);
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const target = resolveModule(file, statement.moduleSpecifier.text);
      if (!target) continue;
      if (!statement.exportClause) {
        const found = findDeclaration(target, name, seen);
        if (found) return found;
      } else if (ts.isNamedExports(statement.exportClause)) {
        const match = statement.exportClause.elements.find((element) => element.name.text === name);
        if (match) return findDeclaration(target, match.propertyName?.text ?? name, seen);
      }
    }
  }
  return null;
}

const LEAF_TYPES = /(^|\.)(EventHook|Signal|ReadonlySignal)$/;

/**
 * Every member of a type, as dotted paths: methods and event hooks are leaves, a property whose
 * type is an object (inline, or an interface of ours) is a noun whose members join with a dot.
 */
function membersOf(file, typeNode, prefix, out, errors, depth = 0) {
  if (depth > 4) return;
  const addMembers = (members, memberFile) => {
    for (const member of members) {
      if (!member.name || !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)))
        continue;
      const name = `${prefix}${member.name.text}`;
      if (ts.isMethodSignature(member)) {
        out.add(name);
      } else if (ts.isPropertySignature(member)) {
        const type = member.type;
        if (type && ts.isTypeLiteralNode(type)) {
          membersOf(memberFile, type, `${name}.`, out, errors, depth + 1);
        } else if (
          type &&
          ts.isTypeReferenceNode(type) &&
          !LEAF_TYPES.test(type.typeName.getText())
        ) {
          const found = findDeclaration(memberFile, type.typeName.getText());
          if (found && ts.isInterfaceDeclaration(found.node) && hasMethods(found.node)) {
            membersOf(found.file, found.node, `${name}.`, out, errors, depth + 1);
          } else {
            out.add(name);
          }
        } else {
          out.add(name);
        }
      }
    }
  };

  if (ts.isTypeLiteralNode(typeNode)) {
    addMembers(typeNode.members, file);
    return;
  }
  if (ts.isInterfaceDeclaration(typeNode)) {
    for (const clause of typeNode.heritageClauses ?? []) {
      for (const heritage of clause.types) {
        const base = heritage.expression.getText();
        const found = findDeclaration(file, base);
        if (!found)
          errors.push(
            `${path.relative(repoRoot, file)}: can't find ${base}, which ${typeNode.name.text} extends`,
          );
        else membersOf(found.file, found.node, prefix, out, errors, depth);
      }
    }
    addMembers(typeNode.members, file);
    return;
  }
  if (ts.isTypeAliasDeclaration(typeNode)) {
    const type = typeNode.type;
    const parts = ts.isIntersectionTypeNode(type) ? type.types : [type];
    for (const part of parts) {
      if (ts.isTypeLiteralNode(part)) addMembers(part.members, file);
      else if (ts.isTypeReferenceNode(part)) {
        const found = findDeclaration(file, part.typeName.getText());
        if (found) membersOf(found.file, found.node, prefix, out, errors, depth);
        else errors.push(`${path.relative(repoRoot, file)}: can't find ${part.typeName.getText()}`);
      }
    }
  }
}

function hasMethods(node) {
  return (
    node.members.some((member) => ts.isMethodSignature(member)) ||
    (node.heritageClauses?.length ?? 0) > 0
  );
}

function capabilityMembers(spec, errors) {
  const [relative, name] = spec.split('#');
  const file = path.join(packagesRoot, relative);
  const found = findDeclaration(file, name);
  if (!found) {
    errors.push(`${relative}: no interface ${name}`);
    return new Set();
  }
  const out = new Set();
  membersOf(found.file, found.node, '', out, errors);
  return out;
}

// ── reading a page's reference ──────────────────────────────────────────────

function section(mdx, heading) {
  const match = mdx.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return match ? match[1] : '';
}

/**
 * The names in the column headed `header` of each table in a section: the start of each
 * backticked span. A table without that column contributes nothing.
 */
function namesIn(text, header) {
  const names = new Set();
  let column = -1;
  let inTable = false;
  for (const row of text.split('\n')) {
    if (!row.startsWith('|')) {
      inTable = false;
      continue;
    }
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!inTable) {
      inTable = true;
      column = cells.indexOf(header);
      continue;
    }
    if (column < 0 || /^:?-+:?$/.test(cells[0] ?? '')) continue;
    for (const [, span] of (cells[column] ?? '').matchAll(/`([^`]+)`/g)) {
      const match = span.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/);
      if (match) names.add(match[1]);
    }
  }
  return names;
}

function pageNames(page) {
  const mdx = fs.readFileSync(path.join(contentRoot, page), 'utf8');
  return new Set([
    ...namesIn(section(mdx, 'Methods'), 'Method'),
    ...namesIn(section(mdx, 'State'), 'Read once'),
    ...namesIn(section(mdx, 'Events'), 'Event'),
  ]);
}

/** Every table in `text`: its header cells and, per row, the cells by header. */
function tablesIn(text) {
  const tables = [];
  let table = null;
  for (const row of text.split('\n')) {
    if (!row.startsWith('|')) {
      table = null;
      continue;
    }
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!table) {
      table = { headers: cells, rows: [] };
      tables.push(table);
    } else if (!/^:?-+:?$/.test(cells[0] ?? '')) {
      table.rows.push(
        Object.fromEntries(table.headers.map((header, i) => [header, cells[i] ?? ''])),
      );
    }
  }
  return tables;
}

/** The first backticked name in a cell: `highlight.color` from "`highlight.color`, or …". */
const firstName = (cell) => cell.match(/`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/)?.[1] ?? null;

// ── reading the declarations next to a contract ─────────────────────────────

/** Every TypeScript file under a directory. */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [child] : [];
  });
}

/** An expression without `as const`, `satisfies T`, `<T>x`, parentheses or `Object.freeze()`. */
function unwrap(node) {
  while (node) {
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isTypeAssertionExpression(node)
    ) {
      node = node.expression;
    } else if (ts.isCallExpression(node) && node.expression.getText() === 'Object.freeze') {
      node = node.arguments[0];
    } else {
      return node;
    }
  }
  return node;
}

/** The object literal `node` is, following a `const` in the same file or one it imports. */
function objectLiteralOf(file, node, seen = new Set()) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isObjectLiteralExpression(node)) return { file, node };
  if (!ts.isIdentifier(node) || seen.has(`${file}#${node.text}`)) return null;
  seen.add(`${file}#${node.text}`);
  const source = sourceOf(file);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === node.text) {
        return objectLiteralOf(file, declaration.initializer, seen);
      }
    }
  }
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings) continue;
    const bindings = statement.importClause.namedBindings;
    if (!ts.isNamedImports(bindings)) continue;
    const match = bindings.elements.find((element) => element.name.text === node.text);
    const target = match && resolveModule(file, statement.moduleSpecifier.text);
    if (target) {
      const original = ts.factory.createIdentifier(match.propertyName?.text ?? node.text);
      return objectLiteralOf(target, original, seen);
    }
  }
  return null;
}

/** A property of an object literal, by name. */
const propertyOf = (literal, name) =>
  literal.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) && property.name.getText().replace(/['"]/g, '') === name,
  );

/** The dotted paths of an object literal's leaves; an object that can't be read is one leaf. */
function leafPaths(file, literal, prefix = '') {
  return literal.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
      return [];
    const name = `${prefix}${property.name.getText().replace(/['"]/g, '')}`;
    const value = ts.isPropertyAssignment(property) ? unwrap(property.initializer) : null;
    const nested = value && ts.isObjectLiteralExpression(value) ? { file, node: value } : null;
    return nested ? leafPaths(nested.file, nested.node, `${name}.`) : [name];
  });
}

/** Every call of `callee` in the capability's package, with the file it is in. */
function callsIn(capabilityFile, callee) {
  const packageDir = capabilityFile.slice(0, capabilityFile.indexOf(`${path.sep}src${path.sep}`));
  const calls = [];
  for (const file of sourceFiles(path.join(packageDir, 'src'))) {
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.getText().split('.').pop() === callee) {
        calls.push({ file, node });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceOf(file));
  }
  return calls;
}

/**
 * The fields of every `defineState(Token, { read, empty })` of the capability, or null without
 * one: a capability may declare more than one State table (the documents capability: the
 * document in scope, and every document).
 */
function declaredStateFields(capabilityFile, token) {
  let fields = null;
  for (const { file, node } of callsIn(capabilityFile, 'defineState')) {
    if (node.arguments[0]?.getText() !== token) continue;
    const declaration = objectLiteralOf(file, node.arguments[1]);
    const empty = declaration && propertyOf(declaration.node, 'empty');
    const literal = empty && objectLiteralOf(declaration.file, empty.initializer);
    if (literal) {
      fields = [
        ...(fields ?? []),
        ...literal.node.properties.map((property) => property.name.getText().replace(/['"]/g, '')),
      ];
    }
  }
  return fields;
}

/**
 * The dotted paths of the plugin's settings defaults, or null without a declaration: the
 * `defaults` of a `settings: { defaults, registered }` in its definition, or the first argument
 * of a `ctx.settings(defaults, registered)` call.
 */
function declaredSettingPaths(capabilityFile) {
  for (const { file, node } of callsIn(capabilityFile, 'definePlugin')) {
    const definition = objectLiteralOf(file, node.arguments[0]);
    const settings = definition && propertyOf(definition.node, 'settings');
    const literal = settings && objectLiteralOf(definition.file, settings.initializer);
    const defaults = literal && propertyOf(literal.node, 'defaults');
    const values = defaults && objectLiteralOf(literal.file, defaults.initializer);
    if (values) return leafPaths(values.file, values.node);
  }
  for (const { file, node } of callsIn(capabilityFile, 'settings')) {
    const values = node.arguments[0] && objectLiteralOf(file, node.arguments[0]);
    if (values) return leafPaths(values.file, values.node);
  }
  return null;
}

/**
 * State: the page's `Field` column has exactly the declaration's fields. A field another
 * capability on the same page declares is that capability's (Several documents lists the
 * documents and the view manager's panes).
 */
function checkState(pages, fields, ownedElsewhere = new Set()) {
  const documented = new Set();
  for (const page of pages) {
    const mdx = fs.readFileSync(path.join(contentRoot, page), 'utf8');
    for (const table of tablesIn(section(mdx, 'State'))) {
      for (const row of table.rows) {
        const name = row.Field && firstName(row.Field);
        if (name) documented.add(name);
      }
    }
  }
  return [
    ...fields
      .filter((field) => !documented.has(field))
      .map((field) => `state field \`${field}\` is in defineState() but not in a State table`),
    ...[...documented]
      .filter((name) => !fields.includes(name) && !ownedElsewhere.has(name))
      .map((name) => `State table lists \`${name}\`, which defineState() doesn't declare`),
  ];
}

/**
 * Settings: every default is covered by a row (itself, or a group row above it), and every row
 * names a default, a group of them, or a part of one the declaration keeps as one value.
 */
function checkSettings(pages, leaves) {
  const documented = new Set();
  for (const page of pages) {
    const mdx = fs.readFileSync(path.join(contentRoot, page), 'utf8');
    for (const table of tablesIn(section(mdx, 'Settings'))) {
      for (const row of table.rows) {
        const name = row.Setting && firstName(row.Setting);
        if (name) documented.add(name);
      }
    }
  }
  const within = (inner, outer) => inner === outer || inner.startsWith(`${outer}.`);
  return [
    ...leaves
      .filter((leaf) => ![...documented].some((name) => within(leaf, name) || within(name, leaf)))
      .map((leaf) => `setting \`${leaf}\` has a default but no Settings row`),
    ...[...documented]
      .filter((name) => !leaves.some((leaf) => within(leaf, name) || within(name, leaf)))
      .map((name) => `Settings table lists \`${name}\`, which has no default`),
  ];
}

/** Every `EPDF_VARIABLES` entry in `@embedpdf/web`: its name and the setting it overrides. */
function cssVariables() {
  const file = path.join(packagesRoot, 'framework/web/src/theme.ts');
  if (!fs.existsSync(file)) return null;
  const table = objectLiteralOf(file, ts.factory.createIdentifier('EPDF_VARIABLES'));
  if (!table) return null;
  return new Map(
    table.node.properties.filter(ts.isPropertyAssignment).map((property) => {
      const entry = unwrap(property.initializer);
      const setting = ts.isObjectLiteralExpression(entry) && propertyOf(entry, 'setting');
      return [
        property.name.getText().replace(/['"]/g, ''),
        setting && ts.isStringLiteral(unwrap(setting.initializer))
          ? unwrap(setting.initializer).text
          : null,
      ];
    }),
  );
}

/**
 * CSS: every `--epdf-*` in a `From CSS` column is in `EPDF_VARIABLES`, next to the setting it
 * overrides, and every variable is documented somewhere.
 */
function checkCss(variables) {
  const found = [];
  const documented = new Set();
  const headless = path.join(contentRoot, 'headless');
  const pages = sourceFilesMdx(headless);
  for (const file of pages) {
    const page = path.relative(contentRoot, file);
    for (const table of tablesIn(fs.readFileSync(file, 'utf8'))) {
      if (!table.headers.includes('From CSS')) continue;
      for (const row of table.rows) {
        for (const [, name] of row['From CSS'].matchAll(/`--epdf-([\w-]+)`/g)) {
          documented.add(name);
          if (!variables.has(name)) {
            found.push(`${page}: \`--epdf-${name}\` isn't in EPDF_VARIABLES (@embedpdf/web)`);
            continue;
          }
          // The row names the setting, or a group of them (`outline` for its color, width, dash).
          const setting = row.Setting && firstName(row.Setting);
          const overrides = variables.get(name);
          if (setting && overrides && !`.${overrides}.`.includes(`.${setting}.`)) {
            found.push(
              `${page}: \`--epdf-${name}\` overrides \`${overrides}\`, but its row is \`${setting}\``,
            );
          }
        }
      }
    }
  }
  for (const name of variables.keys()) {
    if (!documented.has(name))
      found.push(`\`--epdf-${name}\` is in EPDF_VARIABLES but in no From CSS column`);
  }
  return found;
}

/** Every MDX page under a directory. */
function sourceFilesMdx(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesMdx(child);
    return entry.name.endsWith('.mdx') ? [child] : [];
  });
}

// ── the check ───────────────────────────────────────────────────────────────

async function loadManifest() {
  const flag = process.argv.indexOf('--manifest');
  const file =
    flag > -1 ? path.resolve(process.argv[flag + 1]) : path.join(contentRoot, 'reference.mjs');
  return (await import(pathToFileURL(file).href)).REFERENCE;
}

async function run() {
  const REFERENCE = await loadManifest();
  const list = process.argv.includes('--list');
  const problems = [];
  const notes = [];
  const pagesOf = (entry) => entry.pages.map((p) => (typeof p === 'string' ? { page: p } : p));

  // Every capability's names, so a page shared by two capabilities (Several documents: documents
  // and the view manager) doesn't report one's names as unknown to the other.
  const loaded = REFERENCE.map((entry) => {
    const errors = [];
    const members = capabilityMembers(entry.capability, errors);
    return { entry, errors, members };
  });
  const ownedByOther = (page, except, name) =>
    loaded.some(
      ({ entry, members }, index) =>
        index !== except &&
        pagesOf(entry).some((p) => p.page === page) &&
        (members.has(name) || name in (entry.pending ?? {})),
    );

  for (const [index, { entry, errors, members }] of loaded.entries()) {
    const label = entry.capability.split('#')[1];

    if (list) {
      console.log(`\n${label} (${members.size})`);
      for (const member of [...members].sort()) console.log(`  ${member}`);
      for (const error of errors) console.log(`  ! ${error}`);
      continue;
    }

    const pending = entry.pending ?? {};
    const documentedOn = new Map(); // member → pages
    const unknown = [];
    for (const { page, base } of pagesOf(entry)) {
      for (const name of pageNames(page)) {
        const resolved = base && !name.startsWith(`${base}.`) ? `${base}.${name}` : name;
        if (members.has(resolved) || resolved in pending) {
          documentedOn.set(resolved, [...(documentedOn.get(resolved) ?? []), page]);
        } else if (members.has(name) || name in pending) {
          documentedOn.set(name, [...(documentedOn.get(name) ?? []), page]);
        } else if (!ownedByOther(page, index, name)) {
          unknown.push(`${page}: \`${resolved}\` isn't on ${label}`);
        }
      }
    }

    const found = [...errors, ...unknown];
    for (const member of members) {
      const pages = documentedOn.get(member);
      if (member in pending) {
        // Pending is right while a name is in exactly one of the two: the code or the docs.
        if (pages)
          found.push(
            `pending \`${member}\` (${pending[member]}) is in the code and on ${pages[0]} now: drop the pending entry`,
          );
        continue;
      }
      if (!pages) found.push(`\`${member}\` is on no page`);
      else if (new Set(pages).size > 1)
        found.push(`\`${member}\` is on ${[...new Set(pages)].join(' and ')}: keep it on one`);
    }
    for (const name of Object.keys(pending)) {
      if (!members.has(name) && !documentedOn.has(name)) {
        found.push(
          `pending \`${name}\` (${pending[name]}) is neither in the code nor on a page: drop the entry`,
        );
      }
    }

    // The declarations next to the contract, once the plugin has them.
    const capabilityFile = path.join(packagesRoot, entry.capability.split('#')[0]);
    const pageFiles = pagesOf(entry).map(({ page }) => page);
    const declared = [];
    const fields = declaredStateFields(capabilityFile, label.replace(/Capability$/, 'Token'));
    if (fields) {
      declared.push('state');
      // The State fields of the other capabilities that share a page with this one.
      const ownedElsewhere = new Set(
        loaded.flatMap(({ entry: other }, otherIndex) => {
          if (otherIndex === index) return [];
          if (!pagesOf(other).some(({ page }) => pageFiles.includes(page))) return [];
          const [otherFile, otherName] = other.capability.split('#');
          return (
            declaredStateFields(
              path.join(packagesRoot, otherFile),
              otherName.replace(/Capability$/, 'Token'),
            ) ?? []
          );
        }),
      );
      found.push(...checkState(pageFiles, fields, ownedElsewhere));
    }
    const settingPaths = declaredSettingPaths(capabilityFile);
    if (settingPaths) {
      declared.push('settings');
      found.push(...checkSettings(pageFiles, settingPaths));
    }

    const summary = `${label}: ${members.size} members, ${Object.keys(pending).length} pending${declared.length ? `, ${declared.join(' and ')} declared` : ''}`;
    if (found.length === 0) notes.push(`ok    ${summary}`);
    else problems.push({ summary, found });
  }

  if (list) return;

  const variables = cssVariables();
  if (variables) {
    const found = checkCss(variables);
    const summary = `CSS variables: ${variables.size} in @embedpdf/web`;
    if (found.length === 0) notes.push(`ok    ${summary}`);
    else problems.push({ summary, found });
  }

  for (const note of notes) console.log(note);
  for (const { summary, found } of problems) {
    console.error(`FAIL  ${summary}`);
    for (const line of found) console.error(`      - ${line}`);
  }
  if (problems.length) {
    console.error(
      '\nThe headless reference and the code disagree. See docs/content/reference.mjs.',
    );
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await run();

export { run as checkReference };
