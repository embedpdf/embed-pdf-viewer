import convertPackageManager from 'npm-to-yarn';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';

import type { DocsEngine } from './axis';

// eslint-disable-next-line import/no-unresolved — sibling plain-ESM module, typed by its .d.mts
import {
  FRAMEWORK_LABELS,
  FRAMEWORK_WORDS,
  FRAMEWORKS,
  frameworkCode,
  frameworkHref,
  frameworkName,
  inlineCodeContexts,
  stateIntroParts,
  type Framework,
  type NameSpot,
} from '../mdx/frameworks.mjs';
// eslint-disable-next-line import/no-unresolved — sibling plain-ESM module, typed by its .d.mts
import { applyInstallChannel } from '../mdx/install-channel.mjs';

/**
 * The Markdown projection: resolves raw MDX down to the plain Markdown one
 * concrete page actually shows — `<Engine>` and `<Fw>` branches taken,
 * examples inlined from real sample files, callouts and cards flattened,
 * links absolutised. The public `.md` export and the search corpus both
 * build on this single pass, so neither can claim something the page does
 * not say.
 *
 * In the `.md` export every link is a full URL, the ones written from the
 * page (`setup`, `../text/search`) included, and a link to a docs page names
 * that page's `.md`: the Markdown is read away from its page, by agents that
 * follow its links.
 *
 * A package README ({@link renderDocsReadmeWith}) is the same pass over the
 * part of a page its package's npm page shows.
 *
 * Site-specific behaviour (sample resolution, integration routing, origin)
 * arrives through {@link DocsMarkdownSite}; unknown components stay
 * deliberately fatal so an unprojected page fails the build, never ships
 * incomplete Markdown.
 */
export type AstNode = {
  type: string;
  name?: string | null;
  value?: unknown;
  attributes?: MdxAttribute[];
  children?: AstNode[];
  url?: string;
  lang?: string | null;
  meta?: string | null;
  [key: string]: unknown;
};

type MdxAttribute = {
  type: string;
  name?: string;
  value?: unknown;
};

export type DocsCodeFile = {
  filename: string;
  code: string;
  language: string;
};

export interface DocsMarkdownSite {
  /** e.g. 'https://www.embedpdf.com' — used to absolutise relative links. */
  siteOrigin: string;
  /** The site's engine binding; `<Engine>` blocks resolve against it. */
  engine: DocsEngine;
  /** Resolve `<Example name>` for a variant; null/[] renders an honest gap note. */
  resolveExampleFiles: (
    name: string,
    integration: string | undefined,
  ) => DocsCodeFile[] | null | undefined;
  /** Read a `<CodeExample codePath>` file; null is fatal upstream. */
  readCodeFile: (codePath: string) => DocsCodeFile | null;
  /** Validate an `<Fw only>` value (framework key). */
  isFramework: (value: string) => boolean;
  /** Human label for a variant (frontmatter + gap notes). */
  variantLabel?: (integration: string) => string;
  /**
   * Rewrite a site path for a variant (fan-out routing): a link's before it is absolutised, and
   * the page's own for the URL of a sibling.
   */
  resolveContentHref?: (url: string, integration: string | undefined) => string;
  /**
   * Site-specific component projections (an API reference, most of all),
   * consulted after the built-ins and before the fatal unknown-component
   * throw. Return mdast nodes to project, or null/undefined to fall through.
   * `absoluteContentUrl` gives a target as the page's own links have it: a full
   * URL, and in the `.md` export a docs page's Markdown (a file keeps its URL).
   */
  projectComponent?: (
    node: AstNode,
    helpers: {
      resolveNodes: (nodes: AstNode[]) => AstNode[];
      absoluteContentUrl: (url: string) => string;
      stringAttribute: (node: AstNode, name: string) => string;
    },
  ) => AstNode[] | null | undefined;
}

type MarkdownMetadata = {
  title?: unknown;
  description?: unknown;
};

