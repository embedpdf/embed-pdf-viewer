import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { remarkEngineAxis } from '../mdx/remark-engine-axis.mjs';

function compile(source: string, engine: 'local' | 'cloud'): string {
  return unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkEngineAxis, { engine })
    .use(remarkStringify)
    .processSync(source)
    .toString();
}

const PAGE = `
Shared intro prose.

<Engine local>
Install the wasm engine.
</Engine>

<Engine cloud>
Point the engine at your deployment.
</Engine>

Shared outro prose.
`;

describe('remarkEngineAxis', () => {
  it('keeps and unwraps the matching flavor', () => {
    const local = compile(PAGE, 'local');
    expect(local).toContain('Install the wasm engine.');
    expect(local).not.toMatch(/<Engine[\s>]/);
    expect(local).not.toContain('Point the engine at your deployment.');
  });

  it('removes an unmatched block without a trace — pointers are authored, never generated', () => {
    const local = compile(PAGE, 'local');
    expect(local).not.toContain('Point the engine at your deployment.');
    expect(local).not.toMatch(/<Engine[\s>]/);
  });

  it('renders the other flavor inline on its own site', () => {
    const cloud = compile(PAGE, 'cloud');
    expect(cloud).toContain('Point the engine at your deployment.');
    expect(cloud).not.toContain('Install the wasm engine.');
  });

  it('drops an unmatched block entirely', () => {
    const source = `<Engine cloud>\nCloud-only aside.\n</Engine>\n\nKept.\n`;
    const local = compile(source, 'local');
    expect(local).not.toContain('Cloud-only aside.');
    expect(local).toContain('Kept.');
  });

  it('supports the only="…" spelling and multiple flavors', () => {
    const source = `<Engine only="local cloud">\nEverywhere.\n</Engine>\n`;
    expect(compile(source, 'local')).toContain('Everywhere.');
    expect(compile(source, 'cloud')).toContain('Everywhere.');
  });

  it('handles nested engine blocks after unwrapping', () => {
    const source = `<Engine cloud>\nOuter.\n\n<Engine cloud>\nInner.\n</Engine>\n</Engine>\n`;
    const cloud = compile(source, 'cloud');
    expect(cloud).toContain('Outer.');
    expect(cloud).toContain('Inner.');
    expect(cloud).not.toMatch(/<Engine[\s>]/);
  });

  it('rejects a flavorless block loudly', () => {
    expect(() => compile('<Engine>\nOops.\n</Engine>\n', 'local')).toThrow(/needs a flavor/);
  });

  it('rejects a bad binding loudly', () => {
    expect(() =>
      unified()
        .use(remarkParse)
        .use(remarkMdx)
        // @ts-expect-error — exercising the runtime guard
        .use(remarkEngineAxis, { engine: 'hybrid' })
        .use(remarkStringify)
        .processSync('x'),
    ).toThrow(/must be 'local' or 'cloud'/);
  });
});
