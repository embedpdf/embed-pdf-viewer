/**
 * The checks only the viewer's docs need, next to the snippet check (`snippets.mjs`):
 *
 * - a plain-HTML snippet (`.vanilla.html`): its module scripts, taken out of the page and checked
 *   as JavaScript against `@embedpdf/viewer`; every `<embedpdf-viewer>` and `<epdf-*>` element
 *   the viewer's types declare; every `<embedpdf-viewer>` attribute a config key; every `slot`
 *   one the viewer has, on a child of the viewer; every `<script src>` the CDN script or a path;
 * - the code a viewer page shows itself (`js` and `ts` blocks: the config, the layout, the
 *   viewer in code), checked the same way, for every framework, as the config is the same in each;
 * - an install command (`.sh`) names packages this repository publishes.
 *
 * A staged file keeps its page's line numbers: what the check adds goes on lines the page's code
 * doesn't use, or is cut out of the column an error points at (`stagedText`).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  contentRoot,
  FRAMEWORK_LABELS,
  repoRoot,
  siteRequire,
  toPosix,
  VIEWER_CDN_URL,
} from './compile.mjs';

// ── the names a page's code uses ────────────────────────────────────────────

/**
 * `_viewer.ts` in the run: the names a viewer page's code uses without importing them, from the
 * one type the pages name, `ViewerConfig`. A name the config doesn't have is
 * `NotInViewerConfig<'key'>`, so an error says which key is missing.
 */
const VIEWER_NAMES = `// The names a viewer page's code uses without importing them (scripts/viewer.mjs).
import type { ViewerConfig } from '@embedpdf/viewer';

export interface NotInViewerConfig<Key extends string> {
  readonly notInViewerConfig: Key;
}

type Fn = (...args: never[]) => unknown;
type Value<Key extends string> = Key extends keyof ViewerConfig ? NonNullable<ViewerConfig[Key]> : never;
type Or<T, Key extends string> = [T] extends [never] ? NotInViewerConfig<Key> : T;
type FirstArgument<F> = [F] extends [never]
  ? never
  : F extends (first: infer A, ...rest: never[]) => unknown
    ? A
    : never;

/** The config. */
export type Config = ViewerConfig;
/** One of the config's \`commands\`. */
export type Command = Or<[Value<'commands'>] extends [ReadonlyArray<infer C>] ? C : never, 'commands'>;
/** The layout the config's \`layout\` function gets. */
export type Layout = Or<FirstArgument<Extract<Value<'layout'>, Fn>>, 'layout'>;
/** An item of a layout: what \`layout.add()\` takes. */
export type LayoutItem = Or<
  Layout extends { add(item: infer Item, ...rest: never[]): unknown } ? Item : never,
  'layout'
>;
/** The viewer, as the config's \`onReady\` gets it. */
export type Viewer = Or<FirstArgument<Extract<Value<'onReady'>, Fn>>, 'onReady'>;

export declare const viewer: Viewer;
export declare const layout: Layout;
`;

/** The page code's free names `_viewer.ts` declares. */
const FREE_NAMES = ['viewer', 'layout'];

