#!/usr/bin/env node

// Converges the generated CloudPDF SDKs with the committed OpenAPI contract.
//
// Every generated tree carries a cloudpdf-generation.json stamp (written by
// record-sdk-metadata.mjs) with the exact OpenAPI SHA-256, mapped SDK version,
// and pinned Fern CLI + generator versions that produced it. This script
// compares each stamp against the current contract and regenerates only the
// stale trees, running the same generate → record → validate sequence as
// .github/workflows/sdk-generate.yml — a green local run is the matrix's
// generation step, language for language.
//
//   node fern/scripts/generate-sdks.mjs                 converge stale SDKs
//   node fern/scripts/generate-sdks.mjs --only python   converge a subset
//   node fern/scripts/generate-sdks.mjs --force         regenerate even when fresh
//   node fern/scripts/generate-sdks.mjs --check         report staleness, exit 1 if any
//   node fern/scripts/generate-sdks.mjs --print-fern-version
//
// Staleness is judged from the stamp, so a generators.yml configuration edit
// that does not bump a generator version still needs --force.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { restoreFile, snapshotFile } from './generated-file-ownership.mjs';
import {
  LANGUAGES,
  fernDirectory,
  mapSdkVersion,
  readCanonicalVersion,
  repositoryDirectory,
} from './sdk-version.mjs';

export const FERN_CLI_VERSION = '5.91.0';

export function sdkDirectory(language) {
  return language === 'typescript'
    ? `${repositoryDirectory}cloudpdf/sdk`
    : `${repositoryDirectory}sdks/${language}`;
}

/**
 * Reads the pinned generator for every language group from generators.yml
 * without a YAML dependency. The accepted grammar is deliberately narrow:
 * the first `- name:` in a group, and the generator-level `version:` at
 * exactly eight spaces — Go pins a language version under config.module
 * that sits deeper and must not match.
 */
export function parsePinnedGenerators(source) {
  const groupsIndex = source.search(/^groups:$/m);
  if (groupsIndex === -1) throw new Error('generators.yml has no groups section');
  const groupsSource = source.slice(groupsIndex);

  const pinned = {};
  for (const language of LANGUAGES) {
    const header = new RegExp(`^  ${language}:$`, 'm').exec(groupsSource);
    if (!header) throw new Error(`generators.yml has no group for ${language}`);
    const rest = groupsSource.slice(header.index + header[0].length);
    const nextGroup = rest.search(/^  [a-z]/m);
    const section = nextGroup === -1 ? rest : rest.slice(0, nextGroup);
    const name = section.match(/^ +- name: (\S+)$/m)?.[1];
    const version = section.match(/^ {8}version: (\S+)$/m)?.[1];
    if (!name || !version) {
      throw new Error(`generators.yml: cannot read the pinned generator for ${language}`);
    }
    // record-sdk-metadata.mjs stores the container-qualified generator name.
    pinned[language] = { name: `fernapi/${name}`, version };
  }
  return pinned;
}

/** Why a generated tree no longer matches the contract; empty means fresh. */
export function stalenessReasons(stamp, expected) {
  if (!stamp) return ['never generated'];
  const digest = (value) => (value ? value.slice(0, 12) : 'unknown');
  const reasons = [];
  if (stamp.source?.openapiSha256 !== expected.openapiSha256) {
    reasons.push(
      `OpenAPI ${digest(stamp.source?.openapiSha256)} → ${digest(expected.openapiSha256)}`,
    );
  }
  if (stamp.sdkVersion !== expected.sdkVersion) {
    reasons.push(`SDK version ${stamp.sdkVersion ?? 'unknown'} → ${expected.sdkVersion}`);
  }
  if (stamp.fern?.cliVersion !== expected.cliVersion) {
    reasons.push(`Fern CLI ${stamp.fern?.cliVersion ?? 'unknown'} → ${expected.cliVersion}`);
  }
  if (
    stamp.fern?.generatorName !== expected.generatorName ||
    stamp.fern?.generatorVersion !== expected.generatorVersion
  ) {
    reasons.push(
      `generator ${stamp.fern?.generatorName ?? 'unknown'}@${stamp.fern?.generatorVersion ?? '?'} → ${expected.generatorName}@${expected.generatorVersion}`,
    );
  }
  return reasons;
}

