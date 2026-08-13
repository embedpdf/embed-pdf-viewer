import convertPackageManager from 'npm-to-yarn';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import type { DocsEngine } from './axis';

/**
 * The Markdown projection: resolves raw MDX down to the plain Markdown one
 * concrete page actually shows — `<Engine>` and `<Fw>` branches taken,
 * examples inlined from real sample files, callouts and cards flattened,
 * links absolutised. The public `.md` export and the search corpus both
 * build on this single pass, so neither can claim something the page does
 * not say.
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
  /** Rewrite a relative content link before absolutising (fan-out routing). */
  resolveContentHref?: (url: string, integration: string | undefined) => string;
  /**
   * Site-specific component projections (an API reference, most of all),
   * consulted after the built-ins and before the fatal unknown-component
   * throw. Return mdast nodes to project, or null/undefined to fall through.
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
};

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

function fileNodes(files: DocsCodeFile[]): AstNode[] {
  return files.flatMap((file) => [
    {
      type: 'paragraph',
      children: [{ type: 'strong', children: [{ type: 'inlineCode', value: file.filename }] }],
    },
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

function createResolver(site: DocsMarkdownSite, integration: string | undefined) {
  function absoluteContentUrl(url: string) {
    if (!url.startsWith('/')) return url;
    const resolved = site.resolveContentHref?.(url, integration) ?? url;
    return `${site.siteOrigin}${resolved}`;
  }

  function resolveNodes(nodes: AstNode[]): AstNode[] {
    return nodes.flatMap((originalNode) => {
      const node = { ...originalNode };

      if (node.type === 'yaml' || node.type === 'mdxjsEsm') return [];

      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        if (node.name === 'Engine') {
          return engineFlavors(node).includes(site.engine)
            ? resolveNodes(node.children ?? [])
            : [];
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
          if (!integration) {
            throw new Error('<Example> can only be exported from a variant-specific route.');
          }
          const name = stringAttribute(node, 'name');
          const files = site.resolveExampleFiles(name, integration);
          const label = site.variantLabel?.(integration) ?? integration;
          return files?.length
            ? fileNodes(files)
            : [noteNode(`This example is not available for ${label} yet.`)];
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
          return fileNodes(files);
        }

        if (node.name === 'Callout') {
          // Projection: a callout is a blockquote in Markdown.
          return [{ type: 'blockquote', children: resolveNodes(node.children ?? []) }];
        }

        if (node.name === 'Cards') {
          // Projection: a card grid is a list of links.
          return [
            {
              type: 'list',
              ordered: false,
              spread: false,
              children: resolveNodes(node.children ?? []),
            },
          ];
        }

        if (node.name === 'Card') {
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
                      url: absoluteContentUrl(href),
                      children: [{ type: 'text', value: title }],
                    },
                    ...(description ? [{ type: 'text', value: ` — ${description}` }] : []),
                  ],
                },
              ],
            },
          ];
        }

        // Site-specific projections (API reference components et al).
        const projected = site.projectComponent?.(node, {
          resolveNodes,
          absoluteContentUrl,
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
                url: absoluteContentUrl(href),
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
        const metadata = node.meta?.split(/\s+/).filter(Boolean) ?? [];
        if (metadata.includes('npm2yarn')) {
          node.value = convertPackageManager(node.value as string, 'pnpm');
          const remaining = metadata.filter((item) => item !== 'npm2yarn');
          node.meta = remaining.length > 0 ? remaining.join(' ') : null;
        }
      }

      if ((node.type === 'link' || node.type === 'image') && node.url) {
        node.url = absoluteContentUrl(node.url);
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

/** Resolve raw MDX to the plain Markdown AST one concrete route shows. */
export function resolveDocsTreeWith(
  site: DocsMarkdownSite,
  { sourceCode, integration }: Pick<RenderDocsMarkdownOptions, 'sourceCode' | 'integration'>,
) {
  const tree = markdownProcessor.parse(sourceCode) as AstNode;
  tree.children = createResolver(site, integration)(tree.children ?? []);
  return tree;
}

/** Serialise a resolved tree back to Markdown. */
export function stringifyDocsTree(tree: AstNode) {
  return markdownProcessor.stringify(tree as never).trimStart();
}

/** Produce plain, route-specific Markdown from raw MDX source. */
export function renderDocsMarkdownWith(
  site: DocsMarkdownSite,
  { sourceCode, canonicalPath, integration, metadata, variantKey }: RenderDocsMarkdownOptions,
) {
  const tree = resolveDocsTreeWith(site, { sourceCode, integration });
  const body = stringifyDocsTree(tree);

  const baseTitle = typeof metadata?.title === 'string' ? metadata.title : undefined;
  const label = integration ? (site.variantLabel?.(integration) ?? integration) : undefined;
  const title = baseTitle && label ? `${baseTitle} — ${label}` : baseTitle;
  const description = typeof metadata?.description === 'string' ? metadata.description : undefined;

  const frontmatter = [
    '---',
    ...(title ? [`title: ${yamlValue(title)}`] : []),
    ...(description ? [`description: ${yamlValue(description)}`] : []),
    ...(integration && label ? [`${variantKey ?? 'integration'}: ${yamlValue(label)}`] : []),
    `source: ${yamlValue(`${site.siteOrigin}${canonicalPath}`)}`,
    '---',
    '',
    '',
  ].join('\n');

  return `${frontmatter}${body}`;
}
