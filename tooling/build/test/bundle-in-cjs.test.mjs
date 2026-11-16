import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NOTICES_FILE,
  assertCommonJsHoldsThem,
  bundledNotices,
  commonJsImportsOf,
  noticesText,
  readBundledPackage,
} from '../src/bundle-in-cjs.mjs';

/** A folder of files, made for one test and removed after it. */
function folder(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epdf-bundle-in-cjs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return fs.realpathSync(root);
}

const manifest = (fields) => JSON.stringify(fields);

test('the notices list each package by name, with its version, license and text', () => {
  const text = noticesText('@embedpdf/core-signature', [
    { name: 'pkijs', version: '4.0.1', license: 'BSD-3-Clause', text: 'Copyright Peculiar' },
    { name: '@noble/hashes', version: '2.4.0', license: 'MIT', text: 'Copyright Paul' },
    { name: 'unlabelled', version: '1.0.0', license: null, text: 'Some terms' },
  ]);
  assert.match(text, /^Third-party notices for @embedpdf\/core-signature\n/);
  assert.ok(text.indexOf('@noble/hashes 2.4.0') < text.indexOf('pkijs 4.0.1'));
  assert.ok(text.indexOf('pkijs 4.0.1') < text.indexOf('unlabelled 1.0.0'));
  assert.match(text, /pkijs 4\.0\.1\nLicense: BSD-3-Clause\n=+\n\nCopyright Peculiar\n/);
  assert.match(text, /unlabelled 1\.0\.0\n=+\n\nSome terms\n/);
});

test('a bundled package is read with whichever license file it ships', (t) => {
  const root = folder(t, {
    'plain/package.json': manifest({ name: 'plain', version: '1.2.3', license: 'MIT' }),
    'plain/LICENSE': 'The terms\n',
    'marked/package.json': manifest({ name: '@scope/marked', version: '2.0.0' }),
    'marked/license.md': 'Other terms',
    'none/package.json': manifest({ name: 'none', version: '0.1.0', license: 'ISC' }),
  });
  assert.deepEqual(readBundledPackage(path.join(root, 'plain')), {
    name: 'plain',
    version: '1.2.3',
    license: 'MIT',
    text: 'The terms',
  });
  assert.deepEqual(readBundledPackage(path.join(root, 'marked')), {
    name: '@scope/marked',
    version: '2.0.0',
    license: null,
    text: 'Other terms',
  });
  assert.equal(readBundledPackage(path.join(root, 'none')).text, null);
});

test('the build writes the notices for what its CommonJS code holds, and only there', (t) => {
  const root = folder(t, {
    'pkg/src/index.ts': '',
    'node_modules/held/package.json': manifest({ name: 'held', version: '4.0.1', license: 'MIT' }),
    'node_modules/held/LICENSE': 'Held terms',
    'node_modules/held/build/index.js': '',
    'node_modules/@scope/also/package.json': manifest({ name: '@scope/also', version: '1.0.0' }),
    'node_modules/@scope/also/LICENSE.txt': 'Also terms',
    'node_modules/@scope/also/index.js': '',
    'node_modules/bare/package.json': manifest({ name: 'bare', version: '1.0.0' }),
    'node_modules/bare/index.js': '',
  });
  const packageDir = path.join(root, 'pkg');
  const own = path.join(packageDir, 'src/index.ts');
  const inModules = (file) => path.join(root, 'node_modules', file);
  const plugin = bundledNotices({ name: '@embedpdf/core-signature' }, packageDir);
  const run = (format, output) => {
    const emitted = [];
    const context = {
      emitFile: (file) => emitted.push(file),
      error(message) {
        throw new Error(message);
      },
    };
    plugin.generateBundle.call(context, { format }, output);
    return emitted;
  };
  const code = {
    type: 'chunk',
    fileName: 'index.cjs',
    moduleIds: [own, '\0rolldown/runtime.js', inModules('held/build/index.js'), inModules('@scope/also/index.js')],
  };

  const [notices] = run('cjs', { 'index.cjs': code });
  assert.equal(notices.fileName, NOTICES_FILE);
  assert.match(notices.source, /@scope\/also 1\.0\.0\n=+\n\nAlso terms\n/);
  assert.match(notices.source, /held 4\.0\.1\nLicense: MIT\n=+\n\nHeld terms\n/);

  // The ES module output holds nothing, and a build that holds nothing writes nothing.
  assert.deepEqual(run('es', { 'index.js': { ...code, fileName: 'index.js' } }), []);
  assert.deepEqual(run('cjs', { 'index.cjs': { ...code, moduleIds: [own] } }), []);

  // A package with no license file can't be held: there is nothing to copy.
  assert.throws(
    () => run('cjs', { 'index.cjs': { ...code, moduleIds: [inModules('bare/index.js')] } }),
    /holds bare in its CommonJS build, and bare ships no license file/,
  );
});

test('finds where the CommonJS side of dist still names a package', (t) => {
  const dist = folder(t, {
    'index.cjs': 'const a = require("pkijs");\nconst b = require("./chunk.cjs");\n',
    'chunk.cjs': 'const c = require("@noble/hashes/sha2.js");\nconst d = require("pkijs-tools");\n',
    'index.d.cts': 'import * as pkijs from "pkijs";\nimport type { X } from "@embedpdf/engine-core";\n',
    // The ES module side imports them, as it should.
    'index.js': 'import * as pkijs from "pkijs";\n',
    'index.d.ts': 'import * as pkijs from "pkijs";\n',
  });
  const found = commonJsImportsOf(dist, ['pkijs', '@noble/hashes']);
  assert.deepEqual(
    found.sort((left, right) => (left.file < right.file ? -1 : 1)),
    [
      { file: 'chunk.cjs', specifier: '@noble/hashes/sha2.js' },
      { file: 'index.cjs', specifier: 'pkijs' },
      { file: 'index.d.cts', specifier: 'pkijs' },
    ],
  );
});

test('a build whose CommonJS side still names a listed package fails', (t) => {
  const names = { epdf: { bundleInCjs: ['pkijs'] } };
  const packageDir = folder(t, {
    'package.json': manifest({ name: '@embedpdf/core-signature', ...names }),
    'dist/index.cjs': 'const a = require("pkijs");\n',
    [`dist/${NOTICES_FILE}`]: 'notices',
  });
  assert.throws(
    () => assertCommonJsHoldsThem(packageDir),
    /@embedpdf\/core-signature lists these in package\.json "epdf\.bundleInCjs", and the CommonJS side of dist still names them:\n {2}dist\/index\.cjs names pkijs/,
  );

  fs.writeFileSync(path.join(packageDir, 'dist/index.cjs'), 'const a = 1;\n');
  assert.doesNotThrow(() => assertCommonJsHoldsThem(packageDir));

  // The notices are part of holding a package.
  fs.rmSync(path.join(packageDir, 'dist', NOTICES_FILE));
  assert.throws(() => assertCommonJsHoldsThem(packageDir), /wrote no THIRD-PARTY-NOTICES\.txt/);
});

test('a package that lists nothing is left alone', (t) => {
  const packageDir = folder(t, {
    'package.json': manifest({ name: '@embedpdf/core' }),
  });
  assert.doesNotThrow(() => assertCommonJsHoldsThem(packageDir));
});
