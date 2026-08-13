import GithubSlugger from 'github-slugger';

import type { AstNode } from '../docs-markdown';
import { dedupeSymbols, symbolsFromCode, symbolsFromInlineCode } from './symbols';
import type { DocsSection } from './types';

/**
 * The site binding for section extraction: how to resolve raw MDX into this
 * site's tree (engine flavor, component projections), and how the site's URL
 * space maps paths to products and products to integrations.
 */
export type SearchExtractSite = {
  /** Resolve one content source for one integration (the kit markdown pass). */
  resolveTree(options: {
    sourceCode: string;
    canonicalPath: string;
    integration?: string;
  }): { tree: AstNode };
  /** `/docs/headless/…` → 'headless'; null for non-product pages. */
  productFromPath(canonicalPath: string): string | null;
  /**
   * Integrations a product's pages resolve under; `[undefined]` for products
   * with no framework axis. The FIRST integration is canonical: it decides
   * the section set, ordering, and the shared prose.
   */
  integrationsForProduct(product: string | null): readonly (string | undefined)[];
};

/**
 * A section runs from one heading to the next heading of equal or shallower
 * depth. `##` and `###` both open one; `####` and deeper stay with their
 * parent, because a result row that deep is more precise than it is useful.
 */
const SECTION_DEPTHS = new Set([2, 3]);

type RawSection = {
  anchor: string | null;
  title: string | null;
  depth: number;
  ordinal: number;
  prose: string;
  symbols: string[];
};

function headingText(node: AstNode): string {
  return collectText(node.children ?? []).trim();
}

/**
 * Artefacts of inlining a code sample, not prose the author wrote.
 *
 * `<Example>` projects to a `**`filename`**` label plus a fenced block, and to
 * a "not available yet" note where a framework has no sample. Counting either
 * as prose would make every page look like it says something different per
 * framework, and would bury real `<Fw>` branches in the noise.
 */
function isSampleArtifact(node: AstNode): boolean {
  if (node.type === 'paragraph') {
    const children = node.children ?? [];
    const [only] = children;
    return (
      children.length === 1 &&
      only?.type === 'strong' &&
      only.children?.length === 1 &&
      only.children[0]?.type === 'inlineCode'
    );
  }

  if (node.type === 'blockquote') {
    return collectText(node.children ?? [])
      .trim()
      .startsWith('This example is not available for ');
  }

  return false;
}

/** What each block-level node appends after its own text. */
const SEPARATORS: Record<string, string> = {
  paragraph: '\n',
  heading: '\n',
  listItem: '\n',
  blockquote: '\n',
  tableRow: '\n',
  tableCell: ' — ',
};

/** Visible text, skipping fenced code (which is mined for symbols instead). */
function collectText(nodes: AstNode[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (node.type === 'code' || isSampleArtifact(node)) continue;

    if (node.type === 'text' || node.type === 'inlineCode') {
      if (typeof node.value === 'string') parts.push(node.value);
      continue;
    }

    if (node.children) {
      const inner = collectText(node.children);
      if (!inner) continue;
      // Block-level nodes need a separator so `a<p>b` never reads as `ab`.
      // Tables are the sharpest case: an options table flattened without one
      // produces `'odd','even''none'sizing'intrinsic'`, which is unreadable as
      // an excerpt and tokenises badly for search.
      parts.push(`${inner}${SEPARATORS[node.type] ?? ''}`);
      continue;
    }

    if (node.type === 'break') parts.push('\n');
  }

  return parts.join('');
}

function collectSymbols(nodes: AstNode[]): string[] {
  const found: string[] = [];

  const walk = (list: AstNode[]) => {
    for (const node of list) {
      if (node.type === 'code' && typeof node.value === 'string') {
        found.push(...symbolsFromCode(node.value));
      } else if (node.type === 'inlineCode' && typeof node.value === 'string') {
        found.push(...symbolsFromInlineCode(node.value));
      }
      if (node.children) walk(node.children);
    }
  };

  walk(nodes);
  return dedupeSymbols(found);
}

function normalizeProse(text: string): string {
  return (
    text
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n+ */g, '\n')
      // Every cell appends its separator, so each row ends with a dangling one.
      .replace(/\s*—\s*(\n|$)/g, '$1')
      .trim()
  );
}

/**
 * Splits one resolved tree into sections.
 *
 * The slugger runs over every heading in document order — including the `#`
 * title — because that is exactly what `rehype-slug` does inside Nextra. Any
 * other slugging would drift from the real anchors and produce results that
 * deep-link to nothing.
 */