export type RenderDocsMarkdownOptions = {
  sourceCode: string;
  canonicalPath: string;
  integration?: string;
  metadata?: MarkdownMetadata;
  /** Frontmatter key for the variant line ('framework' | 'integration'). */
  variantKey?: string;
  /**
   * The page's other variants the site shows (`vue`, `svelte`). The frontmatter names each with
   * the URL of its own Markdown (`other_frameworks`), so a reader working in one can switch.
   */
  siblings?: string[];
};

/** How a resolved tree's links read. */
type LinkTargets = {
  /** The page's URL path. A link written from the page (`setup`, `../text/search`) is read from it. */
  canonicalPath?: string;
  /** A link to a docs page names the page's Markdown (`….md`), so its reader stays in Markdown. */
  markdown?: boolean;
};

/** The docs sites: a link from one to the other's docs is a docs link too. */
const DOCS_ORIGINS = ['https://www.embedpdf.com', 'https://www.cloudpdf.com'];

/** A link written from the page: not a full URL, a site path (`/docs/…`) or a place on the page. */
const PAGE_RELATIVE = /^(?![a-z][a-z0-9+.-]*:|[/#?])./i;

/** `../text/search#options` from `/docs/headless/react/viewing/stage`, as a site path. */
function pathFromPage(url: string, canonicalPath: string): string {
  const resolved = new URL(url, `https://page.invalid${canonicalPath}`);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/** A docs page's URL as its Markdown's: `…/viewing/stage#zoom` → `…/viewing/stage.md#zoom`. */
function markdownPageUrl(url: string, siteOrigin: string): string {
  const origin = [siteOrigin, ...DOCS_ORIGINS].find((docs) => url.startsWith(`${docs}/`));
  if (!origin) return url;
  // The path ends where the query or the fragment starts, less any slashes it ends on.
  const marks = [url.indexOf('?'), url.indexOf('#')].filter((at) => at !== -1);
  let end = marks.length > 0 ? Math.min(...marks) : url.length;
  const rest = url.slice(end);
  while (url[end - 1] === '/') end -= 1;
  const page = url.slice(origin.length, end);
  if (page !== '/docs' && !page.startsWith('/docs/')) return url;
  // A file a site serves under `/docs` (a screenshot), or a link that names the Markdown already.
  if (page.slice(page.lastIndexOf('/') + 1).includes('.')) return url;
  return `${origin}${page}.md${rest}`;
}

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    fences: true,
    listItemIndent: 'one',
  });

function getAttribute(node: AstNode, name: string) {
  return node.attributes?.find(
    (attribute) => attribute.type === 'mdxJsxAttribute' && attribute.name === name,
  );
}

function expressionStrings(attribute: MdxAttribute | undefined): string[] {
  if (!attribute) return [];
  if (typeof attribute.value === 'string') return [attribute.value];

  const value = attribute.value as
    | { data?: { estree?: { body?: Array<{ expression?: AstNode }> } } }
    | undefined;
  const expression = value?.data?.estree?.body?.[0]?.expression;
  if (!expression) return [];

  if (expression.type === 'Literal' && typeof expression.value === 'string') {
    return [expression.value];
  }

  if (expression.type === 'ArrayExpression' && Array.isArray(expression.elements)) {
    return (expression.elements as AstNode[]).flatMap((element) =>
      element?.type === 'Literal' && typeof element.value === 'string' ? [element.value] : [],
    );
  }

  return [];
}

function stringAttribute(node: AstNode, name: string) {
  const values = expressionStrings(getAttribute(node, name));
  if (values.length !== 1) {
    throw new Error(`<${node.name}> requires a static \`${name}\` string.`);
  }
  return values[0];
}

function codePathsAttribute(node: AstNode) {
  const single = expressionStrings(getAttribute(node, 'codePath'));
  if (single.length > 0) return single;
  return expressionStrings(getAttribute(node, 'codePaths'));
}

/** `<Engine local>` / `<Engine only="cloud">` — same grammar as the remark plugin. */
function engineFlavors(node: AstNode): DocsEngine[] {
  const flavors: DocsEngine[] = [];
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== 'mdxJsxAttribute') continue;
    if ((attribute.name === 'local' || attribute.name === 'cloud') && attribute.value === null) {
      flavors.push(attribute.name);
    }
    if (attribute.name === 'only' && typeof attribute.value === 'string') {
      for (const flavor of attribute.value.split(/[\s,]+/)) {
        if (flavor === 'local' || flavor === 'cloud') flavors.push(flavor);
      }
    }
  }
  if (flavors.length === 0) throw new Error('<Engine> needs a flavor (local/cloud/only="…").');
  return flavors;
}

