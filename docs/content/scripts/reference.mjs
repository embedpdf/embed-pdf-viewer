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
      if (!member.name || !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))) continue;
      const name = `${prefix}${member.name.text}`;
      if (ts.isMethodSignature(member)) {
        out.add(name);
      } else if (ts.isPropertySignature(member)) {
        const type = member.type;
        if (type && ts.isTypeLiteralNode(type)) {
          membersOf(memberFile, type, `${name}.`, out, errors, depth + 1);
        } else if (type && ts.isTypeReferenceNode(type) && !LEAF_TYPES.test(type.typeName.getText())) {
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
        if (!found) errors.push(`${path.relative(repoRoot, file)}: can't find ${base}, which ${typeNode.name.text} extends`);
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
  return node.members.some((member) => ts.isMethodSignature(member)) || (node.heritageClauses?.length ?? 0) > 0;
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
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
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

// ── the check ───────────────────────────────────────────────────────────────

async function loadManifest() {
  const flag = process.argv.indexOf('--manifest');
  const file = flag > -1 ? path.resolve(process.argv[flag + 1]) : path.join(contentRoot, 'reference.mjs');
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
        if (pages) found.push(`pending \`${member}\` (${pending[member]}) is in the code and on ${pages[0]} now: drop the pending entry`);
        continue;
      }
      if (!pages) found.push(`\`${member}\` is on no page`);
      else if (new Set(pages).size > 1) found.push(`\`${member}\` is on ${[...new Set(pages)].join(' and ')}: keep it on one`);
    }
    for (const name of Object.keys(pending)) {
      if (!members.has(name) && !documentedOn.has(name)) {
        found.push(`pending \`${name}\` (${pending[name]}) is neither in the code nor on a page: drop the entry`);
      }
    }

    const summary = `${label}: ${members.size} members, ${Object.keys(pending).length} pending`;
    if (found.length === 0) notes.push(`ok    ${summary}`);
    else problems.push({ summary, found });
  }

  if (list) return;
  for (const note of notes) console.log(note);
  for (const { summary, found } of problems) {
    console.error(`FAIL  ${summary}`);
    for (const line of found) console.error(`      - ${line}`);
  }
  if (problems.length) {
    console.error('\nThe headless reference and the code disagree. See docs/content/reference.mjs.');
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await run();

export { run as checkReference };
