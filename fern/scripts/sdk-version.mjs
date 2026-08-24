#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LANGUAGES = ['typescript', 'python', 'php', 'csharp', 'go', 'java', 'ruby'];
const fernDirectory = fileURLToPath(new URL('../', import.meta.url));
const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readCanonicalVersion() {
  const contractPackage = readJson(`${repositoryDirectory}cloudpdf/contract/package.json`);
  const openApi = readJson(`${repositoryDirectory}cloudpdf/contract/openapi.json`);

  if (contractPackage.version !== openApi.info?.version) {
    throw new Error(
      `Contract version ${contractPackage.version} does not match OpenAPI version ${openApi.info?.version}`,
    );
  }

  return contractPackage.version;
}

export function mapSdkVersion(canonicalVersion, language) {
  if (!LANGUAGES.includes(language)) {
    throw new Error(`Unsupported SDK language: ${language}`);
  }

  const match = /^(\d+)\.(\d+)\.(\d+)(?:-next\.(\d+))?$/.exec(canonicalVersion);
  if (!match) {
    throw new Error(
      `Unsupported CloudPDF version ${canonicalVersion}; expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-next.NUMBER`,
    );
  }

  const baseVersion = `${match[1]}.${match[2]}.${match[3]}`;
  const prereleaseNumber = match[4];
  if (prereleaseNumber === undefined) return baseVersion;

  switch (language) {
    case 'python':
      return `${baseVersion}a${prereleaseNumber}`;
    case 'php':
    case 'java':
      return `${baseVersion}-alpha.${prereleaseNumber}`;
    case 'ruby':
      return `${baseVersion}.alpha.${prereleaseNumber}`;
    default:
      return canonicalVersion;
  }
}

export function allSdkVersions(canonicalVersion = readCanonicalVersion()) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, mapSdkVersion(canonicalVersion, language)]),
  );
}

function printUsage() {
  console.error('Usage: node fern/scripts/sdk-version.mjs <canonical|all|LANGUAGE>');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const command = process.argv[2];
    const canonicalVersion = readCanonicalVersion();
    if (command === 'canonical') {
      console.log(canonicalVersion);
    } else if (command === 'all') {
      console.log(
        JSON.stringify(
          { canonical: canonicalVersion, sdks: allSdkVersions(canonicalVersion) },
          null,
          2,
        ),
      );
    } else if (LANGUAGES.includes(command)) {
      console.log(mapSdkVersion(canonicalVersion, command));
    } else {
      printUsage();
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

export { LANGUAGES, fernDirectory, repositoryDirectory };