/** A file that is a command to run (`install.sh`), not a file to make. */
const isCommand = (file: DocsCodeFile) =>
  ['sh', 'bash', 'shell', 'shellscript'].includes(file.language);

/** Each file under its name. A README shows a command without one: there it is only run. */
function fileNodes(files: DocsCodeFile[], readme = false): AstNode[] {
  return files.flatMap((file) => [
    ...(readme && isCommand(file)
      ? []
      : [
          {
            type: 'paragraph',
            children: [
              { type: 'strong', children: [{ type: 'inlineCode', value: file.filename }] },
            ],
          },
        ]),
    { type: 'code', lang: file.language, value: file.code.trimEnd() },
  ]);
}

function collectText(node: AstNode): string {
  if (typeof node.value === 'string' && (node.type === 'text' || node.type === 'inlineCode')) {
    return node.value;
  }
  return (node.children ?? []).map(collectText).join('');
}

function noteNode(text: string): AstNode {
  return {
    type: 'blockquote',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
  };
}

/** The hint under a live example (`> **Try it:** …`): what to do in the demo the page runs. */
function isDemoHint(node: AstNode) {
  if (node.type !== 'blockquote') return false;
  const lead = node.children?.[0]?.children?.[0];
  return lead?.type === 'strong' && collectText(lead).startsWith('Try it');
}

/**
 * The framework a headless page's names are shown for (`useSearch()` → `inject(EpdfSearch)`),
 * or null when names stay as written.
 */
type FrameworkNames = { framework: Framework; contexts: Map<unknown, NameSpot> } | null;

