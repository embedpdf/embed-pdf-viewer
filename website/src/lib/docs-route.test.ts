import { describe, expect, it } from 'vitest';

import { expandDocsStaticParams, resolveDocsPath } from './docs-route';

describe('documentation route fan-out', () => {
  it('maps Viewer integration URLs to one canonical MDX source', () => {
    expect(resolveDocsPath(['docs', 'viewer', 'svelte', 'getting-started'])).toEqual({
      contentPath: ['docs', 'viewer', 'getting-started'],
      integration: 'svelte',
    });
    expect(resolveDocsPath(['docs', 'viewer', 'unknown', 'getting-started'])).toBeNull();
  });

  it('generates all five Viewer integrations from one content entry', () => {
    const params = expandDocsStaticParams([{ mdxPath: ['docs', 'viewer', 'getting-started'] }]);

    expect(params).toHaveLength(5);
    expect(params).toContainEqual({
      mdxPath: ['docs', 'viewer', 'vanilla', 'getting-started'],
    });
    expect(params).toContainEqual({
      mdxPath: ['docs', 'viewer', 'angular', 'getting-started'],
    });
  });

  it('fans a product index out per framework, with no bare route left', () => {
    const params = expandDocsStaticParams([{ mdxPath: ['docs', 'headless'] }]);

    expect(params).toHaveLength(4);
    expect(params).toContainEqual({ mdxPath: ['docs', 'headless', 'react'] });
    expect(params).not.toContainEqual({ mdxPath: ['docs', 'headless'] });
    expect(resolveDocsPath(['docs', 'headless', 'vue'])).toEqual({
      contentPath: ['docs', 'headless'],
      integration: 'vue',
    });
  });
});