/** A specifier for `target` from a file in `directory`. */
function specifier(directory, target) {
  const relative = toPosix(path.relative(directory, target));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

// ── staged text ─────────────────────────────────────────────────────────────

/**
 * A staged file made of its page's lines (`lines`, blank where the file has no code) and the
 * check's own text inserted at `{ line, column, text, at }`. `locate(line, column)` says where a
 * compiler's position is in the page: in the page's own text, or `at` for an insertion (null
 * when an error there is the check's own).
 */
function stagedText(lines, insertions) {
  const pieces = lines.map((text, index) => {
    const line = index + 1;
    const here = insertions.filter((insertion) => insertion.line === line);
    if (here.length === 0) return [{ text, line, column: 1 }];
    const parts = [];
    let cursor = 0;
    for (const insertion of here.sort((a, b) => a.column - b.column)) {
      parts.push({ text: text.slice(cursor, insertion.column - 1), line, column: cursor + 1 });
      parts.push({ text: insertion.text, added: true, at: insertion.at ?? null });
      cursor = insertion.column - 1;
    }
    parts.push({ text: text.slice(cursor), line, column: cursor + 1 });
    return parts;
  });
  return {
    text: `${pieces.map((parts) => parts.map((part) => part.text).join('')).join('\n')}\n`,
    locate(line, column) {
      const parts = pieces[line - 1];
      if (!parts) return { line, column };
      let offset = 0;
      for (const [index, part] of parts.entries()) {
        const end = offset + part.text.length;
        if (column - 1 < end || index === parts.length - 1) {
          if (part.added) return part.at;
          return { line: part.line, column: part.column + Math.max(0, column - 1 - offset) };
        }
        offset = end;
      }
      return { line, column };
    },
  };
}

// ── plain-HTML pages ────────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** Attributes every element has, which say nothing about the viewer. */
const GLOBAL_ATTRIBUTES = new Set([
  'accesskey',
  'autofocus',
  'class',
  'contenteditable',
  'dir',
  'draggable',
  'hidden',
  'id',
  'inert',
  'is',
  'lang',
  'nonce',
  'part',
  'popover',
  'role',
  'slot',
  'spellcheck',
  'style',
  'tabindex',
  'title',
  'translate',
]);
const isGlobalAttribute = (name) => GLOBAL_ATTRIBUTES.has(name) || /^(aria-|data-|on)/.test(name);

/** The viewer's regions, and the slot names of your own items and panels. */
const SLOT = /^(header|footer|tabs|empty)$|^(item|panel):[\w.:-]+$/;
const SLOTS_SAID = '`header`, `footer`, `tabs`, `empty`, `item:<id>` or `panel:<id>`';

const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * A plain-HTML page's elements, in order: tag, attributes, the parent element's tag, and where
 * each is (line and column, from 1). A `<script>` without `src` carries its `body` (offsets).
 */
function readHtml(source) {
  const lineAt = (offset) => source.slice(0, offset).split('\n').length;
  const columnAt = (offset) => offset - source.lastIndexOf('\n', offset - 1);
  const at = (offset) => ({ line: lineAt(offset), column: columnAt(offset) });
  const elements = [];
  const open = [];
  const tags =
    /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    const [whole, closing, name, attributeText = '', selfClosing] = match;
    if (whole.startsWith('<!--')) continue;
    const tag = name.toLowerCase();
    if (closing) {
      const index = open.findLastIndex((element) => element.tag === tag);
      if (index >= 0) open.length = index;
      continue;
    }
    const attributesStart = match.index + 1 + name.length;
    const attributes = [
      ...attributeText.matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g),
    ].map((attribute) => ({
      name: attribute[1].toLowerCase(),
      value: attribute[2] ?? attribute[3] ?? attribute[4] ?? '',
      ...at(attributesStart + attribute.index),
    }));
    const element = { tag, attributes, parent: open.at(-1)?.tag ?? null, ...at(match.index) };
    elements.push(element);
    if (tag === 'script' || tag === 'style') {
      const end = source.indexOf(`</${tag}`, tags.lastIndex);
      const stop = end < 0 ? source.length : end;
      const type = attributes.find((attribute) => attribute.name === 'type')?.value ?? '';
      const src = attributes.some((attribute) => attribute.name === 'src');
      if (tag === 'script' && !src && (type === '' || type === 'module')) {
        element.body = { start: tags.lastIndex, end: stop, ...at(tags.lastIndex) };
      }
      tags.lastIndex = stop;
      continue;
    }
    if (!selfClosing && !VOID_ELEMENTS.has(tag)) open.push(element);
  }
  return { elements, lines: source.split('\n') };
}

/** One script's lines, as the page has them, with everything else blank. */
function scriptLines(lines, source, body) {
  const end = source.slice(0, body.end).split('\n');
  const endLine = end.length;
  const endColumn = end.at(-1).length + 1;
  return lines.map((text, index) => {
    const line = index + 1;
    if (line < body.line || line > endLine) return '';
    let kept = line === endLine ? text.slice(0, endColumn - 1) : text;
    if (line === body.line) kept = ' '.repeat(body.column - 1) + kept.slice(body.column - 1);
    return kept;
  });
}

/**
 * `<name>.dom.ts`: `document` in a plain-HTML page's scripts, whose `getElementById` gives each
 * of the page's own elements as what it is (`<input id="file">` an `HTMLInputElement`, the viewer
 * what the viewer's types declare it as).
 */
function domModule(elements) {
  const ids = new Map();
  for (const element of elements) {
    const id = element.attributes.find((attribute) => attribute.name === 'id')?.value;
    if (id && !ids.has(id)) ids.set(id, element.tag);
  }
  return [
    "// `document` in a page's scripts (scripts/viewer.mjs): the page's own elements, by id.",
    'type Tag<K extends string> = K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement;',
    'export interface SnippetDocument extends Document {',
    ...[...ids].map(
      ([id, tag]) =>
        `  getElementById(elementId: ${JSON.stringify(id)}): Tag<${JSON.stringify(tag)}>;`,
    ),
    '  getElementById(elementId: string): HTMLElement | null;',
    '}',
    '',
  ].join('\n');
}

