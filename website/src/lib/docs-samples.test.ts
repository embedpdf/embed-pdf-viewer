import { describe, expect, it } from 'vitest';

import { collectSampleFiles } from './docs-samples';

describe('collectSampleFiles', () => {
  it('collects every ready-made Viewer integration, including Vanilla JS', () => {
    const files = collectSampleFiles('viewer/getting-started/basic');

    expect(Object.keys(files)).toEqual(['vanilla', 'react', 'vue', 'svelte', 'angular']);
    expect(files.vanilla?.[0]?.filename).toBe('basic.html');
    expect(files.react?.[0]?.filename).toBe('basic.tsx');
  });

  it("shows an example's stylesheet as a tab after its entry", () => {
    const files = collectSampleFiles('search/basic');

    expect(files.react?.map((file) => file.filename)).toEqual(['basic.tsx', 'basic.css']);
    expect(files.react?.[1]?.language).toBe('css');
  });

  it('adds the stylesheet only to the frameworks the example is written for', () => {
    const files = collectSampleFiles('search/basic');

    expect(files.vue).toBeUndefined();
  });

  it('leaves an example without a stylesheet as it is', () => {
    const files = collectSampleFiles('snippets/search/search-box');

    expect(files.react?.map((file) => file.filename)).toEqual(['search-box.tsx']);
  });
});
