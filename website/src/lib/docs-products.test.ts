import { describe, expect, it } from 'vitest';

import { docsProductFromPath, docsProductHref } from './docs-products';

describe('docsProductFromPath', () => {
  it.each([
    ['/docs/viewer/getting-started', 'viewer'],
    ['/docs/headless/react/getting-started', 'headless'],
    ['/docs/engine', 'engine'],
    ['/docs/engine/getting-started', 'engine'],
  ] as const)('finds the product for %s', (pathname, expected) => {
    expect(docsProductFromPath(pathname)).toBe(expected);
  });

  it.each(['/docs', '/', '/demo', '/docs/unknown'])('returns null for %s', (pathname) => {
    expect(docsProductFromPath(pathname)).toBeNull();
  });
});

describe('docsProductHref', () => {
  it('carries a supported integration between Viewer and Headless', () => {
    expect(docsProductHref('viewer', 'vue')).toBe('/docs/viewer/vue/getting-started');
    expect(docsProductHref('headless', 'vue')).toBe('/docs/headless/vue/getting-started');
  });

  it('falls Vanilla JS back to React when entering Headless', () => {
    expect(docsProductHref('headless', 'vanilla')).toBe('/docs/headless/react/getting-started');
  });

  it('uses the courtesy route when the current page has no integration', () => {
    expect(docsProductHref('viewer', null)).toBe('/docs/viewer/getting-started');
    expect(docsProductHref('headless', null)).toBe('/docs/headless/getting-started');
  });

  it('always links Engine to its product root', () => {
    expect(docsProductHref('engine', 'angular')).toBe('/docs/engine');
  });
});
