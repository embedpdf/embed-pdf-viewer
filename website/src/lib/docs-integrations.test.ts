import { describe, expect, it } from 'vitest';

import {
  docsIntegrationFromPath,
  docsIntegrationHref,
  integrationForProduct,
} from './docs-integrations';

describe('shared documentation integrations', () => {
  it.each([
    ['/docs/viewer/vanilla/getting-started', 'vanilla'],
    ['/docs/viewer/vue/getting-started', 'vue'],
    ['/docs/headless/vue/getting-started', 'vue'],
    ['/docs/headless/angular/getting-started', 'angular'],
  ] as const)('reads %s as %s', (pathname, expected) => {
    expect(docsIntegrationFromPath(pathname)).toBe(expected);
  });

  it.each([
    '/docs',
    '/docs/engine/getting-started',
    '/docs/viewer/getting-started',
    '/docs/headless/vanilla/getting-started',
  ])('does not invent an integration for %s', (pathname) => {
    expect(docsIntegrationFromPath(pathname)).toBeNull();
  });

  it('rewrites both canonical and concrete routes without duplicating the integration', () => {
    expect(docsIntegrationHref('/docs/viewer/getting-started', 'vue')).toBe(
      '/docs/viewer/vue/getting-started',
    );
    expect(docsIntegrationHref('/docs/viewer/react/getting-started', 'vue')).toBe(
      '/docs/viewer/vue/getting-started',
    );
    expect(docsIntegrationHref('/docs/headless/react/getting-started', 'vue')).toBe(
      '/docs/headless/vue/getting-started',
    );
  });

  it('uses the product default only when the shared preference is unsupported', () => {
    expect(integrationForProduct('viewer', 'vue')).toBe('vue');
    expect(integrationForProduct('headless', 'vue')).toBe('vue');
    expect(integrationForProduct('headless', 'vanilla')).toBe('react');
    expect(integrationForProduct('viewer', null)).toBe('vanilla');
  });
});
