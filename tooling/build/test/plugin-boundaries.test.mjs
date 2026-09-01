import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkPluginBoundaries } from '../src/check-plugin-boundaries.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embedpdf-plugin-boundaries-'));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function pluginFiles(name, extra = {}) {
  return {
    [`packages/plugin/${name}/package.json`]: JSON.stringify({
      name: `@embedpdf/plugin-${name}`,
      exports: { '.': './src/index.ts', './contract': './src/contract.ts' },
    }),
    [`packages/plugin/${name}/src/index.ts`]: `export { ${name}Plugin } from './${name}.plugin';\nexport * from './contract';\n`,
    [`packages/plugin/${name}/src/${name}.plugin.ts`]: `export const ${name}Plugin = () => {};\n`,
    [`packages/plugin/${name}/src/contract.ts`]: `export { ${name}Token } from './types';\n`,
    [`packages/plugin/${name}/src/types.ts`]: `export const ${name}Token = Symbol('${name}');\n`,
    ...extra,
  };
}

test('accepts contract imports and explicit framework feature implementation entries', (t) => {
  const root = fixture({
    ...pluginFiles('alpha'),
    ...pluginFiles('beta', {
      'packages/plugin/beta/src/beta.plugin.ts':
        `import { alphaToken } from '@embedpdf/plugin-alpha/contract';\n` +
        `export const betaPlugin = () => alphaToken;\n`,
    }),
    'packages/framework/react/src/alpha.tsx':
      `export * from '@embedpdf/plugin-alpha';\n` +
      `import { alphaToken } from '@embedpdf/plugin-alpha';\n` +
      `export const token = alphaToken;\n`,
    'packages/framework/react/src/beta-control.tsx':
      `import { alphaToken } from '@embedpdf/plugin-alpha/contract';\n` +
      `export const token = alphaToken;\n`,
    'examples/viewer.ts':
      `import { alphaPlugin, alphaToken } from '@embedpdf/plugin-alpha';\n` +
      `export const plugins = [alphaPlugin(), alphaToken];\n`,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(checkPluginBoundaries({ repoRoot: root }), []);
});

test('rejects bare sibling roots in plugin and framework source', (t) => {
  const root = fixture({
    ...pluginFiles('alpha'),
    ...pluginFiles('beta', {
      'packages/plugin/beta/src/beta.plugin.ts':
        `import type { Alpha } from '@embedpdf/plugin-alpha';\n` +
        `export const betaPlugin = (): Alpha | null => null;\n`,
    }),
    'packages/framework/react/src/menu.tsx':
      `import { alphaToken } from '@embedpdf/plugin-alpha';\n` +
      `export const token = alphaToken;\n`,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const messages = checkPluginBoundaries({ repoRoot: root }).map((item) => item.message);
  assert.equal(messages.length, 2);
  assert(messages.some((message) => message.includes('plugin source imports implementation entry')));
  assert(messages.some((message) => message.includes('framework source imports sibling')));
});

test('rejects sibling internal entries while allowing an owning framework feature', (t) => {
  const root = fixture({
    ...pluginFiles('alpha'),
    ...pluginFiles('beta', {
      'packages/plugin/beta/src/beta.plugin.ts':
        `import { alphaToken } from '@embedpdf/plugin-alpha/internal';\n` +
        `export const betaPlugin = () => alphaToken;\n`,
    }),
    'packages/framework/react/src/alpha.tsx':
      `export * from '@embedpdf/plugin-alpha';\n` +
      `import { alphaToken } from '@embedpdf/plugin-alpha/internal';\n` +
      `export const token = alphaToken;\n`,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const violations = checkPluginBoundaries({ repoRoot: root });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /plugin source imports implementation entry/);
});

test('requires consumer implementation roots to be explicit plugin-factory opt-ins', (t) => {
  const root = fixture({
    ...pluginFiles('alpha'),
    'examples/control.ts':
      `import type { Alpha } from '@embedpdf/plugin-alpha';\n` +
      `export const control: Alpha | null = null;\n`,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const violations = checkPluginBoundaries({ repoRoot: root });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /without opting in via its plugin factory/);
});

test('rejects a second capability token declared by a contract entry', (t) => {
  const root = fixture({
    ...pluginFiles('alpha', {
      'packages/plugin/alpha/src/contract.ts':
        `import { createCapabilityToken } from '@embedpdf/core';\n` +
        `export const alphaToken = createCapabilityToken('alpha');\n`,
    }),
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const violations = checkPluginBoundaries({ repoRoot: root });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /never create a second token/);
});

test('rejects implementation modules reachable from a contract entry', (t) => {
  const root = fixture({
    ...pluginFiles('alpha', {
      'packages/plugin/alpha/src/contract.ts': `export { createAlphaCapability } from './capability';\n`,
      'packages/plugin/alpha/src/capability.ts': `export const createAlphaCapability = () => {};\n`,
    }),
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const violations = checkPluginBoundaries({ repoRoot: root });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /contract runtime graph reaches implementation module/);
});
