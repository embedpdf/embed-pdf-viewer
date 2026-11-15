import fs from 'node:fs';
import path from 'node:path';

import { contentPathFor, readFrontmatter } from './search/corpus';

/**
 * `llms.txt` — the authored entry map for AI agents
 * (docs/conventions/docs-architecture.md; format: llmstxt.org).
 *
 * The kit enumerates what exists and renders the file; each SITE authors the
 * framing — title, summary, section labels and order — and decides how a
 * content path becomes a public URL (fan-out default integration, `.md`
 * suffix). Authored pointers, generated inventory: prose never comes from
 * machinery, and no page can silently fall out of the index.
 *
 * A site serves one such file per integration too (`/llms/vue.txt`), with
 * every page that integration has, so an agent working in Vue reads Vue's.
 *
 * Pages are listed in the order the sidebar has them, so a file reads as the
 * docs do: the overview and the quick start before the details.
 */

export type LlmsPage = {
  /** Content source path: `docs/headless/plugins/stage`. */
  contentPath: string;
  title: string;
  description: string | null;
};

/** A key at the top of a `_meta.ts`: one to a line, as Prettier and the generators write them. */
const SIDEBAR_KEY = /^ {2}(?:'([^']+)'|"([^"]+)"|([\w$]+)):/;

/**
 * The order a folder's sidebar gives its pages and folders: the keys of its `_meta.ts`
 * (`index`, `quick-start`, `viewing`), which Nextra orders the sidebar by.
 */
function sidebarOrder(directory: string): string[] {
  let source: string;
  try {
    source = fs.readFileSync(path.join(directory, '_meta.ts'), 'utf-8');
  } catch {
    return [];
  }
  return source.split('\n').flatMap((line) => {
    const [, single, double, bare] = line.match(SIDEBAR_KEY) ?? [];
    const key = single ?? double ?? bare;
    return key ? [key] : [];
  });
}

/**
 * Every `.mdx` under a folder, as its sidebar lists them: each folder's pages and folders in its
 * `_meta.ts`'s order, then what that doesn't name, by name. A page comes before the folder that
 * shares its name.
 */
function walkInSidebarOrder(directory: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const order = sidebarOrder(directory);
  const place = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);

  return entries
    .filter((entry) => entry.isDirectory() || (entry.isFile() && entry.name.endsWith('.mdx')))
    .map((entry) => ({
      entry,
      name: entry.isDirectory() ? entry.name : entry.name.slice(0, -'.mdx'.length),
    }))
    .sort(
      (a, b) =>
        place(a.name) - place(b.name) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        Number(a.entry.isDirectory()) - Number(b.entry.isDirectory()),
    )
    .flatMap(({ entry }) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walkInSidebarOrder(absolute) : [absolute];
    });
}

/** Every docs content page with its frontmatter identity, in the order the sidebar has them. */
export function listDocsPages(contentRoot: string): LlmsPage[] {
  return walkInSidebarOrder(path.join(contentRoot, 'docs')).map((absolutePath) => {
    const frontmatter = readFrontmatter(fs.readFileSync(absolutePath, 'utf-8'));
    const contentPath = contentPathFor(contentRoot, absolutePath);
    const fallback = contentPath
      .split('/')
      .at(-1)!
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return {
      contentPath,
      title:
        typeof frontmatter.title === 'string' && frontmatter.title ? frontmatter.title : fallback,
      description:
        typeof frontmatter.description === 'string' && frontmatter.description
          ? frontmatter.description
          : null,
    };
  });
}

export type LlmsSection = {
  label: string;
  pages: Array<{ title: string; url: string; description?: string | null }>;
};

export type RenderLlmsTxtOptions = {
  title: string;
  /** One-paragraph framing, authored by the site. */
  summary: string;
  /** What a reader should know before the lists, a paragraph each, authored by the site. */
  details?: string[];
  sections: LlmsSection[];
};

/** Serializes the llms.txt document (H1 → blockquote summary → paragraphs → H2 link lists). */
export function renderLlmsTxt({
  title,
  summary,
  details = [],
  sections,
}: RenderLlmsTxtOptions): string {
  const lines: string[] = [`# ${title}`, '', `> ${summary}`, ''];
  for (const paragraph of details) lines.push(paragraph, '');

  for (const section of sections) {
    if (section.pages.length === 0) continue;
    lines.push(`## ${section.label}`, '');
    for (const page of section.pages) {
      const suffix = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${page.url})${suffix}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
