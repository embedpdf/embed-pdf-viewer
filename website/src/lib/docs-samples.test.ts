import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectSampleFiles } from './docs-samples';
import { discoverSampleVariants } from './sample-discovery';

/**
 * A site with one example in every framework's form: React and Vue as one file, Svelte as a
 * directory with its entry first, Angular as one file, all sharing `demo.css`.
 */
function siteWithEveryFramework(): string {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'epdf-docs-samples-'));
  const area = path.join(site, 'src', 'samples', 'area');
  const files: Record<string, string> = {
    'demo.react.tsx': "import './demo.css';\nexport default function App() { return null; }\n",
    'demo.vue.vue': '<script setup lang="ts">\nimport \'./demo.css\';\n</script>\n',
    'demo.svelte/App.svelte': '<script lang="ts">\n  import \'../demo.css\';\n</script>\n',
    'demo.svelte/Toolbar.svelte': '<div class="toolbar"></div>\n',
    'demo.angular.ts':
      "@Component({ selector: 'demo-root', styleUrl: './demo.css' })\nexport class App {}\n",
    'demo.css': '.toolbar { display: flex; }\n',
  };
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(area, file)), { recursive: true });
    fs.writeFileSync(path.join(area, file), contents);
  }
  return site;
}

describe('collectSampleFiles', () => {
  it('collects every ready-made Viewer integration, including Vanilla JS', () => {
    const files = collectSampleFiles('viewer/quick-start/customized');

    expect(Object.keys(files)).toEqual(['vanilla', 'react', 'vue', 'svelte', 'angular']);
    expect(files.vanilla?.[0]?.filename).toBe('customized.html');
    expect(files.vanilla?.[0]?.language).toBe('html');
    expect(files.react?.[0]?.filename).toBe('customized.tsx');
  });

  it("shows an example's stylesheet as a tab after its entry", () => {
    const files = collectSampleFiles('search/basic');

    expect(files.react?.map((file) => file.filename)).toEqual(['basic.tsx', 'basic.css']);
    expect(files.react?.[1]?.language).toBe('css');
  });

  it('adds the stylesheet only to the frameworks the example is written for', () => {
    // An example written for React only: its stylesheet makes no Vue version appear.
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'epdf-docs-samples-'));
    try {
      const area = path.join(site, 'src', 'samples', 'area');
      fs.mkdirSync(area, { recursive: true });
      fs.writeFileSync(path.join(area, 'solo.react.tsx'), "import './solo.css';\n");
      fs.writeFileSync(path.join(area, 'solo.css'), '.toolbar { display: flex; }\n');
      vi.spyOn(process, 'cwd').mockReturnValue(site);

      const files = collectSampleFiles('area/solo');

      expect(files.react?.map((file) => file.filename)).toEqual(['solo.tsx', 'solo.css']);
      expect(files.vue).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(site, { recursive: true, force: true });
    }
  });

  it('leaves an example without a stylesheet as it is', () => {
    const files = collectSampleFiles('snippets/search/search-box');

    expect(files.react?.map((file) => file.filename)).toEqual(['search-box.tsx']);
  });
});

describe('one example in every framework', () => {
  let site: string | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    if (site) fs.rmSync(site, { recursive: true, force: true });
  });

  it("shows each framework's files with the shared stylesheet after the entry", () => {
    site = siteWithEveryFramework();
    vi.spyOn(process, 'cwd').mockReturnValue(site);

    const files = collectSampleFiles('area/demo');
    const names = (variant: keyof typeof files) => files[variant]?.map((file) => file.filename);

    expect(names('react')).toEqual(['demo.tsx', 'demo.css']);
    expect(names('vue')).toEqual(['demo.vue', 'demo.css']);
    expect(names('svelte')).toEqual(['App.svelte', 'demo.css', 'Toolbar.svelte']);
    expect(names('angular')).toEqual(['demo.ts', 'demo.css']);
    expect(files.vanilla).toBeUndefined();
    expect(files.vue?.[0]?.language).toBe('vue');
    expect(files.svelte?.[0]?.language).toBe('svelte');
    expect(files.angular?.[0]?.language).toBe('typescript');
  });

  it('builds a demo of each, mounting the entry of a directory', () => {
    site = siteWithEveryFramework();
    const samples = path.join(site, 'src', 'samples');

    const demos = discoverSampleVariants(samples, ['react', 'vue', 'svelte', 'angular']);

    expect(demos.map(({ name, fw, entry }) => [name, fw, path.relative(samples, entry)])).toEqual(
      expect.arrayContaining([
        ['area/demo.react', 'react', path.join('area', 'demo.react.tsx')],
        ['area/demo.vue', 'vue', path.join('area', 'demo.vue.vue')],
        ['area/demo.svelte', 'svelte', path.join('area', 'demo.svelte', 'App.svelte')],
        ['area/demo.angular', 'angular', path.join('area', 'demo.angular.ts')],
      ]),
    );
    expect(demos).toHaveLength(4);
  });
});

describe("the ready-made viewer's examples", () => {
  let site: string | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    if (site) fs.rmSync(site, { recursive: true, force: true });
  });

  it('builds a demo of the plain-HTML page too, and of nothing that is only code', () => {
    site = fs.mkdtempSync(path.join(os.tmpdir(), 'epdf-docs-samples-'));
    const samples = path.join(site, 'src', 'samples');
    const files = [
      'viewer/start/first.vanilla.html',
      'viewer/start/first.react.tsx',
      'viewer/start/install.react.sh',
      'viewer/start/pages.vanilla/index.html',
      'snippets/viewer/start/first.react.tsx',
    ];
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(samples, file)), { recursive: true });
      fs.writeFileSync(path.join(samples, file), '\n');
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const demos = discoverSampleVariants(samples, ['react', 'vanilla']);

    expect(demos.map(({ name, fw }) => [name, fw]).sort()).toEqual([
      ['viewer/start/first.react', 'react'],
      ['viewer/start/first.vanilla', 'vanilla'],
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('a vanilla example is one file, pages.vanilla.html'),
    );
  });
});
