import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { parse as parseYaml } from 'yaml';

import { extractPageSections, type SearchExtractSite } from './extract';
import type { DocsSection } from './types';

/**
 * Build-time corpus enumeration. Reads the filesystem, so this module must
 * never be pulled into a request path — the API route reads the artifact.
 */

function walkMdx(directory: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkMdx(absolute);
    return entry.isFile() && entry.name.endsWith('.mdx') ? [absolute] : [];
  });
}

type Frontmatter = { title?: unknown; description?: unknown; searchable?: unknown };

function readFrontmatter(source: string): Frontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === 'object' ? (parsed as Frontmatter) : {};
  } catch {
    return {};
  }
}

/**
 * `<root>/docs/headless/plugins/stage.mdx` → `docs/headless/plugins/stage`.
 * An `index.mdx` collapses onto its directory, matching Nextra's routing.
 */
export function contentPathFor(contentRoot: string, absolutePath: string): string {
  const relative = path.relative(contentRoot, absolutePath).split(path.sep).join('/');
  const withoutExtension = relative.replace(/\.mdx$/, '');
  return withoutExtension.replace(/\/index$/, '');
}

export function sectionId(section: Pick<DocsSection, 'contentPath' | 'anchor'>): string {
  return `${section.contentPath}#${section.anchor ?? ''}`;
}

/**
 * The text that gets embedded.
 *
 * Breadcrumb and titles lead so a short section inherits the context of where
 * it sits — "Zoom" alone is ambiguous, "Headless › Plugins › Stage › Zoom" is
 * not. Only shared prose is embedded; per-integration branches are lexical.
 */
export function embeddingTextFor(section: DocsSection): string {
  const trail = [...section.breadcrumb, section.pageTitle, section.sectionTitle]
    .filter(Boolean)
    .join(' › ');
  const symbols = Object.values(section.symbols).flat().slice(0, 40).join(' ');

  return [trail, section.pageDescription, symbols, section.prose]
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
}

/** Splits camelCase so a lexical search for `zoom` still finds `useZoom`. */
function expandSymbol(symbol: string): string {
  return symbol
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[@/_.-]+/g, ' ')
    .trim();
}

export function symbolsTextFor(section: DocsSection): string {
  const all = Object.values(section.symbols).flat();
  return [...new Set([...all, ...all.map(expandSymbol)])].join(' ').trim();
}

export function variantProseTextFor(section: DocsSection): string {
  return Object.values(section.variantProse).filter(Boolean).join('\n').trim();
}

/**
 * Identifies a section's *indexable* content. Only a change here costs an
 * embedding call, so a rebuild with untouched docs re-embeds nothing.
 */
export function contentHashFor(section: DocsSection): string {
  return createHash('sha256').update(embeddingTextFor(section)).digest('hex').slice(0, 32);
}

export type CorpusPage = {
  contentPath: string;
  absolutePath: string;
  sections: DocsSection[];
};

/**
 * Extracts every indexable section under `<contentRoot>/docs`.
 *
 * Resolution errors are deliberately fatal: the site's tree resolution throws
 * on an MDX component with no Markdown projection, and a silently skipped
 * page would be a page nobody can find.
 */
export function collectCorpus(site: SearchExtractSite, contentRoot: string): CorpusPage[] {
  const files = walkMdx(path.join(contentRoot, 'docs')).sort();

  return files.flatMap((absolutePath) => {
    const source = fs.readFileSync(absolutePath, 'utf-8');
    const frontmatter = readFrontmatter(source);
    if (frontmatter.searchable === false) return [];

    const contentPath = contentPathFor(contentRoot, absolutePath);
    const sections = extractPageSections(site, {
      sourceCode: source,
      contentPath,
      title: frontmatter.title,
      description: frontmatter.description,
    });

    return sections.length > 0 ? [{ contentPath, absolutePath, sections }] : [];
  });
}
