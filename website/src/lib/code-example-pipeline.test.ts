import { describe, expect, it } from 'vitest';

import { rehypeCodeExample } from './rehype-code-example';
import { remarkCodeExample } from './remark-code-example';

describe('code example pipeline', () => {
  it('preserves every Viewer integration through highlighting', async () => {
    const example = {
      type: 'mdxJsxFlowElement',
      name: 'Example',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'name', value: 'viewer/getting-started/basic' },
      ],
      children: [],
    };
    const tree = { type: 'root', children: [example] };

    remarkCodeExample()(tree);
    await rehypeCodeExample()(tree);

    const value = example.attributes.find(
      (attribute) => attribute.name === 'filesByFramework',
    )?.value;
    expect(typeof value).toBe('string');
    expect(Object.keys(JSON.parse(value as string))).toEqual([
      'vanilla',
      'react',
      'vue',
      'svelte',
      'angular',
    ]);
  });
});