/**
 * Stage one plain-HTML snippet in `directory`: each module script as its own file, the elements
 * and attributes as a file of type checks on their own lines, and the errors that need no
 * compiler. Returns the staged files with their `locate`, and those errors.
 */
function stageHtml(snippet, source, directory, viewerNames) {
  const { elements, lines } = readHtml(source);
  const base = path.join(directory, path.basename(snippet.name));
  const config = `import(${JSON.stringify(specifier(directory, viewerNames))}).Config`;
  const files = [];
  const errors = [];
  const error = (where, message) =>
    errors.push({ file: snippet.file, line: where.line, column: where.column, message });

  const checks = [];
  for (const element of elements) {
    if (element.tag.includes('-')) {
      checks.push({
        ...element,
        text: `/** @type {HTMLElementTagNameMap[${JSON.stringify(element.tag)}]} */ (undefined); `,
      });
    }
    for (const attribute of element.attributes) {
      if (element.tag === 'embedpdf-viewer' && !isGlobalAttribute(attribute.name)) {
        checks.push({
          ...attribute,
          text: `/** @type {${config}[${JSON.stringify(camel(attribute.name))}]} */ (undefined); `,
        });
      }
      if (attribute.name === 'slot') {
        if (!SLOT.test(attribute.value)) {
          error(attribute, `slot="${attribute.value}" isn't one of the viewer's: ${SLOTS_SAID}`);
        } else if (element.parent !== 'embedpdf-viewer') {
          error(
            attribute,
            `slot="${attribute.value}" works on a child of <embedpdf-viewer> only, not of <${element.parent ?? 'the page'}>`,
          );
        }
      }
    }
    const src = element.tag === 'script' && element.attributes.find((a) => a.name === 'src');
    if (src) {
      if (src.value === VIEWER_CDN_URL) {
        checks.push({ ...src, text: `import ${JSON.stringify(VIEWER_CDN_URL)}; ` });
      } else if (!/^(\.{0,2}\/)(?!\/)/.test(src.value)) {
        error(
          src,
          `<script src="${src.value}">: load the viewer from ${VIEWER_CDN_URL} or a path on your own site`,
        );
      }
    }
  }
  if (checks.length) {
    const blank = lines.map(() => '');
    const staged = stagedText(
      blank,
      checks.map(({ line, column, text }) => ({ line, column: 1, text, at: { line, column } })),
    );
    files.push({ file: `${base}.markup.js`, ...staged });
  }

  const scripts = elements.filter((element) => element.body);
  if (scripts.length) {
    fs.writeFileSync(`${base}.dom.ts`, domModule(elements));
    const dom = specifier(directory, `${base}.dom`);
    const preamble = `const document = /** @type {import(${JSON.stringify(dom)}).SnippetDocument} */ (globalThis.document); `;
    scripts.forEach((script, index) => {
      const staged = stagedText(scriptLines(lines, source, script.body), [
        { line: 1, column: 1, text: preamble },
      ]);
      files.push({ file: `${base}.script-${index + 1}.js`, ...staged });
    });
  }
  return { files, errors };
}

// ── the code a page shows ───────────────────────────────────────────────────

const CODE_LANGUAGES = { js: 'js', javascript: 'js', ts: 'ts', typescript: 'ts' };

