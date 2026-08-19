import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FERN_CLI_VERSION,
  parseArguments,
  parsePinnedGenerators,
  sdkDirectory,
  stalenessReasons,
} from './generate-sdks.mjs';
import { LANGUAGES, fernDirectory } from './sdk-version.mjs';

const generatorsSource = readFileSync(`${fernDirectory}generators.yml`, 'utf8');

test('reads a pinned generator for every SDK language', () => {
  const pinned = parsePinnedGenerators(generatorsSource);
  assert.deepEqual(Object.keys(pinned).sort(), [...LANGUAGES].sort());
  for (const language of LANGUAGES) {
    assert.match(pinned[language].name, /^fernapi\/fern-[a-z]+-sdk$/);
    assert.match(pinned[language].version, /^\d+\.\d+\.\d+$/);
  }
});

test('reads the generator version, not nested configuration versions', () => {
  const pinned = parsePinnedGenerators(generatorsSource);
  // generators.yml also pins the Go module language version ('1.21') under
  // config.module; the generator pin must win.
  assert.equal(pinned.go.name, 'fernapi/fern-go-sdk');
  assert.notEqual(pinned.go.version, '1.21');
});

test('rejects a generators.yml it cannot read a pin from', () => {
  assert.throws(() => parsePinnedGenerators('api: {}\n'), /no groups section/);
  assert.throws(() => parsePinnedGenerators('groups:\n  typescript:\n'), /cannot read the pinned/);
});

const expected = {
  openapiSha256: 'a'.repeat(64),
  sdkVersion: '3.0.0-next.5',
  cliVersion: FERN_CLI_VERSION,
  generatorName: 'fernapi/fern-typescript-sdk',
  generatorVersion: '3.87.2',
};

function freshStamp() {
  return {
    sdkVersion: expected.sdkVersion,
    source: { openapiSha256: expected.openapiSha256 },
    fern: {
      cliVersion: expected.cliVersion,
      generatorName: expected.generatorName,
      generatorVersion: expected.generatorVersion,
    },
  };
}

test('a matching stamp is fresh', () => {
  assert.deepEqual(stalenessReasons(freshStamp(), expected), []);
});

test('a missing stamp means the tree was never generated', () => {
  assert.deepEqual(stalenessReasons(null, expected), ['never generated']);
});

test('every stamped dimension participates in staleness', () => {
  const contract = freshStamp();
  contract.source.openapiSha256 = 'b'.repeat(64);
  assert.match(stalenessReasons(contract, expected).join(), /OpenAPI bbbbbbbbbbbb → aaaaaaaaaaaa/);

  const version = freshStamp();
  version.sdkVersion = '3.0.0-next.1';
  assert.match(stalenessReasons(version, expected).join(), /SDK version 3\.0\.0-next\.1/);

  const cli = freshStamp();
  cli.fern.cliVersion = '5.0.0';
  assert.match(stalenessReasons(cli, expected).join(), /Fern CLI 5\.0\.0/);

  const generator = freshStamp();
  generator.fern.generatorVersion = '3.0.0';
  assert.match(stalenessReasons(generator, expected).join(), /generator .*3\.0\.0 →/);
});

test('parses converge, subset, force, check, and version-print invocations', () => {
  assert.deepEqual(parseArguments([]), {
    only: null,
    force: false,
    check: false,
    printFernVersion: false,
  });
  assert.deepEqual(parseArguments(['--only', 'python,ruby']).only, ['python', 'ruby']);
  assert.equal(parseArguments(['--only', 'typescript', '--force']).force, true);
  assert.equal(parseArguments(['--check']).check, true);
  assert.equal(parseArguments(['--print-fern-version']).printFernVersion, true);
});

test('rejects malformed invocations', () => {
  assert.throws(() => parseArguments(['--only', 'rust']), /Unsupported SDK language: rust/);
  assert.throws(() => parseArguments(['--only']), /comma-separated/);
  assert.throws(() => parseArguments(['--force', '--check']), /mutually exclusive/);
  assert.throws(() => parseArguments(['--fresh']), /Unknown argument: --fresh/);
});

test('the committed TypeScript SDK and gitignored scratch trees have distinct homes', () => {
  assert.match(sdkDirectory('typescript'), /cloudpdf\/sdk$/);
  assert.match(sdkDirectory('python'), /sdks\/python$/);
});
