import { describe, expect, it } from 'vitest';

import { collectSampleFiles } from './docs-samples';

describe('collectSampleFiles', () => {
  it('collects every ready-made Viewer integration, including Vanilla JS', () => {
    const files = collectSampleFiles('viewer/getting-started/basic');

    expect(Object.keys(files)).toEqual(['vanilla', 'react', 'vue', 'svelte', 'angular']);
    expect(files.vanilla?.[0]?.filename).toBe('basic.html');
    expect(files.react?.[0]?.filename).toBe('basic.tsx');
  });
});