/** The top-level names a block of code declares (`const layout = …`), so the check adds none. */
const declares = (code, name) =>
  new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`).test(code);

/**
 * The top-level `{ … }` objects in a block that isn't a module: each a config, a command (it has
 * an `id`) or a layout item (a `command` or a `custom`), shown on its own. `start` and `end` are
 * offsets in the block.
 */
function objectsIn(ts, code) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code);
  const objects = [];
  const open = [];
  let start = -1;
  let first = true;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const startsLine = first || scanner.hasPrecedingLineBreak();
    first = false;
    if (token === ts.SyntaxKind.OpenBraceToken) {
      if (open.length === 0 && startsLine) start = scanner.getTokenStart();
      open.push('{');
    } else if (token === ts.SyntaxKind.OpenParenToken || token === ts.SyntaxKind.OpenBracketToken) {
      open.push('(');
    } else if (
      token === ts.SyntaxKind.CloseParenToken ||
      token === ts.SyntaxKind.CloseBracketToken
    ) {
      open.pop();
    } else if (token === ts.SyntaxKind.TemplateHead) {
      open.push('${');
    } else if (token === ts.SyntaxKind.CloseBraceToken) {
      if (open.at(-1) === '${') {
        if (scanner.reScanTemplateToken(false) === ts.SyntaxKind.TemplateTail) open.pop();
        continue;
      }
      open.pop();
      if (open.length === 0 && start >= 0) {
        objects.push({ start, end: scanner.getTokenEnd() });
        start = -1;
      }
    }
  }
  return objects.map((object) => {
    const literal = ts.createSourceFile(
      'object.js',
      `(${code.slice(object.start, object.end)})`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const expression = literal.statements[0]?.expression?.expression;
    const keys = new Set(
      expression && ts.isObjectLiteralExpression(expression)
        ? expression.properties.flatMap((property) =>
            property.name ? [property.name.getText(literal)] : [],
          )
        : [],
    );
    const type = keys.has('id')
      ? 'Command'
      : keys.has('command') || keys.has('custom')
        ? 'LayoutItem'
        : 'Config';
    return { ...object, type };
  });
}

/** Whether a block of code is a module: it imports or exports. */
function isModule(ts, file) {
  return file.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)),
  );
}

/**
 * Stage the code blocks a page shows on embedpdf.com, each as a file of its own at the page's
 * line numbers. A `js` block gets the names it uses without importing them (`viewer`, `layout`)
 * on its fence line; a config object (or a command, or a layout item) is checked as one with
 * `@satisfies`, and so is a module's `export const config`. A `ts` block is a module as written.
 */
function stagePageCode(ts, page, directory, viewerNames) {
  const files = [];
  const names = specifier(directory, viewerNames);
  for (const block of page.code) {
    const language = CODE_LANGUAGES[block.lang];
    if (!language || !block.local) continue;
    const code = block.lines.join('\n');
    const lines = [...Array(block.line - 1).fill(''), ...block.lines];
    const insertions = [];
    const position = (offset) => {
      const before = code.slice(0, offset).split('\n');
      return { line: block.line + before.length - 1, column: before.at(-1).length + 1 };
    };
    const satisfies = (offset, type, text = '') => {
      const at = position(offset);
      insertions.push({
        ...at,
        text: `/** @satisfies {import(${JSON.stringify(names)}).${type}} */ ${text}`,
        at,
      });
    };
    if (language === 'js') {
      const free = FREE_NAMES.filter((name) => !declares(code, name));
      if (free.length) {
        insertions.push({
          line: block.line - 1,
          column: 1,
          text: `import { ${free.join(', ')} } from ${JSON.stringify(names)}; `,
        });
      }
      const file = ts.createSourceFile(
        'block.js',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      if (isModule(ts, file)) {
        for (const statement of file.statements) {
          const [declaration] = ts.isVariableStatement(statement)
            ? statement.declarationList.declarations
            : [];
          if (
            declaration?.name.getText(file) === 'config' &&
            declaration.initializer &&
            ts.isObjectLiteralExpression(declaration.initializer)
          ) {
            satisfies(statement.getStart(file), 'Config');
          }
        }
      } else {
        for (const object of objectsIn(ts, code)) {
          satisfies(object.start, object.type, '(');
          insertions.push({ ...position(object.end), text: ');', at: position(object.end - 1) });
        }
      }
    }
    const staged = stagedText(lines, insertions);
    const where = page.source.replace(/\.mdx$/, '');
    files.push({
      file: path.join(directory, `${path.basename(where)}.${block.line}.${language}`),
      ...staged,
    });
  }
  return files;
}

// ── staging ─────────────────────────────────────────────────────────────────

/** Diagnostics a page's code may have: a name it uses but doesn't show is the reader's own. */
const READERS_NAMES = new Set([
  2304, // Cannot find name 'approve'.
  2552, // Cannot find name 'save'. Did you mean 'Save'?
]);

/**
 * Stage the viewer's plain-HTML snippets (files under `snippetsRoot`) and the code its pages show
 * in `root`: the files to compile, where each came from (a snippet's file, or a page's
 * `viewer/….mdx`), how its lines map back, which diagnostics the check drops, and the `markup`
 * errors no compiler reports. The caller writes the helpers and the tsconfig.
 */
export function stageVanilla(
  snippets,
  pages,
  root,
  snippetsRoot = path.join(contentRoot, 'snippets'),
) {
  const ts = siteRequire('typescript');
  const viewerNames = path.join(root, '_viewer');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(`${viewerNames}.ts`, VIEWER_NAMES);

  const origins = new Map();
  const locate = new Map();
  const markup = new Map();
  const write = (origin, { file, text, locate: locateIn }) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    origins.set(file, origin);
    locate.set(file, locateIn);
  };

  for (const snippet of snippets.filter((s) => s.framework === 'vanilla')) {
    if (!snippet.file.endsWith('.html')) continue;
    const source = fs.readFileSync(path.join(snippetsRoot, snippet.file), 'utf8');
    const directory = path.join(root, path.dirname(snippet.name));
    fs.mkdirSync(directory, { recursive: true });
    const { files, errors } = stageHtml(snippet, source, directory, viewerNames);
    for (const file of files) write(snippet.file, file);
    if (errors.length) markup.set(snippet.file, errors);
  }
  for (const page of pages.values()) {
    const directory = path.join(root, '_pages', path.dirname(page.source));
    for (const file of stagePageCode(ts, page, directory, viewerNames)) write(page.source, file);
  }

  const ignores = (origin, { code }) => origin.endsWith('.mdx') && READERS_NAMES.has(code);
  return { root, origins, locate, ignores, markup };
}

/** The errors no compiler reports (`stageVanilla`'s `markup`), once the compiler could check. */
export function addMarkupErrors(result, markup) {
  if (!result.tool) return;
  for (const [file, errors] of markup) {
    result.bySnippet.set(file, [...(result.bySnippet.get(file) ?? []), ...errors]);
  }
}

// ── install commands ────────────────────────────────────────────────────────

/** The packages an install command names: `npm install`, `pnpm add`, `yarn add`, `bun add`. */
function installedPackages(source) {
  const packages = [];
  const commands =
    /\b(?:npm\s+(?:install|i|add)|pnpm\s+(?:add|install|i)|yarn\s+add|bun\s+add)\s+([^\n&|;]+)/g;
  for (const [, args] of source.matchAll(commands)) {
    for (const arg of args.trim().split(/\s+/)) {
      if (!arg.startsWith('-')) packages.push(arg.replace(/^(@?[^@]+)@.*$/, '$1'));
    }
  }
  return packages;
}

/** This repository's packages, by name: whether each is published. */
function workspacePackages() {
  const listed = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*package.json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  const packages = new Map();
  for (const file of listed.stdout.split('\n').filter(Boolean)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
      if (manifest.name) packages.set(manifest.name, { published: manifest.private !== true });
    } catch {
      // A manifest that doesn't parse names nothing.
    }
  }
  return packages;
}

/**
 * Each install command's errors, added to its framework's result: an `@embedpdf/` or
 * `@cloudpdf/` package it names that this repository doesn't publish.
 */
export function addInstallErrors(snippets, results) {
  const installs = snippets.filter((s) => s.file.endsWith('.sh'));
  if (installs.length === 0) return;
  const packages = workspacePackages();
  for (const snippet of installs) {
    const result = results[snippet.framework];
    if (!result?.tool) continue;
    const source = fs.readFileSync(path.join(contentRoot, 'snippets', snippet.file), 'utf8');
    const errors = installedPackages(source)
      .filter((name) => /^@(embedpdf|cloudpdf)\//.test(name) && !packages.get(name)?.published)
      .map((name) => ({
        file: snippet.file,
        line: 1,
        column: 1,
        message: packages.has(name)
          ? `${name} is private: it isn't published`
          : `${name} isn't a package in this repository`,
      }));
    if (errors.length)
      result.bySnippet.set(snippet.file, [
        ...(result.bySnippet.get(snippet.file) ?? []),
        ...errors,
      ]);
  }
}

