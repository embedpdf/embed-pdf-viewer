import { describe, expect, it } from 'vitest';

import { urlForSection } from './url';

describe('resolving an indexed section to a reader-specific URL', () => {
  it('inserts the reader integration into a fanned-out route', () => {
    expect(urlForSection('docs/headless/plugins/stage', 'zoom', 'vue')).toBe(
      '/docs/headless/vue/plugins/stage#zoom',
    );
    expect(urlForSection('docs/viewer/getting-started', 'installation', 'angular')).toBe(
      '/docs/viewer/angular/getting-started#installation',
    );
  });

  it('falls back to React rather than linking a Headless page to Vanilla', () => {
    expect(urlForSection('docs/headless/plugins/stage', null, 'vanilla')).toBe(
      '/docs/headless/react/plugins/stage',
    );
  });

  it('leaves integration-less products alone', () => {
    expect(urlForSection('docs/engine/getting-started', 'fallback-fonts', 'react')).toBe(
      '/docs/engine/getting-started#fallback-fonts',
    );
  });

  it('uses the product default when the reader has no preference', () => {
    expect(urlForSection('docs/headless/plugins/stage', 'zoom', null)).toBe(
      '/docs/headless/plugins/stage#zoom',
    );
  });

  it('omits the fragment for a page lede', () => {
    expect(urlForSection('docs/headless/plugins/stage', null, 'svelte')).toBe(
      '/docs/headless/svelte/plugins/stage',
    );
  });
});
