import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { restoreFile, snapshotFile } from './generated-file-ownership.mjs';
import { repositoryDirectory } from './sdk-version.mjs';

const read = (path) => readFileSync(join(repositoryDirectory, path), 'utf8');
const rootManifest = JSON.parse(read('package.json'));
const contractManifest = JSON.parse(read('cloudpdf/contract/package.json'));

test('Changesets materializes the committed TypeScript SDK before refreshing docs', () => {
  const version = rootManifest.scripts['ci:version'];
  const orderedSteps = [
    'changeset version',
    'pnpm --filter @cloudpdf/contract emit:openapi',
    'pnpm run cloudpdf:sdk:generate',
    'pnpm --filter @cloudpdf/website api:metadata',
    'pnpm --filter @cloudpdf/website api:pages',
  ];

  let previous = -1;
  for (const step of orderedSteps) {
    const index = version.indexOf(step);
    assert.ok(index > previous, `${step} is missing or out of order in ci:version`);
    previous = index;
  }
  assert.doesNotMatch(version, /prettier/);
  assert.match(contractManifest.scripts['emit:openapi'], /prettier --write openapi\.json/);
});

test('the release command blocks stale committed TypeScript SDKs', () => {
  const publish = rootManifest.scripts['ci:publish'];
  const validate = publish.indexOf('node fern/scripts/validate-sdk.mjs typescript');
  const publishPackages = publish.indexOf('pnpm publish -r');
  assert.ok(validate !== -1 && validate < publishPackages);
});

test('the generated SDK leaves its Changesets changelog untouched', () => {
  const ignored = read('cloudpdf/sdk/.fernignore')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  assert.ok(ignored.includes('CHANGELOG.md'));

  const directory = mkdtempSync(join(tmpdir(), 'cloudpdf-changelog-ownership-'));
  try {
    const existing = join(directory, 'existing.md');
    writeFileSync(existing, 'Changesets\n');
    const existingSnapshot = snapshotFile(existing);
    writeFileSync(existing, 'Fern\n');
    restoreFile(existing, existingSnapshot);
    assert.equal(readFileSync(existing, 'utf8'), 'Changesets\n');

    const absent = join(directory, 'absent.md');
    const absentSnapshot = snapshotFile(absent);
    writeFileSync(absent, 'Fern\n');
    restoreFile(absent, absentSnapshot);
    assert.throws(() => readFileSync(absent, 'utf8'), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('versioning and SDK freshness use one pinned TypeScript generator path', () => {
  assert.equal(
    rootManifest.scripts['cloudpdf:sdk:generate'],
    'node fern/scripts/generate-typescript-sdk.mjs',
  );

  const generator = read('fern/scripts/generate-typescript-sdk.mjs');
  assert.match(generator, /FERN_CLI_VERSION = '5\.91\.0'/);
  assert.match(generator, /readCanonicalVersion\(\)/);
  assert.match(generator, /'--group',\s*'typescript'/);
  assert.match(generator, /changesetsChangelog/);
  assert.match(generator, /finally/);
  assert.match(generator, /restoreFile\(changelogPath, changesetsChangelog\)/);
  assert.match(generator, /record-sdk-metadata\.mjs', 'typescript'/);
  assert.match(generator, /validate-sdk\.mjs', 'typescript'/);

  const workflow = read('.github/workflows/sdk-generate.yml');
  assert.match(workflow, /npm install -g fern-api@5\.91\.0/);
  assert.match(workflow, /CLOUDPDF_FERN_CLI: fern/);
  assert.match(workflow, /node fern\/scripts\/generate-typescript-sdk\.mjs/);
});