function splitIntoSections(tree: AstNode): RawSection[] {
  const slugger = new GithubSlugger();
  const sections: RawSection[] = [];
  let current: { anchor: string | null; title: string | null; depth: number; nodes: AstNode[] } = {
    anchor: null,
    title: null,
    depth: 0,
    nodes: [],
  };

  const flush = () => {
    const prose = normalizeProse(collectText(current.nodes));
    const symbols = collectSymbols(current.nodes);
    if (!prose && symbols.length === 0 && !current.title) return;
    sections.push({
      anchor: current.anchor,
      title: current.title,
      depth: current.depth,
      ordinal: sections.length,
      prose,
      symbols,
    });
  };

  for (const node of tree.children ?? []) {
    if (node.type !== 'heading') {
      current.nodes.push(node);
      continue;
    }

    const depth = typeof node.depth === 'number' ? node.depth : 1;
    const text = headingText(node);
    // Slug every heading, even ones that do not open a section, to keep the
    // duplicate counter aligned with Nextra's.
    const slug = text ? slugger.slug(text) : '';

    if (!SECTION_DEPTHS.has(depth)) {
      // The page `#` title is metadata, not content; deeper headings are body
      // text belonging to the section already open.
      if (depth > 3) current.nodes.push(node);
      continue;
    }

    flush();
    current = { anchor: slug || null, title: text || null, depth, nodes: [] };
  }

  flush();
  return sections;
}

function titleCase(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** `docs/headless/plugins/stage` → `['Headless', 'Plugins']`. */
function breadcrumbFor(contentPath: string): string[] {
  return contentPath.split('/').slice(1, -1).map(titleCase);
}

export type ExtractPageOptions = {
  sourceCode: string;
  /** Content source path with no integration segment and no extension. */
  contentPath: string;
  title?: unknown;
  description?: unknown;
};

/**
 * Extracts every indexable section of one content source page.
 *
 * The page is resolved once per integration it supports, then merged: prose
 * shared by all integrations is stored once, and only genuinely
 * integration-specific text (an `<Fw>` branch, a sample that exists for one
 * framework) is recorded per integration.
 */
export function extractPageSections(
  site: SearchExtractSite,
  { sourceCode, contentPath, title, description }: ExtractPageOptions,
): DocsSection[] {
  const canonicalPath = `/${contentPath}`;
  const product = site.productFromPath(canonicalPath);
  const integrations = site.integrationsForProduct(product);
  const pageTitle =
    typeof title === 'string' && title ? title : titleCase(contentPath.split('/').at(-1) ?? '');
  const pageDescription = typeof description === 'string' && description ? description : null;
  const breadcrumb = breadcrumbFor(contentPath);

  // Anchor → merged section. The first integration is canonical: it decides
  // the section set, ordering, and the shared prose.
  const merged = new Map<string, DocsSection>();
  const perIntegrationSymbols = new Map<string, Map<string, string[]>>();

  for (const integration of integrations) {
    const { tree } = site.resolveTree({ sourceCode, canonicalPath, integration });
    const sections = splitIntoSections(tree);
    const key = integration ?? '*';

    for (const section of sections) {
      const id = section.anchor ?? '';
      const existing = merged.get(id);

      if (!existing) {
        merged.set(id, {
          contentPath,
          anchor: section.anchor,
          pageTitle,
          pageDescription,
          sectionTitle: section.title,
          breadcrumb,
          product,
          depth: section.depth,
          ordinal: section.ordinal,
          prose: section.prose,
          variantProse: {},
          symbols: {},
        });
      } else if (integration && section.prose && section.prose !== existing.prose) {
        // Same heading, different words: an <Fw> branch. Keep it searchable,
        // attributed to the integration that actually shows it.
        existing.variantProse[integration] = section.prose;
      }

      let symbolsById = perIntegrationSymbols.get(id);
      if (!symbolsById) {
        symbolsById = new Map();
        perIntegrationSymbols.set(id, symbolsById);
      }
      symbolsById.set(key, section.symbols);
    }
  }

  for (const [id, symbolsByIntegration] of perIntegrationSymbols) {
    const section = merged.get(id);
    if (!section) continue;

    const lists = [...symbolsByIntegration.values()];
    const shared = lists[0]?.filter((symbol) => lists.every((list) => list.includes(symbol))) ?? [];
    const sharedSet = new Set(shared);

    if (shared.length > 0) section.symbols['*'] = dedupeSymbols(shared);
    for (const [integration, list] of symbolsByIntegration) {
      if (integration === '*') continue;
      const only = list.filter((symbol) => !sharedSet.has(symbol));
      if (only.length > 0) section.symbols[integration] = dedupeSymbols(only);
    }
  }

  // A heading with no body of its own is a container, not a result: its
  // subsections carry the content and are individually findable.
  return [...merged.values()]
    .filter(
      (section) =>
        section.prose.length > 0 || Object.values(section.symbols).some((list) => list.length > 0),
    )
    .sort((a, b) => a.ordinal - b.ordinal);
}