export function parseArguments(argv) {
  const options = { only: null, force: false, check: false, printFernVersion: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--force') options.force = true;
    else if (argument === '--check') options.check = true;
    else if (argument === '--print-fern-version') options.printFernVersion = true;
    else if (argument === '--only') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--only requires a comma-separated language list');
      }
      options.only = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      index += 1;
    } else {
      throw new Error(
        `Unknown argument: ${argument} (expected --only, --force, --check, or --print-fern-version)`,
      );
    }
  }
  for (const language of options.only ?? []) {
    if (!LANGUAGES.includes(language)) {
      throw new Error(`Unsupported SDK language: ${language} (expected ${LANGUAGES.join(', ')})`);
    }
  }
  if (options.force && options.check) {
    throw new Error('--force and --check are mutually exclusive');
  }
  return options;
}

function readStamp(language) {
  const path = `${sdkDirectory(language)}/cloudpdf-generation.json`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

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

function assertDockerAvailable() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw new Error(
      'Fern local generation runs each generator in a Docker container, but Docker is not available. Start Docker and retry.',
    );
  }
}

function generateLanguage(language, sdkVersion) {
  const configuredFern = process.env.CLOUDPDF_FERN_CLI;
  const fernCommand = configuredFern || 'npx';
  const fernPrefix = configuredFern ? [] : ['--yes', `fern-api@${FERN_CLI_VERSION}`];
  const generateArguments = [
    ...fernPrefix,
    'generate',
    '--group',
    language,
    '--local',
    '--version',
    sdkVersion,
    '--force',
    '--no-prompt',
    '--generate-tests',
    '--log-level',
    'info',
  ];

  if (language === 'typescript') {
    // Changesets is the sole owner of the committed SDK changelog; Fern
    // synthesizes a release heading even when CHANGELOG.md is in .fernignore,
    // so restore its exact pre-generation state.
    const changelogPath = `${repositoryDirectory}cloudpdf/sdk/CHANGELOG.md`;
    const changesetsChangelog = snapshotFile(changelogPath);
    try {
      run(fernCommand, generateArguments);
    } finally {
      restoreFile(changelogPath, changesetsChangelog);
    }
  } else {
    // Scratch trees are gitignored; start from the same empty directory the
    // CI matrix generates into so stale files cannot survive a regeneration.
    rmSync(sdkDirectory(language), { recursive: true, force: true });
    run(fernCommand, generateArguments);
  }

  run(process.execPath, ['fern/scripts/record-sdk-metadata.mjs', language]);
  run(process.execPath, ['fern/scripts/validate-sdk.mjs', language]);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.printFernVersion) {
    console.log(FERN_CLI_VERSION);
    return;
  }

  const canonicalVersion = readCanonicalVersion();
  const openapiSha256 = createHash('sha256')
    .update(readFileSync(`${repositoryDirectory}cloudpdf/contract/openapi.json`))
    .digest('hex');
  const pinned = parsePinnedGenerators(readFileSync(`${fernDirectory}generators.yml`, 'utf8'));
  const languages = options.only ?? LANGUAGES;

  const plan = languages.map((language) => {
    const expected = {
      openapiSha256,
      sdkVersion: mapSdkVersion(canonicalVersion, language),
      cliVersion: FERN_CLI_VERSION,
      generatorName: pinned[language].name,
      generatorVersion: pinned[language].version,
    };
    const reasons = options.force
      ? ['forced by --force']
      : stalenessReasons(readStamp(language), expected);
    return { language, expected, reasons };
  });

  for (const { language, expected, reasons } of plan) {
    if (reasons.length === 0) console.log(`[${language}] fresh at ${expected.sdkVersion}`);
    else console.log(`[${language}] stale: ${reasons.join('; ')}`);
  }

  const stale = plan.filter((entry) => entry.reasons.length > 0);

  if (options.check) {
    if (stale.length > 0) {
      console.error(
        `\n${stale.length} of ${plan.length} SDKs are stale. Run \`pnpm api:sync\` from the repository root.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${plan.length} SDKs are fresh for ${canonicalVersion}.`);
    }
    return;
  }

  if (stale.length === 0) {
    console.log(
      `\nAll ${plan.length} SDKs already match ${canonicalVersion} (OpenAPI ${openapiSha256.slice(0, 12)}).`,
    );
    return;
  }

  assertDockerAvailable();
  for (const { language, expected } of stale) {
    console.log(`\n[${language}] generating ${expected.sdkVersion}…`);
    generateLanguage(language, expected.sdkVersion);
  }
  console.log(
    `\nGenerated ${stale.length} SDK${stale.length === 1 ? '' : 's'}; ${plan.length - stale.length} already fresh.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
