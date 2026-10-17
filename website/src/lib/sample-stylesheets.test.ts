import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { scopeStylesheet, stylesheetKey } from './sample-stylesheets';

describe("an example's stylesheet in a demo", () => {
  it('scopes every rule to its example, and the page root to the example itself', () => {
    const css = scopeStylesheet(
      ':root { --accent: red; }\n.toolbar, .button:hover { color: var(--accent); }',
      'epdf-example--search-basic',
    );

    expect(css).toContain('.epdf-example--search-basic { --accent: red; }');
    expect(css).toContain(
      '.epdf-example--search-basic .toolbar, .epdf-example--search-basic .button:hover {',
    );
  });

  it('leaves the steps of an animation alone', () => {
    const css = scopeStylesheet(
      '@keyframes spin { from { rotate: 0deg; } to { rotate: 360deg; } }',
      'scope',
    );

    expect(css).toBe('@keyframes spin { from { rotate: 0deg; } to { rotate: 360deg; } }');
  });

  it('belongs to its example, whichever framework uses it', () => {
    const samples = path.join('/site', 'src', 'samples');

    expect(stylesheetKey(samples, path.join(samples, 'search', 'basic.css'))).toBe('search/basic');
    expect(stylesheetKey(samples, path.join(samples, 'search', 'basic.vue', 'extra.css'))).toBe(
      'search/basic',
    );
  });
});