function createResolver(
  site: DocsMarkdownSite,
  integration: string | undefined,
  names: FrameworkNames = null,
  links: LinkTargets = {},
  /** The nodes are a package README's: {@link renderDocsReadmeWith} says what that changes. */
  readme = false,
) {
  const framework =
    integration && (FRAMEWORKS as readonly string[]).includes(integration)
      ? (integration as Framework)
      : null;

  function absoluteContentUrl(url: string) {
    // Markdown leaves its page (a copy, a paste, a README), so no link may depend on the page's URL.
    if (links.canonicalPath && PAGE_RELATIVE.test(url)) {
      url = pathFromPage(url, links.canonicalPath);
    }
    // A README holds part of the page, so a link to a place on the page names the page.
    if (readme && links.canonicalPath && url.startsWith('#')) url = `${links.canonicalPath}${url}`;
    // Every docs link keeps the reader's framework, cross-site ones too.
    if (framework) url = frameworkHref(url, framework);
    if (!url.startsWith('/')) return url;
    const resolved = site.resolveContentHref?.(url, integration) ?? url;
    return `${site.siteOrigin}${resolved}`;
  }

  /** Where a link goes. An image keeps `absoluteContentUrl`: it has no Markdown of its own. */
  function linkUrl(url: string) {
    const absolute = absoluteContentUrl(url);
    return links.markdown ? markdownPageUrl(absolute, site.siteOrigin) : absolute;
  }

  function resolveNodes(nodes: AstNode[]): AstNode[] {
    return nodes.flatMap((originalNode) => {
      const node = { ...originalNode };

      if (node.type === 'yaml' || node.type === 'mdxjsEsm') return [];
      if (readme && isDemoHint(node)) return [];

      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        if (node.name === 'Engine') {
          return engineFlavors(node).includes(site.engine) ? resolveNodes(node.children ?? []) : [];
        }

        if (node.name === 'Fw') {
          if (!integration) {
            throw new Error('<Fw> can only be exported from a variant-specific route.');
          }
          const values = expressionStrings(getAttribute(node, 'only'));
          if (values.length === 0 || values.some((value) => !site.isFramework(value))) {
            throw new Error('<Fw> requires a static `only` framework or framework array.');
          }
          return values.includes(integration) ? resolveNodes(node.children ?? []) : [];
        }

        if (node.name === 'Example') {
          // A README shows the code a page keeps open; any other example is a demo to try there.
          if (readme && expressionStrings(getAttribute(node, 'mode'))[0] !== 'open') return [];
          if (!integration) {
            throw new Error('<Example> can only be exported from a variant-specific route.');
          }
          const name = stringAttribute(node, 'name');
          const files = site.resolveExampleFiles(name, integration);
          const label = site.variantLabel?.(integration) ?? integration;
          return files?.length
            ? fileNodes(files, readme)
            : [noteNode(`This example is not available for ${label} yet.`)];
        }

        if (node.name === 'Snippet') {
          if (!integration) {
            throw new Error('<Snippet> can only be exported from a variant-specific route.');
          }
          const name = stringAttribute(node, 'name');
          const files = site.resolveExampleFiles(`snippets/${name}`, integration);
          const label = site.variantLabel?.(integration) ?? integration;
          return files?.length
            ? fileNodes(files, readme)
            : [noteNode(`This code isn't written for ${label} yet.`)];
        }

        if (node.name === 'Framework') {
          return [{ type: 'text', value: FRAMEWORK_LABELS[framework ?? 'react'] }];
        }

        if (node.name === 'Word') {
          const word = stringAttribute(node, 'of') as keyof typeof FRAMEWORK_WORDS;
          if (!FRAMEWORK_WORDS[word]) throw new Error(`<Word of="${word}"> is not a known word.`);
          return [{ type: 'text', value: FRAMEWORK_WORDS[word][framework ?? 'react'] }];
        }

        if (node.name === 'StateIntro') {
          const parts = stateIntroParts(stringAttribute(node, 'hook'), framework ?? 'react');
          return [
            {
              type: 'paragraph',
              children: parts.map((part) =>
                part.code
                  ? { type: 'inlineCode', value: part.text }
                  : { type: 'text', value: part.text },
              ),
            },
          ];
        }

        if (node.name === 'CodeExample') {
          const paths = codePathsAttribute(node);
          if (paths.length === 0) {
            throw new Error('<CodeExample> requires a static `codePath` or `codePaths`.');
          }
          const files = paths
            .map((codePath) => site.readCodeFile(codePath))
            .filter((file): file is DocsCodeFile => file !== null);
          if (files.length !== paths.length) {
            throw new Error('<CodeExample> references a source file that could not be read.');
          }
          return fileNodes(files, readme);
        }

        if (node.name === 'Tabs') {
          // Projection: the tabs one after another, each under its label (`items`).
          const labels = expressionStrings(getAttribute(node, 'items'));
          const panels = (node.children ?? []).filter((child) => child.name === 'Tabs.Tab');
          return panels.flatMap((panel, index) => [
            {
              type: 'paragraph',
              children: [
                { type: 'strong', children: [{ type: 'text', value: labels[index] ?? '' }] },
              ],
            },
            ...resolveNodes(panel.children ?? []),
          ]);
        }

        if (node.name === 'Callout') {
          // Projection: a callout is a blockquote in Markdown.
          return [{ type: 'blockquote', children: resolveNodes(node.children ?? []) }];
        }

        if (node.name === 'Cards' || node.name === 'CardGrid') {
          // Projection: either card container is a list of links. Tile vs row
          // is a visual distinction with no Markdown counterpart.
          return [
            {
              type: 'list',
              ordered: false,
              spread: false,
              children: resolveNodes(node.children ?? []),
            },
          ];
        }

        if (node.name === 'Card' || node.name === 'GridCard') {
          const title = stringAttribute(node, 'title');
          const href = stringAttribute(node, 'href');
          const description = expressionStrings(getAttribute(node, 'description'))[0];
          return [
            {
              type: 'listItem',
              spread: false,
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'link',
                      url: linkUrl(href),
                      children: [{ type: 'text', value: title }],
                    },
                    ...(description
                      ? [{ type: 'text', value: `${readme ? ': ' : ' — '}${description}` }]
                      : []),
                  ],
                },
              ],
            },
          ];
        }

        if (node.name === 'ThemeTokens') {
          // Projection: the token table the list is drawn from, one row per token.
          const cell = (children: AstNode[]): AstNode => ({ type: 'tableCell', children });
          const row = (cells: AstNode[][]): AstNode => ({
            type: 'tableRow',
            children: cells.map(cell),
          });
          const words = (text: string): AstNode[] =>
            text
              .split(/(`[^`]+`)/)
              .filter(Boolean)
              .map((part) =>
                part.startsWith('`')
                  ? { type: 'inlineCode', value: part.slice(1, -1) }
                  : { type: 'text', value: part },
              );
          const tokens = (node.children ?? []).filter((child) => child.name === 'ThemeToken');
          const rows = tokens.map((token) => {
            const attribute = (name: string) => expressionStrings(getAttribute(token, name))[0];
            const value = attribute('value');
            const inWords = attribute('default');
            const shown = (css: string | undefined): AstNode[] =>
              css !== undefined
                ? [{ type: 'inlineCode', value: css }]
                : value !== undefined
                  ? [{ type: 'inlineCode', value }]
                  : words(inWords ?? '');
            // A table cell is one line: a description wrapped in the source joins up.
            const oneLine = (child: AstNode): AstNode =>
              child.type === 'text' && typeof child.value === 'string'
                ? { ...child, value: child.value.replace(/\s*\n\s*/g, ' ') }
                : { ...child, children: child.children?.map(oneLine) };
            const description = resolveNodes(token.children ?? [])
              .flatMap((child) => (child.type === 'paragraph' ? (child.children ?? []) : [child]))
              .map(oneLine);
            return row([
              [{ type: 'inlineCode', value: stringAttribute(token, 'name') }],
              description,
              shown(attribute('light')),
              shown(attribute('dark')),
            ]);
          });
          const heading = ['Token', 'What it colors', 'Light', 'Dark'].map((text) => [
            { type: 'text', value: text },
          ]);
          return [
            {
              type: 'table',
              align: ['left', 'left', 'left', 'left'],
              children: [row(heading), ...rows],
            },
          ];
        }

        // Site-specific projections (API reference components et al).
        const projected = site.projectComponent?.(node, {
          resolveNodes,
          absoluteContentUrl: linkUrl,
          stringAttribute,
        });
        if (projected) return projected;

        // Raw HTML in MDX (lowercase tags): project the common inline
        // elements to their Markdown forms and unwrap anything else —
        // only CAPITALISED components without a projection stay fatal.
        const tag = node.name ?? '';
        if (tag && tag[0] === tag[0].toLowerCase()) {
          if (tag === 'code') return [{ type: 'inlineCode', value: collectText(node) }];
          if (tag === 'a') {
            const href = expressionStrings(getAttribute(node, 'href'))[0] ?? '';
            return [
              {
                type: 'link',
                url: linkUrl(href),
                children: resolveNodes(node.children ?? []),
              },
            ];
          }
          if (tag === 'strong' || tag === 'b') {
            return [{ type: 'strong', children: resolveNodes(node.children ?? []) }];
          }
          if (tag === 'em' || tag === 'i') {
            return [{ type: 'emphasis', children: resolveNodes(node.children ?? []) }];
          }
          if (tag === 'br') return [{ type: 'break' }];
          return resolveNodes(node.children ?? []);
        }

        throw new Error(`No Markdown projection is defined for <${node.name ?? 'Fragment'}>.`);
      }

      if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
        // MDX comments ({/* … */} — including the sync generator's marker)
        // are invisible on the page, so they are invisible here too.
        const value = typeof node.value === 'string' ? node.value.trim() : '';
        if (/^\/\*[\s\S]*\*\/$/.test(value)) return [];
        throw new Error('Arbitrary MDX expressions require an explicit Markdown projection.');
      }

      if (node.type === 'code' && typeof node.value === 'string') {
        // A framework-free block as this framework reads it (`withAnnotation()` on Angular).
        if (names) node.value = frameworkCode(node.value as string, names.framework);
        const metadata = node.meta?.split(/\s+/).filter(Boolean) ?? [];
        if (metadata.includes('npm2yarn')) {
          // A README keeps the command as the page's author wrote it, for npm.
          if (!readme) node.value = convertPackageManager(node.value as string, 'pnpm');
          const remaining = metadata.filter((item) => item !== 'npm2yarn');
          node.meta = remaining.length > 0 ? remaining.join(' ') : null;
        }
      }

      if (node.type === 'link' && node.url) node.url = linkUrl(node.url);
      if (node.type === 'image' && node.url) node.url = absoluteContentUrl(node.url);

      if (node.type === 'inlineCode' && names && typeof node.value === 'string') {
        const spot = names.contexts.get(originalNode);
        node.value = frameworkName(node.value, names.framework, spot?.context, spot?.owner);
      }

      if (node.children) node.children = resolveNodes(node.children);
      return [node];
    });
  }

  return resolveNodes;
}

