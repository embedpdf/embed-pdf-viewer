import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderDocsMarkdown } from './docs-markdown';

/**
 * The headless docs, written for each framework (docs/conventions/docs-architecture.md): a page
 * that's been written for every framework never shows another one. The check reads each
 * framework's Markdown export, which says exactly what the page says.
 */

const HEADLESS = path.resolve(process.cwd(), 'src/content/docs/headless');
const FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'] as const;
type Framework = (typeof FRAMEWORKS)[number];

/** Every headless page, written for each framework. `FRAMEWORK_DOCS_PAGES=a,b` checks only those. */
const PAGES = process.env.FRAMEWORK_DOCS_PAGES
  ? process.env.FRAMEWORK_DOCS_PAGES.split(',')
  : fs
      .readdirSync(HEADLESS, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.mdx'))
      .map((file) => file.replace(/\.mdx$/, '').split(path.sep).join('/'))
      .sort();

/** What gives another framework away, on each framework's page. */
const OTHER_FRAMEWORKS: Record<Framework, RegExp[]> = {
  react: [/@embedpdf\/(vue|svelte|angular)\b/g, /\binject\(Epdf/g, /\bv-(if|for|model)\b/g, /\{#(if|each|snippet)\b/g],
  vue: [/@embedpdf\/(react|svelte|angular)\b/g, /\binject\(Epdf/g, /\b(className|onClick)=/g, /\{#(if|each|snippet)\b/g],
  svelte: [/@embedpdf\/(react|vue|angular)\b/g, /\binject\(Epdf/g, /\b(className|onClick)=/g, /\bv-(if|for|model)\b/g],
  angular: [
    /@embedpdf\/(react|vue|svelte)\b/g,
    /\buse[A-Z]\w*\(/g,
    /\b[a-z]\w*Plugin\(/g,
    /\b(className|onClick)=/g,
    /\bv-(if|for|model)\b/g,
    /\{#(if|each|snippet)\b/g,
  ],
};

/**
 * Leaks we know about, each with why. The Quick start's live demo runs on today's Angular adapter
 * (`stagePlugin()`, `<epdf-viewer>`) until NG1–NG3 land; then its sample changes and this goes.
 */
const KNOWN: Record<string, Partial<Record<Framework, string[]>>> = {
  'quick-start': { angular: ['stagePlugin(', 'renderPlugin('] },
};

function markdownFor(page: string, framework: Framework) {
  return renderDocsMarkdown({
    sourceCode: fs.readFileSync(path.join(HEADLESS, `${page}.mdx`), 'utf8'),
    canonicalPath: `/docs/headless/${framework}/${page.replace(/\/?index$/, '')}`,
    integration: framework,
  });
}

function leaks(page: string, markdown: string, framework: Framework) {
  const known = KNOWN[page]?.[framework] ?? [];
  return OTHER_FRAMEWORKS[framework]
    .flatMap((pattern) => markdown.match(pattern) ?? [])
    .filter((match) => !known.includes(match));
}

describe('headless pages written for each framework', () => {
  for (const page of PAGES) {
    for (const framework of FRAMEWORKS) {
      it(`${page} shows only ${framework}`, () => {
        expect(leaks(page, markdownFor(page, framework), framework)).toEqual([]);
      });
    }
  }

  it('shows each framework its own names and code', () => {
    const angular = markdownFor('text/search', 'angular');
    expect(angular).toContain('`inject(EpdfSearch)`');
    expect(angular).toContain('`withSearch()`');
    expect(angular).toContain('`completed$`');
    expect(angular).toContain('https://www.cloudpdf.com/docs/headless/angular/text/search');

    const vue = markdownFor('text/search', 'vue');
    expect(vue).toContain('```vue');
    expect(vue).toContain('@embedpdf/vue/search');
    expect(vue).toContain('`active-color`');
  });
});
