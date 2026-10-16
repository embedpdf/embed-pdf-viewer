import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readCodePanel, routeCodePanels } from '@embedpdf/docs-kit/mdx/code-panels';
import { afterAll, describe, expect, it } from 'vitest';

import { rehypeCodeExample } from './rehype-code-example';
import { remarkCodeExample } from './remark-code-example';

const panelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-code-panels-'));
afterAll(() => fs.rmSync(panelsDir, { recursive: true, force: true }));

/** Runs one `<Example>` / `<Snippet>` node through the site's MDX passes, as the compile does. */
async function compile(element: 'Example' | 'Snippet', name: string) {
  const node = {
    type: 'mdxJsxFlowElement',
    name: element,
    attributes: [{ type: 'mdxJsxAttribute', name: 'name', value: name }],
    children: [],
  };
  const tree = { type: 'root', children: [node] };
  remarkCodeExample()(tree);
  await rehypeCodeExample({ panelsDir })(tree);
  const attribute = (key: string) =>
    node.attributes.find((attr) => attr.name === key)?.value as string | undefined;
  return { names: node.attributes.map((attr) => attr.name), attribute };
}

describe('code example pipeline', () => {
  it('stores every Viewer integration, and leaves the page only a reference', async () => {
    const { names, attribute } = await compile('Example', 'viewer/quick-start/customized');

    // No code in the compiled page: just where it is, who has a version, and which have a demo
    // (once the demos are built).
    expect(names.filter((name) => name !== 'demosByFramework')).toEqual([
      'name',
      'codeKey',
      'codeFrameworks',
    ]);
    expect(attribute('codeKey')).toMatch(/^viewer\/quick-start\/customized\.[0-9a-f]{16}$/);
    expect(attribute('codeFrameworks')).toBe('vanilla,react,vue,svelte,angular');

    for (const framework of ['vanilla', 'react', 'vue', 'svelte', 'angular']) {
      const files = readCodePanel(panelsDir, attribute('codeKey')!, framework);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].highlightedCode).toContain('<span');
    }
    // Highlighting every framework's sample with a cold highlighter is real work: ~10s alone, past
    // 50s in CI, where turbo runs every package's tests at once.
  }, 120_000);

  it("keeps the page's bigger preview for the card", async () => {
    const node = {
      type: 'mdxJsxFlowElement',
      name: 'Example',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'name', value: 'viewer/quick-start/customized' },
        { type: 'mdxJsxAttribute', name: 'size', value: 'wide' },
      ],
      children: [],
    };
    const tree = { type: 'root', children: [node] };
    remarkCodeExample()(tree);
    await rehypeCodeExample({ panelsDir })(tree);

    expect(node.attributes.find((attr) => attr.name === 'size')?.value).toBe('wide');
  }, 30_000);

  it('stores every Viewer integration of a Viewer snippet', async () => {
    const { attribute } = await compile('Snippet', 'viewer/start/first');

    expect(attribute('codeFrameworks')).toBe('vanilla,react,vue,svelte,angular');
    const files = readCodePanel(panelsDir, attribute('codeKey')!, 'vanilla');
    expect(files[0].highlightedCode).toContain('embedpdf-viewer');
  }, 30_000);

  it("reads back only the route's framework", async () => {
    const { attribute } = await compile('Example', 'viewer/quick-start/customized');
    const shown = routeCodePanels({
      dir: panelsDir,
      codeKey: attribute('codeKey'),
      codeFrameworks: attribute('codeFrameworks'),
      demosByFramework: attribute('demosByFramework'),
      framework: 'vue',
    });

    expect(Object.keys(shown.filesByFramework)).toEqual(['vue']);
    expect(shown.filesByFramework.vue.some((file) => file.filename.endsWith('.vue'))).toBe(true);
    expect(shown.available).toEqual(['vanilla', 'react', 'vue', 'svelte', 'angular']);
  }, 30_000);

  it('stores a snippet under its own name, apart from an example of the same name', async () => {
    const snippet = await compile('Snippet', 'search/search-box');
    expect(snippet.attribute('codeKey')).toMatch(/^snippets\/search\/search-box\.[0-9a-f]{16}$/);
    expect(snippet.attribute('codeFrameworks')).toBe('react,vue,svelte,angular');
    // A snippet is code only: never a live demo.
    expect(snippet.names).not.toContain('demosByFramework');
  }, 30_000);
});
