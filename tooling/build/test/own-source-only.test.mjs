import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { foreignModules, ownSourceOnly } from '../src/own-source-only.mjs';

const repo = path.join(path.sep, 'repo');
const react = path.join(repo, 'packages/framework/react');
const nodeModules = (file) => path.join(repo, 'node_modules/.pnpm/x@1/node_modules', file);

test("keeps the package's own files and virtual modules", () => {
  const ids = [
    path.join(react, 'src/index.ts'),
    path.join(react, 'src/form.d.ts'),
    // A file the package's build script writes, like the engine's worker source.
    path.join(react, 'workers/worker.source.js'),
    '\0rolldown/runtime.js',
  ];
  assert.deepEqual(foreignModules(react, ids), []);
});

test('flags another workspace package and an unlisted node_modules package', () => {
  const engine = path.join(repo, 'packages/engine/core/dist/AnnotationList-czskwLU3.d.ts');
  const zod = nodeModules('zod/index.d.cts');
  // A sibling package whose folder name starts like this one's is another package.
  const lookalike = path.join(repo, 'packages/framework/react-native/src/index.ts');
  // So is a dependency installed under the package's own node_modules.
  const installed = path.join(react, 'node_modules/zod/index.d.cts');
  const ids = [engine, zod, lookalike, installed];
  assert.deepEqual(foreignModules(react, ids), ids);
});

test('keeps a package listed in epdf.bundle, scoped names included', () => {
  const quickjs = nodeModules('@jitl/quickjs-wasmfile-release-sync/dist/index.mjs');
  const zod = nodeModules('zod/index.d.cts');
  assert.deepEqual(foreignModules(react, [quickjs, zod], ['@jitl/quickjs-wasmfile-release-sync']), [
    zod,
  ]);
});

test('the plugin fails the build and names each copied file', () => {
  const plugin = ownSourceOnly({ name: '@embedpdf/react' }, react);
  const engine = path.join(repo, 'packages/engine/core/dist/AnnotationList-czskwLU3.d.ts');
  const output = {
    'form.d.ts': { type: 'chunk', fileName: 'form.d.ts', moduleIds: [path.join(react, 'src/form.ts')] },
    'copy.d.ts': { type: 'chunk', fileName: 'copy-x.d.ts', moduleIds: [engine] },
    'form.css': { type: 'asset', fileName: 'form.css' },
  };
  const context = {
    error(message) {
      throw new Error(message);
    },
  };
  assert.throws(
    () => plugin.generateBundle.call(context, {}, output),
    /@embedpdf\/react copies another package's files into dist:\n {2}dist\/copy-x\.d\.ts <- \.\.\/\.\.\/engine\/core\/dist\/AnnotationList-czskwLU3\.d\.ts\n/,
  );
  assert.doesNotThrow(() => plugin.generateBundle.call(context, {}, { 'form.d.ts': output['form.d.ts'] }));
});
