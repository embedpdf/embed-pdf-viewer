import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved — sibling plain-ESM module, typed by its .d.mts
import { frameworkFromPath, frameworkHref, integrationFromPath } from '../mdx/frameworks.mjs';

describe('the integration a page is for', () => {
  it('is the framework in the URL, and plain HTML on a viewer page', () => {
    expect(integrationFromPath('/docs/viewer/vanilla/customize/layout')).toBe('vanilla');
    expect(integrationFromPath('/docs/viewer/vue/customize/layout')).toBe('vue');
    expect(integrationFromPath('/docs/headless/angular/text/search')).toBe('angular');
    expect(integrationFromPath('/docs/engine/fonts')).toBe('react');
  });

  it('keeps a page’s framework names React on a plain-HTML viewer page', () => {
    expect(frameworkFromPath('/docs/viewer/vanilla/setup')).toBe('react');
  });
});

describe('a docs link on a plain-HTML viewer page', () => {
  it('keeps plain HTML in a viewer link', () => {
    expect(frameworkHref('/docs/viewer/setup', 'vanilla')).toBe('/docs/viewer/vanilla/setup');
    expect(frameworkHref('/docs/viewer', 'vanilla')).toBe('/docs/viewer/vanilla');
  });

  it('goes to React in a headless link, as headless has no plain-HTML version', () => {
    expect(frameworkHref('/docs/headless/text/search', 'vanilla')).toBe(
      '/docs/headless/react/text/search',
    );
  });

  it('leaves a link that names its framework, and other links, as written', () => {
    expect(frameworkHref('/docs/viewer/react/setup', 'vanilla')).toBe('/docs/viewer/react/setup');
    expect(frameworkHref('/docs/engine/fonts', 'vanilla')).toBe('/docs/engine/fonts');
    expect(frameworkHref('/docs/headless/text/search', 'vue')).toBe(
      '/docs/headless/vue/text/search',
    );
  });
});