function yamlValue(value: string) {
  return JSON.stringify(value);
}

/** Stamp the release channel on every fenced block, matching the pages. */
function applyInstallChannelToTree(node: AstNode): void {
  if (node.type === 'code' && typeof node.value === 'string') {
    node.value = applyInstallChannel(node.value);
  }
  for (const child of node.children ?? []) applyInstallChannelToTree(child);
}

/** Headless pages show each framework's names; other pages keep them as written. */
function frameworkNamesOf(
  tree: AstNode,
  integration: string | undefined,
  canonicalPath: string | undefined,
): FrameworkNames {
  const headless = canonicalPath ? canonicalPath.includes('/docs/headless/') : true;
  return headless && integration && (FRAMEWORKS as readonly string[]).includes(integration)
    ? { framework: integration as Framework, contexts: inlineCodeContexts(tree) }
    : null;
}

/** Resolve raw MDX to the plain Markdown AST one concrete route shows. */
export function resolveDocsTreeWith(
  site: DocsMarkdownSite,
  {
    sourceCode,
    integration,
    canonicalPath,
    markdownLinks,
  }: Pick<RenderDocsMarkdownOptions, 'sourceCode' | 'integration'> & {
    canonicalPath?: string;
    /** Links to docs pages name each page's Markdown, as the `.md` export's do. */
    markdownLinks?: boolean;
  },
) {
  const tree = markdownProcessor.parse(sourceCode) as AstNode;
  const names = frameworkNamesOf(tree, integration, canonicalPath);
  const links: LinkTargets = { canonicalPath, markdown: markdownLinks };
  tree.children = createResolver(site, integration, names, links)(tree.children ?? []);
  applyInstallChannelToTree(tree);
  return tree;
}

