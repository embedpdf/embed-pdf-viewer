import convertPackageManager from 'npm-to-yarn';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import { collectSampleFiles, readDocsCodeFile, type DocsCodeFile } from './docs-samples';
import { FRAMEWORK_LABELS, frameworkHref, isFramework, type Framework } from './frameworks';
import { SITE_ORIGIN } from './site';

type AstNode = {
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

type MarkdownMetadata = {
  title?: unknown;
  description?: unknown;
};

export type RenderDocsMarkdownOptions = {
  sourceCode: string;
  canonicalPath: string;
  framework?: Framework;
  metadata?: MarkdownMetadata;
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
    | {
        data?: {
          estree?: {
            body?: Array<{ expression?: AstNode }>;
          };
        };
      }
    | undefined;
  const expression = value?.data?.estree?.body?.[0]?.expression;
  if (!expression) return [];

  if (expression.type === 'Literal' && typeof expression.value === 'string') {
    return [expression.value];
  }

  if (expression.type === 'ArrayExpression' && Array.isArray(expression.elements)) {
    return expression.elements.flatMap((element) =>
      element?.type === 'Literal' && typeof element.value === 'string' ? [element.value] : [],
    );
  }

  return [];
}

function frameworkAttribute(node: AstNode): Framework[] {
  const values = expressionStrings(getAttribute(node, 'only'));
  if (values.length === 0 || values.some((value) => !isFramework(value))) {
    throw new Error('<Fw> requires a static `only` framework or framework array.');
  }
  return values as Framework[];
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

function fileNodes(files: DocsCodeFile[]): AstNode[] {
  return files.flatMap((file) => [
    {
      type: 'paragraph',
      children: [
        {
          type: 'strong',
          children: [{ type: 'inlineCode', value: file.filename }],
        },
      ],
    },
    {
      type: 'code',
      lang: file.language,
      value: file.code.trimEnd(),
    },
  ]);
}

function missingExampleNode(framework: Framework): AstNode {
  return {
    type: 'blockquote',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            value: `This example is not available for ${FRAMEWORK_LABELS[framework]} yet.`,
          },
        ],
      },
    ],
  };
}

function absoluteContentUrl(url: string, framework?: Framework) {
  if (!url.startsWith('/')) return url;

  const resolved =
    framework && (url === '/docs/headless' || url.startsWith('/docs/headless/'))
      ? frameworkHref(url, framework)
      : url;
  return `${SITE_ORIGIN}${resolved}`;
}

function resolveNodes(nodes: AstNode[], framework?: Framework): AstNode[] {
  return nodes.flatMap((originalNode) => {
    const node = { ...originalNode };

    if (node.type === 'yaml' || node.type === 'mdxjsEsm') return [];

    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      if (node.name === 'Fw') {
        if (!framework) {
          throw new Error('<Fw> can only be exported from a framework-specific route.');
        }
        return frameworkAttribute(node).includes(framework)
          ? resolveNodes(node.children ?? [], framework)
          : [];
      }

      if (node.name === 'Example') {
        if (!framework) {
          throw new Error('<Example> can only be exported from a framework-specific route.');
        }
        const name = stringAttribute(node, 'name');
        const files = collectSampleFiles(name)[framework];
        return files?.length ? fileNodes(files) : [missingExampleNode(framework)];
      }

      if (node.name === 'CodeExample') {
        const paths = codePathsAttribute(node);
        if (paths.length === 0) {
          throw new Error('<CodeExample> requires a static `codePath` or `codePaths`.');
        }
        const files = paths
          .map((codePath) => readDocsCodeFile(codePath))
          .filter((file): file is DocsCodeFile => file !== null);
        if (files.length !== paths.length) {
          throw new Error('<CodeExample> references a source file that could not be read.');
        }
        return fileNodes(files);
      }

      throw new Error(`No Markdown projection is defined for <${node.name ?? 'Fragment'}>.`);
    }

    if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
      throw new Error('Arbitrary MDX expressions require an explicit Markdown projection.');
    }

    if (node.type === 'code' && typeof node.value === 'string') {
      const metadata = node.meta?.split(/\s+/).filter(Boolean) ?? [];
      if (metadata.includes('npm2yarn')) {
        node.value = convertPackageManager(node.value, 'pnpm');
        const remaining = metadata.filter((item) => item !== 'npm2yarn');
        node.meta = remaining.length > 0 ? remaining.join(' ') : null;
      }
    }

    if ((node.type === 'link' || node.type === 'image') && node.url) {
      node.url = absoluteContentUrl(node.url, framework);
    }

    if (node.children) node.children = resolveNodes(node.children, framework);
    return [node];
  });
}

function yamlValue(value: string) {
  return JSON.stringify(value);
}

function markdownFrontmatter(
  metadata: MarkdownMetadata | undefined,
  canonicalPath: string,
  framework?: Framework,
) {
  const baseTitle = typeof metadata?.title === 'string' ? metadata.title : undefined;
  const title =
    baseTitle && framework ? `${baseTitle} — ${FRAMEWORK_LABELS[framework]}` : baseTitle;
  const description = typeof metadata?.description === 'string' ? metadata.description : undefined;

  return [
    '---',
    ...(title ? [`title: ${yamlValue(title)}`] : []),
    ...(description ? [`description: ${yamlValue(description)}`] : []),
    ...(framework ? [`framework: ${yamlValue(FRAMEWORK_LABELS[framework])}`] : []),
    `source: ${yamlValue(`${SITE_ORIGIN}${canonicalPath}`)}`,
    '---',
    '',
    '',
  ].join('\n');
}

/** Produces plain, route-specific Markdown from Nextra's raw MDX source. */
export function renderDocsMarkdown({
  sourceCode,
  canonicalPath,
  framework,
  metadata,
}: RenderDocsMarkdownOptions) {
  const tree = markdownProcessor.parse(sourceCode) as AstNode;
  tree.children = resolveNodes(tree.children ?? [], framework);
  const body = markdownProcessor.stringify(tree as never).trimStart();
  return `${markdownFrontmatter(metadata, canonicalPath, framework)}${body}`;
}
