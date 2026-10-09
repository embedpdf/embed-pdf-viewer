import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderDocsMarkdown } from './docs-markdown';
import type { DocsRelease } from './docs-release';

/**
 * The headless docs, written for each framework (docs/conventions/docs-architecture.md): a page
 * that's been written for every framework never shows another one. The check reads each
 * framework's Markdown export, which says exactly what the page says.
 *
 * It follows the publish gate (`./docs-release`): each page as the preview site shows it, in
 * full, which is everything the live site shows too; and each page as it shows where the gate
 * holds it back.
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
// A React code block (```tsx / ```jsx) belongs on React's page only; React's JSX props
// (`onHitClick={…}`) on Vue's and Angular's (Svelte writes its own props the same way).
const REACT_BLOCK = /^\s*```(tsx|jsx)\b/gm;
const JSX_PROP = /\bon[A-Z]\w*=\{/g;

const OTHER_FRAMEWORKS: Record<Framework, RegExp[]> = {
  react: [/@embedpdf\/(vue|svelte|angular)\b/g, /\binject\(Epdf/g, /\bv-(if|for|model)\b/g, /\{#(if|each|snippet)\b/g],
  vue: [
    /@embedpdf\/(react|svelte|angular)\b/g,
    /\binject\(Epdf/g,
    /\b(className|onClick)=/g,
    /\{#(if|each|snippet)\b/g,
    REACT_BLOCK,
    JSX_PROP,
  ],
  svelte: [
    /@embedpdf\/(react|vue|angular)\b/g,
    /\binject\(Epdf/g,
    /\b(className|onClick)=/g,
    /\bv-(if|for|model)\b/g,
    REACT_BLOCK,
  ],
  angular: [
    /@embedpdf\/(react|vue|svelte)\b/g,
    /\buse[A-Z]\w*\(/g,
    /\b[a-z]\w*Plugin\(/g,
    /\b(className|onClick)=/g,
    /\bv-(if|for|model)\b/g,
    /\{#(if|each|snippet)\b/g,
    REACT_BLOCK,
    JSX_PROP,
  ],
};

/**
 * Leaks we know about, each with why. The Quick start's live demo runs on today's Angular adapter
 * (`stagePlugin()`, `<epdf-viewer>`) until NG1–NG3 land; then its sample changes and this goes.
 */
const KNOWN: Record<string, Partial<Record<Framework, string[]>>> = {
  'quick-start': { angular: ['stagePlugin(', 'renderPlugin('] },
};

const PREVIEW: DocsRelease = { live: true, preview: true, reactLive: true };
/** Held back, with the React version live (so the notice links to it) unless it's React's own. */
const heldBack = (framework: Framework): DocsRelease => ({
  live: false,
  preview: false,
  reactLive: framework !== 'react',
});

function markdownFor(page: string, framework: Framework, release = PREVIEW) {
  return renderDocsMarkdown({
    sourceCode: fs.readFileSync(path.join(HEADLESS, `${page}.mdx`), 'utf8'),
    canonicalPath: `/docs/headless/${framework}/${page.replace(/\/?index$/, '')}`,
    integration: framework,
    release,
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

  for (const framework of FRAMEWORKS) {
    it(`a page held back for ${framework} shows only ${framework}`, () => {
      for (const page of PAGES) {
        expect(leaks(page, markdownFor(page, framework, heldBack(framework)), framework)).toEqual([]);
      }
    });
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
    expect(vue).toContain('`<SearchLayer @hit-click>`');
  });

  it('writes plugin settings once and shows them the framework’s way', () => {
    expect(markdownFor('annotations/tools', 'react')).toContain('annotationPlugin({');
    expect(markdownFor('annotations/tools', 'vue')).toContain('annotationPlugin({');
    expect(markdownFor('annotations/tools', 'angular')).toContain('withAnnotation({');
    expect(markdownFor('viewing/stage', 'angular')).toContain("withStage({\n  id: 'stage-thumbs'");
  });

  it('keeps Angular signals from clashing with the service or a namespace', () => {
    const angular = markdownFor('documents/metadata', 'angular');
    expect(angular).toContain('| `fields()`');
    expect(angular).toContain('| `custom.fields()`');
    expect(angular).toContain('| `status()`');
    expect(markdownFor('documents/metadata', 'react')).toContain('| `metadata`');
  });
});