/** Serialise a resolved tree back to Markdown. */
export function stringifyDocsTree(tree: AstNode) {
  return markdownProcessor.stringify(tree as never).trimStart();
}

/** Produce plain, route-specific Markdown from raw MDX source. */
export function renderDocsMarkdownWith(
  site: DocsMarkdownSite,
  {
    sourceCode,
    canonicalPath,
    integration,
    metadata,
    variantKey = 'integration',
    siblings = [],
  }: RenderDocsMarkdownOptions,
) {
  const tree = resolveDocsTreeWith(site, {
    sourceCode,
    integration,
    canonicalPath,
    markdownLinks: true,
  });
  const body = stringifyDocsTree(tree);

  const labelOf = (variant: string) => site.variantLabel?.(variant) ?? variant;
  const baseTitle = typeof metadata?.title === 'string' ? metadata.title : undefined;
  const label = integration ? labelOf(integration) : undefined;
  const title = baseTitle && label ? `${baseTitle} — ${label}` : baseTitle;
  const description = typeof metadata?.description === 'string' ? metadata.description : undefined;
  // The same page for each other variant, by the URL of its Markdown.
  const others = siblings.map((sibling) => {
    const route = site.resolveContentHref?.(canonicalPath, sibling) ?? canonicalPath;
    return `  ${yamlValue(labelOf(sibling))}: ${yamlValue(`${site.siteOrigin}${route}.md`)}`;
  });

  const frontmatter = [
    '---',
    ...(title ? [`title: ${yamlValue(title)}`] : []),
    ...(description ? [`description: ${yamlValue(description)}`] : []),
    ...(integration && label ? [`${variantKey}: ${yamlValue(label)}`] : []),
    ...(others.length > 0 ? [`other_${variantKey}s:`, ...others] : []),
    `source: ${yamlValue(`${site.siteOrigin}${canonicalPath}`)}`,
    '---',
    '',
    '',
  ].join('\n');

  return `${frontmatter}${body}`;
}

