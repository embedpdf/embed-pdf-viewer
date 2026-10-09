import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  codePanelAttributes,
  openCodePanels,
  readCodePanel,
  routeCodePanels,
  withCodePanelsCache,
  writeCodePanels,
} from '../mdx/code-panels.mjs';

const file = (filename: string, code: string) => ({
  filename,
  code,
  language: 'tsx',
  highlightedCode: `<span>${code}</span>`,
});

const byFramework = {
  react: [file('basic.tsx', 'react code'), file('basic.css', '.demo {}')],
  vue: [file('App.vue', 'vue code'), file('basic.css', '.demo {}')],
  svelte: [],
};

let site: string;
let dir: string;

beforeEach(() => {
  site = fs.mkdtempSync(path.join(os.tmpdir(), 'code-panels-'));
  dir = path.join(site, '.next/cache/docs-code');
});

afterEach(() => {
  fs.rmSync(site, { recursive: true, force: true });
});

describe('writeCodePanels', () => {
  it('writes one file per framework that has files, under the sample name and a content hash', () => {
    const ref = writeCodePanels(dir, 'search/basic', byFramework);

    expect(ref.frameworks).toEqual(['react', 'vue']);
    expect(ref.key).toMatch(/^search\/basic\.[0-9a-f]{16}$/);
    expect(fs.readdirSync(path.join(dir, 'search')).sort()).toEqual([
      `${path.basename(ref.key)}.react.json`,
      `${path.basename(ref.key)}.vue.json`,
    ]);
  });

  it('gives changed code a new key, and the same code the same key', () => {
    const first = writeCodePanels(dir, 'search/basic', byFramework);
    const again = writeCodePanels(dir, 'search/basic', byFramework);
    const changed = writeCodePanels(dir, 'search/basic', {
      ...byFramework,
      vue: [file('App.vue', 'changed vue code')],
    });

    expect(again.key).toBe(first.key);
    expect(changed.key).not.toBe(first.key);
    // The old key still reads its own code: a page compiled against it never sees the new one.
    expect(readCodePanel(dir, first.key, 'vue')[0].code).toBe('vue code');
    expect(readCodePanel(dir, changed.key, 'vue')[0].code).toBe('changed vue code');
  });

  it('points the compiled page at the files with two small attributes', () => {
    const ref = writeCodePanels(dir, 'snippets/search/box', byFramework);
    expect(codePanelAttributes(ref)).toEqual([
      { type: 'mdxJsxAttribute', name: 'codeKey', value: ref.key },
      { type: 'mdxJsxAttribute', name: 'codeFrameworks', value: 'react,vue' },
    ]);
  });
});

describe('routeCodePanels', () => {
  const demos = JSON.stringify({ react: '/demos/react.js', vue: '/demos/vue.js' });

  it("reads only the route's framework, and lists every framework that has a version", () => {
    const { key, frameworks } = writeCodePanels(dir, 'search/basic', byFramework);
    const shown = routeCodePanels({
      dir,
      codeKey: key,
      codeFrameworks: frameworks.join(','),
      demosByFramework: demos,
      framework: 'vue',
    });

    expect(Object.keys(shown.filesByFramework)).toEqual(['vue']);
    expect(shown.filesByFramework.vue.map((f) => f.filename)).toEqual(['App.vue', 'basic.css']);
    expect(shown.demosByFramework).toEqual({ vue: '/demos/vue.js' });
    expect(shown.available).toEqual(['react', 'vue']);
  });

  it('shows nothing for a framework without a version, so the page shows the note', () => {
    const { key, frameworks } = writeCodePanels(dir, 'search/basic', byFramework);
    const shown = routeCodePanels({
      dir,
      codeKey: key,
      codeFrameworks: frameworks.join(','),
      demosByFramework: demos,
      framework: 'svelte',
    });

    expect(shown.filesByFramework).toEqual({});
    expect(shown.demosByFramework).toEqual({});
    expect(shown.available).toEqual(['react', 'vue']);
  });

  it('gives a route without a framework every version', () => {
    const { key, frameworks } = writeCodePanels(dir, 'search/basic', byFramework);
    const shown = routeCodePanels({
      dir,
      codeKey: key,
      codeFrameworks: frameworks.join(','),
      demosByFramework: demos,
      framework: null,
    });

    expect(Object.keys(shown.filesByFramework)).toEqual(['react', 'vue']);
    expect(shown.demosByFramework).toEqual(JSON.parse(demos));
  });

  it('handles an example no framework has yet', () => {
    const ref = writeCodePanels(dir, 'search/missing', {});
    const shown = routeCodePanels({
      dir,
      codeKey: ref.key,
      codeFrameworks: ref.frameworks.join(','),
      framework: 'react',
    });
    expect(shown).toEqual({ filesByFramework: {}, demosByFramework: {}, available: [] });
  });

  it('throws when the store lacks a file the page points at, instead of hiding the code', () => {
    const { key } = writeCodePanels(dir, 'search/basic', byFramework);
    expect(() =>
      routeCodePanels({ dir, codeKey: key, codeFrameworks: 'react,angular', framework: 'angular' }),
    ).toThrow(/No angular code/);
  });

  it('refuses a key that could leave the store', () => {
    expect(() => readCodePanel(dir, '../../etc/passwd.0123456789abcdef', 'react')).toThrow(
      /Not a code panel key/,
    );
  });
});

describe('openCodePanels', () => {
  const samples = () => path.join(site, 'src/samples');
  const writeSample = (code: string) => {
    fs.mkdirSync(samples(), { recursive: true });
    fs.writeFileSync(path.join(samples(), 'basic.react.tsx'), code);
  };
  const open = () =>
    openCodePanels({ siteRoot: site, inputs: ['src/samples', 'public/demos/demos-manifest.json'] });

  it('keeps the store, and its version, while the inputs are the same', () => {
    writeSample('one');
    const first = open();
    const ref = writeCodePanels(first.dir, 'search/basic', byFramework);
    const second = open();

    expect(second.dir).toBe(dir);
    expect(second.cacheVersion).toBe(first.cacheVersion);
    expect(readCodePanel(dir, ref.key, 'react')).toHaveLength(2);
  });

  it('starts the store over, with a new version, when a sample changed', () => {
    writeSample('one');
    const first = open();
    const ref = writeCodePanels(first.dir, 'search/basic', byFramework);
    writeSample('two');
    const second = open();

    expect(second.cacheVersion).not.toBe(first.cacheVersion);
    expect(() => readCodePanel(dir, ref.key, 'react')).toThrow(/No react code/);
  });

  it('never reuses a version after the store was deleted, even for the same samples', () => {
    writeSample('one');
    const first = open();
    fs.rmSync(dir, { recursive: true, force: true });
    const second = open();

    // Same inputs, new generation: a page cached against the deleted store compiles again.
    expect(second.cacheVersion.split(':')[1]).toBe(first.cacheVersion.split(':')[1]);
    expect(second.cacheVersion).not.toBe(first.cacheVersion);
  });

  it("folds the version into webpack's persistent cache only", () => {
    const panels = { cacheVersion: 'docs-code:abc:def' };
    expect(withCodePanelsCache({ cache: { type: 'filesystem', version: 'v1' } }, panels)).toEqual({
      cache: { type: 'filesystem', version: 'v1|docs-code:abc:def' },
    });
    expect(withCodePanelsCache({ cache: false }, panels)).toEqual({ cache: false });
  });
});
