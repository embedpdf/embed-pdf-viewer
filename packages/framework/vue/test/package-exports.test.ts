// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The entries are listed twice in package.json: `exports` points the
 * workspace at the source, `publishConfig.exports` points the published
 * package at the build. Adding an entry means adding both lines. Each build
 * has its declarations next to it (`stage.d.ts` for `stage.js`, `stage.d.cts`
 * for `stage.cjs`), where TypeScript finds them, as in the React package.
 */
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
  publishConfig: { exports: Record<string, unknown> };
};

describe('package entries', () => {
  it('publishes every source entry from the build, under the same name', () => {
    const built = (name: string) => ({
      import: `./dist/${name}.js`,
      require: `./dist/${name}.cjs`,
    });
    for (const [subpath, source] of Object.entries(manifest.exports)) {
      if (subpath === './package.json') continue;
      const name = subpath === '.' ? 'index' : subpath.slice(2);
      expect(source).toBe(`./src/${name}.ts`);
      expect(manifest.publishConfig.exports[subpath]).toEqual(built(name));
    }
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(
      Object.keys(manifest.exports).sort(),
    );
  });
});
