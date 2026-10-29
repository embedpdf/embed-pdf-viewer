import { describe, expect, it } from 'vitest';

import { applyInstallChannel, remarkInstallChannel } from '../mdx/install-channel.mjs';

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

  describe('CDN URLs', () => {
    const viewer = 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js';
    const cloud = 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js';

    it("replaces the train's major with the channel, on any line", () => {
      const code = [
        `<script type="module">`,
        `  import EmbedPDF from '${viewer}';`,
        `  import CloudPDF from "${cloud}";`,
        `</script>`,
        `<script src="https://unpkg.com/@embedpdf/viewer@3/dist/embedpdf.js"></script>`,
      ].join('\n');

      expect(applyInstallChannel(code, 'next')).toBe(
        [
          `<script type="module">`,
          `  import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@next/dist/embedpdf.js';`,
          `  import CloudPDF from "https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@next/dist/cloudpdf.js";`,
          `</script>`,
          `<script src="https://unpkg.com/@embedpdf/viewer@next/dist/embedpdf.js"></script>`,
        ].join('\n'),
      );
    });

    it('stamps a URL with no path after the version', () => {
      expect(
        applyInstallChannel(`import 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3';`, 'next'),
      ).toBe(`import 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@next';`);
    });

    it('leaves an older major as written: the 2.x snippet is not the train', () => {
      const v2 = 'https://cdn.jsdelivr.net/npm/@embedpdf/snippet@2/dist/embedpdf.js';
      expect(applyInstallChannel(`| \`${v2}\` | \`${viewer}\` |`, 'next')).toBe(
        `| \`${v2}\` | \`https://cdn.jsdelivr.net/npm/@embedpdf/viewer@next/dist/embedpdf.js\` |`,
      );
    });

    it('leaves exact versions, other majors and tags alone', () => {
      const code = [
        'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3.0.0/dist/embedpdf.js',
        'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3.0.0-next.4/dist/embedpdf.js',
        'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@30/dist/embedpdf.js',
        'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@beta/dist/embedpdf.js',
      ].join('\n');
      expect(applyInstallChannel(code, 'next')).toBe(code);
    });

    it('never touches foreign packages or other hosts', () => {
      const code = [
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3/build/pdf.mjs',
        'https://cdn.jsdelivr.net/npm/@other/viewer@3/dist/viewer.js',
        'https://example.com/npm/@embedpdf/viewer@3/dist/embedpdf.js',
      ].join('\n');
      expect(applyInstallChannel(code, 'next')).toBe(code);
    });

    it("channel 'latest' is the identity — the major already resolves to the release", () => {
      expect(applyInstallChannel(`import EmbedPDF from '${viewer}';`, 'latest')).toBe(
        `import EmbedPDF from '${viewer}';`,
      );
    });

    it('is idempotent: a stamped URL stays as it is', () => {
      const once = applyInstallChannel(`import EmbedPDF from '${viewer}';`, 'next');
      expect(applyInstallChannel(once, 'next')).toBe(once);
    });
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

    expect((tree.children[0] as { value: string }).value).toBe('npm install @embedpdf/react@next');
    // Prose is not code; the plugin only visits code nodes.
    expect((tree.children[1].children?.[0] as { value: string }).value).toBe(
      'npm install @embedpdf/react',
    );
  });

  it('stamps inline code as a remark plugin: a CDN URL in a table cell', () => {
    const url = 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@3/dist/embedpdf.js';
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'inlineCode', value: url }] },
        { type: 'paragraph', children: [{ type: 'text', value: url }] },
      ],
    };

    remarkInstallChannel({ channel: 'next' })(tree);

    expect(tree.children[0].children[0].value).toBe(
      'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@next/dist/embedpdf.js',
    );
    expect(tree.children[1].children[0].value).toBe(url);
  });
});
