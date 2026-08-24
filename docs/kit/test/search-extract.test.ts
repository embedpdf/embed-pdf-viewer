import { describe, expect, it } from 'vitest';

import { resolveDocsTreeWith, type DocsMarkdownSite } from '../src/docs-markdown';
import { extractPageSections, type SearchExtractSite } from '../src/search/extract';

/**
 * A minimal fan-out site: headless pages resolve across four frameworks
 * (react canonical), everything else is variant-less — the same shape both
 * real sites bind.
 */
const FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'];

const markdownSite: DocsMarkdownSite = {
  siteOrigin: 'https://docs.example',
  engine: 'local',
  resolveExampleFiles: () => undefined,
  readCodeFile: () => null,
  isFramework: (value) => FRAMEWORKS.includes(value),
};

const site: SearchExtractSite = {
  resolveTree: ({ sourceCode, integration }) => ({
    tree: resolveDocsTreeWith(markdownSite, { sourceCode, integration }),
  }),
  productFromPath: (canonicalPath) => canonicalPath.split('/')[2] ?? null,
  integrationsForProduct: (product) => (product === 'headless' ? FRAMEWORKS : [undefined]),
};

const ENGINE_PAGE = `---
title: Engine
description: Choosing an engine.
---

# Engine

The engine does the PDF work.

## Fallback fonts

Register a font with \`registerFallbackFont()\` before opening a document.

### Deeper detail

A level-three heading opens its own section.

#### Even deeper

This stays with its parent.
`;

function sectionsOf(source: string, contentPath: string) {
  return extractPageSections(site, { sourceCode: source, contentPath, title: 'Engine' });
}

describe('section extraction', () => {
  it('opens a section at every h2 and h3, and keeps a lede for the text above them', () => {
    const sections = sectionsOf(ENGINE_PAGE, 'docs/engine/index');

    expect(sections.map((section) => section.anchor)).toEqual([
      null,
      'fallback-fonts',
      'deeper-detail',
    ]);
    expect(sections[0].prose).toContain('The engine does the PDF work.');
    expect(sections[0].sectionTitle).toBeNull();
  });

  it('keeps h4 and deeper with the section they belong to', () => {
    const deep = sectionsOf(ENGINE_PAGE, 'docs/engine/index').at(-1);
    expect(deep?.anchor).toBe('deeper-detail');
    expect(deep?.prose).toContain('This stays with its parent.');
  });

  it('slugs headings the way rehype-slug does, so anchors resolve', () => {
    const source = `# Page\n\n## Server-side rendering (Next, Nuxt)\n\nText.\n\n## Server-side rendering (Next, Nuxt)\n\nMore.\n`;
    const anchors = sectionsOf(source, 'docs/engine/index').map((section) => section.anchor);

    expect(anchors).toEqual([
      'server-side-rendering-next-nuxt',
      'server-side-rendering-next-nuxt-1',
    ]);
  });

  it('pulls identifiers out of prose for exact matching', () => {
    const [, fonts] = sectionsOf(ENGINE_PAGE, 'docs/engine/index');
    expect(fonts.symbols['*']).toContain('registerFallbackFont');
  });

  it('drops sections that carry neither prose nor identifiers', () => {
    const source = `# Page\n\n## Empty\n\n## Real\n\nSomething to find.\n`;
    const anchors = sectionsOf(source, 'docs/engine/index').map((section) => section.anchor);
    expect(anchors).toEqual(['real']);
  });
});

describe('integration fan-out', () => {
  const HEADLESS_PAGE = `---
title: Getting started
---

# Getting started

## Installation

<Fw only="react">Install the React adapter.</Fw>
<Fw only="vue">Install the Vue adapter.</Fw>
<Fw only={['svelte', 'angular']}>Install the adapter.</Fw>
`;

  it('stores shared prose once and records only genuine per-framework branches', () => {
    const [installation] = extractPageSections(site, {
      sourceCode: HEADLESS_PAGE,
      contentPath: 'docs/headless/getting-started',
      title: 'Getting started',
    });

    // React is the Headless default, so its wording is the shared prose.
    expect(installation.prose).toBe('Install the React adapter.');
    expect(installation.variantProse.vue).toBe('Install the Vue adapter.');
    expect(installation.variantProse.svelte).toBe('Install the adapter.');
    expect(installation.variantProse.react).toBeUndefined();
  });

  it('indexes one row per source section, not one per public route', () => {
    const sections = extractPageSections(site, {
      sourceCode: HEADLESS_PAGE,
      contentPath: 'docs/headless/getting-started',
      title: 'Getting started',
    });

    // Four Headless integrations, still one indexed section.
    expect(sections).toHaveLength(1);
    expect(sections[0].contentPath).toBe('docs/headless/getting-started');
  });
});
