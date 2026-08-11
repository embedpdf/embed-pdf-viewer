#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { restoreFile, snapshotFile } from './generated-file-ownership.mjs';
import { mapSdkVersion, readCanonicalVersion } from './sdk-version.mjs';

export const FERN_CLI_VERSION = '5.91.0';

const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));
const sdkVersion = mapSdkVersion(readCanonicalVersion(), 'typescript');
const configuredFern = process.env.CLOUDPDF_FERN_CLI;
const fernCommand = configuredFern || 'npx';
const fernPrefix = configuredFern ? [] : ['--yes', `fern-api@${FERN_CLI_VERSION}`];
const changelogPath = `${repositoryDirectory}cloudpdf/sdk/CHANGELOG.md`;
const changesetsChangelog = snapshotFile(changelogPath);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`${command} ${args.join(' ')} failed with ${outcome}`);
  }
}

// Fern currently synthesizes a release heading even when CHANGELOG.md is in
// .fernignore. Changesets owns this file, so restore its exact pre-generation
// state before recording or validating the generated SDK.
try {
  run(fernCommand, [
    ...fernPrefix,
    'generate',
    '--group',
    'typescript',
    '--local',
    '--version',
    sdkVersion,
    '--force',
    '--no-prompt',
    '--generate-tests',
    '--log-level',
    'info',
  ]);
} finally {
  restoreFile(changelogPath, changesetsChangelog);
}

run(process.execPath, ['fern/scripts/record-sdk-metadata.mjs', 'typescript']);
run(process.execPath, ['fern/scripts/validate-sdk.mjs', 'typescript']);
