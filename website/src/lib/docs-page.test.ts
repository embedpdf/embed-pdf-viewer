import { describe, expect, it } from 'vitest';

import { createDocsPagePresentation } from './docs-page';

describe('createDocsPagePresentation', () => {
  it('derives framework-specific metadata without duplicating the framework in the image title', () => {
    const page = createDocsPagePresentation({
      mdxPath: ['docs', 'headless', 'vue', 'getting-started'],
      metadata: {
        title: 'Getting Started',
        description: 'Build your own viewer.',
      },
      resolved: {
        contentPath: ['docs', 'headless', 'getting-started'],
        integration: 'vue',
      },
    });

    expect(page.title).toBe('Getting Started — Vue');
    expect(page.imageTitle).toBe('Getting Started');
    expect(page.integration).toBe('vue');
    expect(page.section).toBe('Headless SDK');
    expect(page.canonicalUrl).toBe('https://www.embedpdf.com/docs/headless/vue/getting-started');
    expect(page.socialImagePath).toBe('/api/og/docs/headless/vue/getting-started');
  });

  it('supports editorial social overrides while preserving normal page metadata', () => {
    const page = createDocsPagePresentation({
      mdxPath: ['docs', 'viewer', 'react', 'getting-started'],
      metadata: {
        title: 'Getting Started',
        description: 'Normal description.',
        ogTitle: 'Ship a PDF viewer in minutes',
        ogDescription: 'Social description.',
        ogVariant: 'viewer',
      },
      resolved: {
        contentPath: ['docs', 'viewer', 'getting-started'],
        integration: 'react',
      },
    });

    expect(page.title).toBe('Getting Started — React');
    expect(page.description).toBe('Normal description.');
    expect(page.imageTitle).toBe('Ship a PDF viewer in minutes');
    expect(page.socialDescription).toBe('Social description.');
    expect(page.section).toBe('PDF Viewer');
    expect(page.integration).toBe('react');
  });

  it('gives Engine documentation its own social variant', () => {
    const page = createDocsPagePresentation({
      mdxPath: ['docs', 'engine', 'getting-started'],
      metadata: { title: 'Getting Started' },
      resolved: { contentPath: ['docs', 'engine', 'getting-started'] },
    });

    expect(page.variant).toBe('engine');
    expect(page.section).toBe('PDF Engine');
  });
});
