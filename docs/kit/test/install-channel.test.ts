import { describe, expect, it } from 'vitest';

import {
  applyInstallChannel,
  remarkInstallChannel,
} from '../mdx/install-channel.mjs';

describe('install-channel stamping', () => {
  it('tags every own-scope spec on an install line', () => {
    expect(applyInstallChannel('npm install @embedpdf/react @cloudpdf/engine', 'next')).toBe(
      'npm install @embedpdf/react@next @cloudpdf/engine@next',
    );
  });

  it('covers every package-manager verb', () => {
    expect(applyInstallChannel('npm i @embedpdf/engine', 'next')).toBe(
      'npm i @embedpdf/engine@next',
    );
    expect(applyInstallChannel('pnpm add @embedpdf/engine', 'next')).toBe(
      'pnpm add @embedpdf/engine@next',
    );
    expect(applyInstallChannel('yarn add @cloudpdf/sdk', 'next')).toBe(
      'yarn add @cloudpdf/sdk@next',
    );
    expect(applyInstallChannel('bun add @embedpdf/viewer', 'next')).toBe(
      'bun add @embedpdf/viewer@next',
    );
  });

  it('never touches third-party packages, even on the same line', () => {
    expect(applyInstallChannel('npm install vue @embedpdf/engine react-dom', 'next')).toBe(
      'npm install vue @embedpdf/engine@next react-dom',
    );
  });

  it('is idempotent: an already-tagged spec stays single-tagged', () => {
    const once = applyInstallChannel('npm install @embedpdf/react', 'next');
    expect(applyInstallChannel(once, 'next')).toBe(once);
  });

  it('tags the full package name, never a hyphenated prefix of it', () => {
    expect(applyInstallChannel('npm install @embedpdf/engine-core', 'next')).toBe(
      'npm install @embedpdf/engine-core@next',
    );
  });

  it('leaves import statements and prose lines alone', () => {
    const code = `import { localEngine } from '@embedpdf/engine';\nconst spec = '@embedpdf/engine';`;
    expect(applyInstallChannel(code, 'next')).toBe(code);
  });

  it("channel 'latest' is the identity — bare specs already mean latest", () => {
    const code = 'npm install @embedpdf/react';
    expect(applyInstallChannel(code, 'latest')).toBe(code);
  });

  it('only rewrites the install lines of a multi-line block', () => {
    const code = [
      '# add the SDK',
      'npm install @embedpdf/viewer',
      'echo "@embedpdf/viewer stays bare here"',
    ].join('\n');

    expect(applyInstallChannel(code, 'next')).toBe(
      [
        '# add the SDK',
        'npm install @embedpdf/viewer@next',
        'echo "@embedpdf/viewer stays bare here"',
      ].join('\n'),
    );
  });

  it('stamps fenced code nodes as a remark plugin', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'code', lang: 'sh', meta: 'npm2yarn', value: 'npm install @embedpdf/react' },
        { type: 'paragraph', children: [{ type: 'text', value: 'npm install @embedpdf/react' }] },
      ],
    };

    remarkInstallChannel({ channel: 'next' })(tree);

    expect((tree.children[0] as { value: string }).value).toBe(
      'npm install @embedpdf/react@next',
    );
    // Prose is not code; the plugin only visits code nodes.
    expect((tree.children[1].children?.[0] as { value: string }).value).toBe(
      'npm install @embedpdf/react',
    );
  });
});