// ── a package README ────────────────────────────────────────────────────────

// Where a README's cut ends: an MDX comment that reads `readme: end`, on a line of its own at the
// top level of the page.
const README_END = /^\/\*\s*readme:\s*end\s*\*\/$/;

/** The section whose cards a README lists as where to go next. */
const NEXT_STEPS = 'Next steps';

const isReadmeEnd = (node: AstNode) =>
  (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') &&
  typeof node.value === 'string' &&
  README_END.test(node.value.trim());

const holdsReadmeEnd = (node: AstNode): boolean =>
  (node.children ?? []).some((child) => isReadmeEnd(child) || holdsReadmeEnd(child));

const isSectionHeading = (node: AstNode) => node.type === 'heading' && node.depth === 2;

const isCards = (node: AstNode) =>
  node.type === 'mdxJsxFlowElement' && (node.name === 'Cards' || node.name === 'CardGrid');

/**
 * The `##` section whose heading reads `heading`: the heading, then what is under it. Null when
 * the page has no such section.
 */
function sectionNodes(children: AstNode[], heading: string): AstNode[] | null {
  const at = children.findIndex(
    (node) => isSectionHeading(node) && collectText(node).trim() === heading,
  );
  if (at === -1) return null;
  const end = children.findIndex((node, index) => index > at && isSectionHeading(node));
  return children.slice(at, end === -1 ? undefined : end);
}

/**
 * The part of a page a README shows, as the page's own nodes: the opening, which is everything
 * under the title up to the first `##`; everything up to the end marker, on a page that has one;
 * or the named section, up to the marker when it stands inside, with its heading when asked for.
 */
function readmeCut(
  children: AstNode[],
  section: string | undefined,
  withHeading: boolean,
): AstNode[] {
  if (children.filter(isReadmeEnd).length > 1 || children.some(holdsReadmeEnd)) {
    throw new Error('`{/* readme: end */}` stands once, at the top level of its page.');
  }
  if (section !== undefined) {
    const nodes = sectionNodes(children, section);
    if (!nodes) throw new Error(`The page has no section "${section}".`);
    const end = nodes.findIndex(isReadmeEnd);
    return nodes.slice(withHeading ? 0 : 1, end === -1 ? undefined : end);
  }
  const title = children.findIndex((node) => node.type === 'heading' && node.depth === 1);
  const body = children.slice(title + 1);
  const end = body.findIndex(body.some(isReadmeEnd) ? isReadmeEnd : isSectionHeading);
  const opening = end === -1 ? body : body.slice(0, end);
  return withHeading && title !== -1 ? [children[title], ...opening] : opening;
}

/** A README gives the page's title its second level, so the page's headings go one down. */
function lowerHeadings(node: AstNode): void {
  if (node.type === 'heading') node.depth = Math.min((node.depth as number) + 1, 6);
  for (const child of node.children ?? []) lowerHeadings(child);
}

const stringifyNodes = (children: AstNode[]) =>
  stringifyDocsTree({ type: 'root', children }).trimEnd();

/** A page's frontmatter, as its fields that are text. */
function frontmatterText(children: AstNode[]): Record<string, string> {
  const yaml = children.find((node) => node.type === 'yaml');
  const fields: unknown = typeof yaml?.value === 'string' ? parseYaml(yaml.value) : null;
  if (!fields || typeof fields !== 'object') return {};
  return Object.fromEntries(
    Object.entries(fields).filter(
      (field): field is [string, string] => typeof field[1] === 'string',
    ),
  );
}

export type DocsReadmeOptions = {
  sourceCode: string;
  /** The page's URL path for the README's variant: `/docs/headless/react/quick-start`. */
  canonicalPath: string;
  integration?: string;
  /** The `##` section the README shows, by its heading. Without one, the page's opening. */
  section?: string;
  /**
   * The cut comes with its heading, as a `##`: a section's own, at the levels the page has, or
   * the page's title over its opening. For a README that shows the cut as a section of its own,
   * beside another page's, and not under this page's title.
   */
  withHeading?: boolean;
};

export type DocsReadmeParts = {
  /** The page's `title` and `description`, from its frontmatter; null for one it doesn't give. */
  title: string | null;
  description: string | null;
  /** The cut as Markdown, its headings one level below the page's unless it has its own. */
  cut: string;
  /** The cards of the page's "Next steps" section as a list of links, or '' when it has none. */
  nextSteps: string;
};

/**
 * The parts of a page a package README is made of
 * (docs/conventions/docs-architecture.md, "Package READMEs"). They are read on npm and GitHub, so
 * they differ from the page's `.md` export in six ways, none of which adds a word:
 *
 * - an example the page keeps open (`mode="open"`) shows its code, and any other example, with
 *   its "Try it" hint, is left out: a README runs no demo;
 * - an install command stays as written, with no package manager or release channel put in;
 * - every link is the full URL of a page, a link to a place on this page (`#zoom`) included;
 * - a card is its linked title, a colon and its description;
 * - a command (`install.sh`) shows without a file name: it is something to run;
 * - the cut's headings are one level down, for a README that gives the page's title its own
 *   (a section that comes with its heading keeps its levels).
 *
 * An unknown component in the cut is fatal, as in the export; outside the cut it is never read.
 */
export function renderDocsReadmeWith(
  site: DocsMarkdownSite,
  { sourceCode, canonicalPath, integration, section, withHeading = false }: DocsReadmeOptions,
): DocsReadmeParts {
  const tree = markdownProcessor.parse(sourceCode) as AstNode;
  const children = tree.children ?? [];
  // A name's framework form depends on where it stands on the whole page, so read that first.
  const names = frameworkNamesOf(tree, integration, canonicalPath);
  const resolve = createResolver(site, integration, names, { canonicalPath }, true);

  const cut = resolve(readmeCut(children, section, withHeading));
  // A section that comes with its heading is at a README's levels already.
  if (!(withHeading && section !== undefined)) cut.forEach(lowerHeadings);
  const cards = (sectionNodes(children, NEXT_STEPS) ?? []).filter(isCards);
  const { title = null, description = null } = frontmatterText(children);
  return {
    title,
    description,
    cut: stringifyNodes(cut),
    nextSteps: stringifyNodes(resolve(cards)),
  };
}