// ── a page's status ─────────────────────────────────────────────────────────

/** Whether `samples/` has a version of an example for a framework (`<name>.<framework>.*`). */
function hasExample(name, framework) {
  const directory = path.join(contentRoot, 'samples', path.dirname(name));
  const prefix = `${path.basename(name)}.${framework}`;
  if (!fs.existsSync(directory)) return false;
  return fs
    .readdirSync(directory)
    .some((entry) => entry === prefix || entry.startsWith(`${prefix}.`));
}

/** The examples a page shows for a framework that `samples/` has no version of. */
export function exampleErrors(names, framework) {
  return [...names]
    .sort()
    .filter((name) => !hasExample(name, framework))
    .map((name) => ({ example: name, message: `no ${FRAMEWORK_LABELS[framework]} example` }));
}

/**
 * The errors of the code a page shows, for one framework: those in its blocks for that framework,
 * or why the code isn't checked.
 */
export function pageCodeErrors(page, framework, result) {
  const blocks = page.code.filter(
    (block) => CODE_LANGUAGES[block.lang] && block.local && block.integrations.includes(framework),
  );
  if (blocks.length === 0) return [];
  if (!result.tool)
    return [{ file: page.source, message: `its code isn't checked: ${result.reason}` }];
  const blockAt = (line) =>
    blocks.find((block) => line >= block.line && line < block.line + block.lines.length);
  return (result.bySnippet.get(page.source) ?? []).filter((error) => blockAt(error.line));
}
