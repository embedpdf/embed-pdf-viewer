#!/usr/bin/env node
/**
 * API snapshot (G10): every publishable package's public entry points, rolled
 * up to one text file per entry under `api/`, committed and diffed in CI.
 *
 *   node tooling/build/src/api-snapshot.mjs          # write snapshots
 *   node tooling/build/src/api-snapshot.mjs --check  # fail on drift
 *
 * Works on SOURCE entries (the `exports` map points at `src/*.ts`), so no
 * build is needed; a line per exported symbol with its declaration text, so
 * a diff reads as an API change. Signatures stay authored in TypeScript —
 * this is a mirror, never a second source of truth.
 *
 * Source-first all the way down: re-exports are followed with the
 * `development` condition (what Vite's dev server resolves), so a boundary
 * package's `import` → dist types never enter the picture, and a package
 * whose types only exist as `tsc --emitDeclarationOnly` mirrors (the viewer's
 * doors) is read through the src/ file its dist/ declaration mirrors; an
 * ng-packagr package through the entry files its `ng-package.json`s name. A
 * snapshot therefore never depends on what happens to be built — it is the
 * same text on a bare checkout (CI's contract job) and a developer's machine.
 * Vue and Svelte components, which the checker cannot read, get their props,
 * events and slots from their `<script>` blocks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const check = process.argv.includes('--check');
const outRoot = path.join(root, 'api');

function workspacePackages() {
  const json = execFileSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8' });
  return JSON.parse(json)
    .filter((p) => p.path.startsWith(path.join(root, 'packages') + path.sep))
    .map((p) => ({ name: p.name, dir: p.path, manifest: JSON.parse(fs.readFileSync(path.join(p.path, 'package.json'), 'utf8')) }))
    .filter((p) => p.manifest.private !== true && p.manifest.exports);
}

function sourceEntries(pkg) {
  const entries = [];
  for (const subpath of Object.keys(pkg.manifest.exports)) {
    const file = sourceOf(pkg, subpath);
    if (!file) continue;
    entries.push({ subpath: subpath === '.' ? 'index' : subpath.replace(/^\.\//, '').replace(/\//g, '__'), file });
  }
  return entries;
}

/**
 * The source file behind a package's export subpath, read from the manifest
 * and build config alone (never from what is built): the source condition
 * when the package has one, else the entry file ng-packagr builds it from,
 * else the src/ file its `types` declaration mirrors (a package built outside
 * the preset — the viewer's doors). Null when the subpath is not a TypeScript
 * surface (a CSS file, a worker's shipped d.ts, package.json).
 */
function sourceOf(pkg, subpath) {
  const target = pkg.manifest.exports?.[subpath];
  const declared =
    typeof target === 'string' ? target : (target?.development ?? target?.import ?? target?.default);
  if (typeof declared === 'string' && isSource(declared)) return path.join(pkg.dir, declared);
  const ngEntry = sourceOfNgEntry(pkg, subpath);
  if (ngEntry) return ngEntry;
  if (typeof target?.types === 'string') return sourceOfMirror(path.join(pkg.dir, target.types));
  return null;
}

/**
 * An ng-packagr package (an `ng-package.json` beside its manifest) builds one
 * entry point per folder: `.` from the package root, `./runtime` from
 * `runtime/`, each folder's `ng-package.json` naming its source as
 * `lib.entryFile` (ng-packagr's default: `src/public_api.ts`). Its `exports`
 * only name dist/ files, whose layout maps back to no source path.
 */
