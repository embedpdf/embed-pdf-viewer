/**
 * How the snippet check runs its compilers.
 *
 *   node --test docs/content/scripts/*.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { childCompilersAtOnce } from './compile.mjs';
import { compileSideBySide } from './snippets.mjs';

const GB = 1024 ** 3;

describe('the compilers that run at once', () => {
  it('are as many as half the memory holds, and always one', () => {
    assert.deepEqual(
      [1, 4, 8, 16, 32].map((memory) => childCompilersAtOnce(memory * GB)),
      [1, 1, 2, 5, 10],
    );
  });

  it('never go over the limit, and every job reports to its own group', async () => {
    let running = 0;
    let most = 0;
    const job = (framework, name) => ({
      framework,
      run: async () => {
        const child = framework === 'vue' || framework === 'svelte';
        if (child) most = Math.max(most, ++running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (child) running -= 1;
        return `${name} ${framework}`;
      },
    });
    const group = (name) => ['react', 'vue', 'svelte', 'angular'].map((f) => job(f, name));

    const results = await compileSideBySide([group('headless'), group('viewer')], 2);

    assert.equal(most, 2);
    assert.deepEqual(results, [
      {
        react: 'headless react',
        vue: 'headless vue',
        svelte: 'headless svelte',
        angular: 'headless angular',
      },
      {
        react: 'viewer react',
        vue: 'viewer vue',
        svelte: 'viewer svelte',
        angular: 'viewer angular',
      },
    ]);
  });
});
