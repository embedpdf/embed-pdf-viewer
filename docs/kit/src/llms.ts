import fs from 'node:fs';
import path from 'node:path';

import { contentPathFor, readFrontmatter, walkMdx } from './search/corpus';

/**
 * `llms.txt` — the authored entry map for AI agents
 * (DOCS-PLATFORM-ARCHITECTURE.md; format: llmstxt.org).
 *
 * The kit enumerates what exists and renders the file; each SITE authors the
 * framing — title, summary, section labels and order — and decides how a
 * content path becomes a public URL (fan-out default integration, `.md`
 * suffix). Authored pointers, generated inventory: prose never comes from
 * machinery, and no page can silently fall out of the index.
 */

export type LlmsPage = {
  /** Content source path: `docs/headless/plugins/stage`. */
  contentPath: string;
  title: string;
  description: string | null;
};

/** Every docs content page with its frontmatter identity, sorted by path. */
export function listDocsPages(contentRoot: string): LlmsPage[] {
  return walkMdx(path.join(contentRoot, 'docs'))
    .sort()
    .map((absolutePath) => {
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
  sections: LlmsSection[];
};

/** Serializes the llms.txt document (H1 → blockquote summary → H2 link lists). */
export function renderLlmsTxt({ title, summary, sections }: RenderLlmsTxtOptions): string {
  const lines: string[] = [`# ${title}`, '', `> ${summary}`, ''];

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