function sourceOfNgEntry(pkg, subpath) {
  if (!fs.existsSync(path.join(pkg.dir, 'ng-package.json'))) return null;
  const folder = subpath === '.' ? pkg.dir : path.join(pkg.dir, subpath.replace(/^\.\//, ''));
  const config = path.join(folder, 'ng-package.json');
  if (!fs.existsSync(config)) return null;
  const entryFile = JSON.parse(fs.readFileSync(config, 'utf8')).lib?.entryFile ?? 'src/public_api.ts';
  const file = path.join(folder, entryFile);
  return isSource(file) && fs.existsSync(file) ? file : null;
}

/** `@embedpdf/viewer/core` → the workspace package and its export subpath, if it names one. */
function workspaceSubpath(specifier) {
  const m = /^((?:@[^/]+\/)?[^/]+)(\/.+)?$/.exec(specifier);
  const pkg = m && packagesByName.get(m[1]);
  return pkg ? { pkg, subpath: m[2] ? `.${m[2]}` : '.' } : null;
}

const isSource = (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts');

/**
 * `<pkg>/dist/<x>.d.ts` → `<pkg>/src/<x>.ts` when that source exists — the
 * layout `tsc --emitDeclarationOnly` (rootDir src, outDir dist) produces, and
 * the only way a workspace package without a source condition exposes types.
 * Workspace packages only: a dependency from the registry that happens to
 * ship both src/ and dist/ is left to its own declarations.
 */
function sourceOfMirror(declaration) {
  const m = /^(.*)[\\/]dist[\\/](.*)\.d\.ts$/.exec(declaration);
  if (!m || !workspaceDirs.has(m[1])) return null;
  for (const ext of ['.ts', '.tsx']) {
    const candidate = path.join(m[1], 'src', `${m[2]}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findTsconfig(dir) {
  let current = dir;
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return null;
}

function programFor(pkg, files) {
  const tsconfig = findTsconfig(pkg.dir);
  const config = tsconfig ? ts.readConfigFile(tsconfig, ts.sys.readFile).config : {};
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(tsconfig ?? pkg.dir));
  const options = {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
    // The source door of every boundary package (epdf.devExports 'development'):
    // without it the checker follows a re-export into tsdown's hash-named dist
    // chunks — text that changes with the build and is absent on a bare checkout.
    customConditions: [...new Set([...(parsed.options.customConditions ?? []), 'development'])],
  };
  const host = ts.createCompilerHost(options);
  const cache = ts.createModuleResolutionCache(host.getCurrentDirectory(), host.getCanonicalFileName, options);
  // Same fold for imports inside the program: `export * from '@embedpdf/viewer'`
  // lands on the door's source, not on dist/doors/*.d.ts.
  host.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, compilerOptions) =>
    literals.map((literal) => {
      const result = ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, cache, redirectedReference);
      if (result.resolvedModule && isSource(result.resolvedModule.resolvedFileName)) return result;
      // Not source (or not resolvable at all, on a bare checkout): a workspace
      // package's subpath is read from its manifest, like the entries above.
      const named = workspaceSubpath(literal.text);
      const source = named && sourceOf(named.pkg, named.subpath);
      return source
        ? { ...result, resolvedModule: { resolvedFileName: source, extension: path.extname(source), isExternalLibraryImport: false } }
        : result;
    });
  return ts.createProgram(files, options, host);
}

/** Declaration text without comments or layout: what changes when the API changes, nothing else. */
function signatureText(decl) {
  return normalize(decl.getText());
}

/** {@link signatureText}'s normalisation, for text that is not one declaration (a component's surface). */
function normalize(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block and doc comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (not URLs)
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1 ')
    .trim();
}

function describe(symbol, checker, source) {
  const component = componentOf(symbol, checker);
  if (component) {
    return `${symbol.name} [${component.kind}] (from ${path.relative(root, component.file)}): ${component.surface}`;
  }
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = target.declarations?.[0];
  if (!decl) return `${symbol.name}: <unresolved>`;
  const kind = ts.SyntaxKind[decl.kind];
  const from = decl.getSourceFile() === source ? '' : ` (from ${path.relative(root, decl.getSourceFile().fileName)})`;
  return `${symbol.name} [${kind}]${from}: ${signatureText(decl)}`;
}

// ── single-file components ──

/**
 * The Vue or Svelte component an export is the default of, when it is one.
 * The checker cannot read single-file components (a `.vue` import resolves to
 * nothing, a `.svelte` one to the ambient module every component shares), so
 * the re-export chain is walked by hand to the specifier that names the file.
 * A `./readers.svelte` specifier names `readers.svelte.ts`, not a component:
 * only a file that exists under the specifier's own name counts.
 */
function componentOf(symbol, checker) {
  for (let current = symbol; current?.flags & ts.SymbolFlags.Alias; current = checker.getImmediateAliasedSymbol(current)) {
    for (const decl of current.declarations ?? []) {
      const imported = defaultImportOf(decl);
      const kind = imported && { '.vue': 'VueComponent', '.svelte': 'SvelteComponent' }[path.extname(imported)];
      if (!kind || !imported.startsWith('.')) continue;
      const file = path.resolve(path.dirname(decl.getSourceFile().fileName), imported);
      if (!fs.existsSync(file)) continue;
      return { kind, file, surface: kind === 'VueComponent' ? vueSurface(file) : svelteSurface(file) };
    }
  }
  return null;
}

/** The module specifier an import or re-export declaration takes its `default` from; null for a named one. */
function defaultImportOf(decl) {
  if (ts.isImportClause(decl)) return decl.name ? decl.parent.moduleSpecifier.text : null;
  if (!ts.isExportSpecifier(decl) && !ts.isImportSpecifier(decl)) return null;
  if ((decl.propertyName ?? decl.name).text !== 'default') return null;
  const statement = ts.isExportSpecifier(decl) ? decl.parent.parent : decl.parent.parent.parent;
  return statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
}

/**
 * A Vue component's public surface, from its `<script setup>` compiler
 * macros: props (with `withDefaults` defaults), models, emits, slots, the
 * exposed members and the component options. A props type declared in the
 * component itself is written out; an imported one is named, and has its own
 * line where it is exported. An options-API component's surface is its
 * `export default` definition.
 */
function vueSurface(file) {
  const scripts = scriptBlocks(file);
  const setup = scripts.find((script) => script.attributes.has('setup'));
  if (!setup) {
    const definition = scripts.flatMap((script) => script.ast.statements).find(ts.isExportAssignment);
    return definition ? `export default ${signatureText(definition.expression)}` : 'no props';
  }
  const locals = localTypes(scripts);
  const declared = (call) =>
    call.typeArguments?.[0] ? typeText(call.typeArguments[0], locals) : call.arguments[0] ? signatureText(call.arguments[0]) : '{}';
  const parts = {};
  const models = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const [first, second] = node.arguments;
      switch (node.expression.text) {
        case 'defineProps':
          parts.props = declared(node);
          break;
        case 'withDefaults':
          if (second) parts.defaults = signatureText(second);
          break;
        case 'defineModel': {
          // `defineModel<T>('name', options)`: the name is optional, and `modelValue` without one.
          const name = first && ts.isStringLiteral(first) ? first.text : 'modelValue';
          const options = node.arguments.find(ts.isObjectLiteralExpression);
          const type = node.typeArguments?.[0] ? `: ${typeText(node.typeArguments[0], locals)}` : '';
          models.push(`${name}${type}${options ? ` (${signatureText(options)})` : ''}`);
          break;
        }
        case 'defineEmits':
          parts.emits = declared(node);
          break;
        case 'defineSlots':
          parts.slots = declared(node);
          break;
        case 'defineExpose':
          // The members' values are inferred from implementation; their names are the contract.
          if (first && ts.isObjectLiteralExpression(first)) {
            parts.expose = `{ ${first.properties.map((member) => member.name?.getText() ?? signatureText(member)).join(', ')} }`;
          }
          break;
        case 'defineOptions':
          if (first) parts.options = signatureText(first);
          break;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(setup.ast);
  if (models.length) parts.model = models.join(', ');
  const generic = setup.attributes.get('generic');
  if (typeof generic === 'string') parts.generic = `<${generic}>`;
  return surfaceText(parts, ['generic', 'props', 'defaults', 'model', 'emits', 'slots', 'expose', 'options']);
}

/**
 * A Svelte 5 (runes) component's public surface, from the `$props()`
 * declaration in its instance `<script>`: the props type, the defaults its
 * destructuring gives, and which props are `$bindable` (`bind:`-able). Props
 * are read by their prop names, so `{ class: className }` reads as `class`.
 */
function svelteSurface(file) {
  const scripts = scriptBlocks(file);
  const instance = scripts.find((script) => !script.attributes.has('module') && script.attributes.get('context') !== 'module');
  const parts = {};
  const generics = instance?.attributes.get('generics');
  if (typeof generics === 'string') parts.generics = `<${generics}>`;
  const declaration = instance?.ast.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((decl) => decl.initializer && isCallTo(decl.initializer, '$props'));
  if (declaration) {
    const elements = ts.isObjectBindingPattern(declaration.name)
      ? declaration.name.elements.filter((element) => !element.dotDotDotToken)
      : [];
    const propName = (element) => (element.propertyName ?? element.name).getText();
    if (declaration.type) parts.props = typeText(declaration.type, localTypes(scripts));
    else if (elements.length) parts.props = `{ ${elements.map(propName).join(', ')} }`;
    const defaults = [];
    const bindable = [];
    for (const element of elements) {
      let initial = element.initializer;
      if (initial && isCallTo(initial, '$bindable')) {
        bindable.push(propName(element));
        initial = initial.arguments[0];
      }
      if (initial) defaults.push(`${propName(element)}: ${signatureText(initial)}`);
    }
    if (defaults.length) parts.defaults = `{ ${defaults.join(', ')} }`;
    if (bindable.length) parts.bindable = bindable.join(', ');
  }
  return surfaceText(parts, ['generics', 'props', 'defaults', 'bindable']);
}

/** `props …; emits …` in a fixed order, so a line moves only when the surface does. */
function surfaceText(parts, order) {
  const present = order.filter((key) => parts[key] !== undefined);
  return present.length ? present.map((key) => `${key} ${normalize(parts[key])}`).join('; ') : 'no props';
}

const isCallTo = (node, name) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

/**
 * A props type as text: a type the component declares itself is written out
 * (`interface Props{ … }`), any other is named.
 */
function typeText(node, locals) {
  const local =
    ts.isTypeReferenceNode(node) && !node.typeArguments && ts.isIdentifier(node.typeName) ? locals.get(node.typeName.text) : null;
  return local ? signatureText(local).replace(/^export\s+/, '').replace(/;$/, '') : signatureText(node);
}

/** The interfaces and type aliases a component's scripts declare at their top level, by name. */
function localTypes(scripts) {
  const types = new Map();
  for (const statement of scripts.flatMap((script) => script.ast.statements)) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) types.set(statement.name.text, statement);
  }
  return types;
}

/**
 * The top-level `<script>` blocks of a `.vue` or `.svelte` file, each with its
 * attributes and its content parsed as TypeScript. HTML comments are skipped,
 * so a `<script setup>` mentioned in one is not taken for a block; quoted
 * attribute values may hold `>` (`generics="T extends Map<K, V>"`).
 */
function scriptBlocks(file) {
  const text = fs.readFileSync(file, 'utf8');
  const blocks = [];
  const tags = /<!--[\s\S]*?-->|<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/g;
  for (const [match, attributes, content] of text.matchAll(tags)) {
    if (match.startsWith('<!--')) continue;
    blocks.push({
      attributes: new Map(
        [...attributes.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g)].map(
          ([, name, double, single, bare]) => [name, double ?? single ?? bare ?? true],
        ),
      ),
      ast: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
    });
  }
  return blocks;
}

// ── snapshot ──

let drift = 0;
const packages = workspacePackages();
const workspaceDirs = new Set(packages.map((p) => p.dir));
const packagesByName = new Map(packages.map((p) => [p.name, p]));
for (const pkg of packages) {
  const entries = sourceEntries(pkg);
  if (entries.length === 0) continue;
  const program = programFor(pkg, entries.map((e) => e.file));
  const checker = program.getTypeChecker();
  for (const entry of entries) {
    const source = program.getSourceFile(entry.file);
    if (!source) continue;
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;
    const lines = checker.getExportsOfModule(moduleSymbol).map((s) => describe(s, checker, source)).sort();
    const next = `# ${pkg.name} — ${entry.subpath === 'index' ? '.' : './' + entry.subpath.replace(/__/g, '/')}\n\n${lines.join('\n')}\n`;
    const outFile = path.join(outRoot, pkg.name.replace('@', '').replace('/', '__'), `${entry.subpath}.api.txt`);
    if (check) {
      const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
      if (prev !== next) {
        drift++;
        console.error(`API changed: ${path.relative(root, outFile)} (run: pnpm api:snapshot)`);
      }
    } else {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, next);
    }
  }
}
if (check && drift > 0) {
  console.error(`\n${drift} public entry point(s) changed without an updated snapshot.`);
  process.exit(1);
}
if (!check) console.log(`API snapshots written to ${path.relative(root, outRoot)}/`);
