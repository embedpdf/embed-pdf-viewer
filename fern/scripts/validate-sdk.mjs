#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LANGUAGES, mapSdkVersion, readCanonicalVersion } from './sdk-version.mjs';

const language = process.argv[2];
if (!LANGUAGES.includes(language)) {
  console.error(`Usage: node fern/scripts/validate-sdk.mjs ${LANGUAGES.join('|')}`);
  process.exit(2);
}

const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));
const outputDirectory = `${repositoryDirectory}sdks/${language}`;
const canonicalVersion = readCanonicalVersion();
const expectedVersion = mapSdkVersion(canonicalVersion, language);

function read(path) {
  return readFileSync(`${outputDirectory}/${path}`, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(`${language}: ${message}`);
}

function includes(path, value) {
  assert(read(path).includes(value), `${path} does not contain ${JSON.stringify(value)}`);
}

const fernMetadata = readJson('.fern/metadata.json');
assert(
  fernMetadata.requestedVersion === expectedVersion,
  `.fern/metadata.json requestedVersion is ${fernMetadata.requestedVersion}, expected ${expectedVersion}`,
);
includes('LICENSE', 'Apache License');

switch (language) {
  case 'typescript': {
    const manifest = readJson('package.json');
    assert(manifest.name === '@cloudpdf/sdk', `package.json name is ${manifest.name}`);
    assert(manifest.version === expectedVersion, `package.json version is ${manifest.version}`);
    includes('src/version.ts', expectedVersion);
    break;
  }
  case 'python': {
    const pyproject = read('pyproject.toml');
    assert(
      /\[tool\.poetry\][\s\S]*?name = "cloudpdf"/.test(pyproject),
      'pyproject.toml package name is not cloudpdf',
    );
    assert(
      new RegExp(
        `\\[tool\\.poetry\\][\\s\\S]*?version = "${expectedVersion.replaceAll('.', '\\.')}"`,
      ).test(pyproject),
      `pyproject.toml version is not ${expectedVersion}`,
    );
    assert(
      pyproject.includes('license = "Apache-2.0"'),
      'pyproject.toml license is not Apache-2.0',
    );
    includes('src/cloudpdf/core/client_wrapper.py', expectedVersion);
    break;
  }
  case 'php': {
    const manifest = readJson('composer.json');
    assert(manifest.name === 'cloudpdf/cloudpdf', `composer.json name is ${manifest.name}`);
    assert(manifest.version === expectedVersion, `composer.json version is ${manifest.version}`);
    assert(manifest.license === 'Apache-2.0', `composer.json license is ${manifest.license}`);
    includes('src/CloudpdfClient.php', expectedVersion);
    break;
  }
  case 'csharp': {
    const project = read('src/CloudpdfApi/CloudpdfApi.csproj');
    assert(
      project.includes('<PackageId>CloudpdfApi</PackageId>'),
      'NuGet package ID is not CloudpdfApi',
    );
    assert(
      project.includes(`<Version>${expectedVersion}</Version>`),
      `project version is not ${expectedVersion}`,
    );
    const numericBinaryVersion = `${canonicalVersion.split('-')[0]}.0`;
    assert(
      project.includes(`<AssemblyVersion>${numericBinaryVersion}</AssemblyVersion>`),
      'assembly version is not numeric',
    );
    assert(
      project.includes(`<FileVersion>${numericBinaryVersion}</FileVersion>`),
      'file version is not numeric',
    );
    assert(
      project.includes('<PackageLicenseExpression>Apache-2.0</PackageLicenseExpression>'),
      'NuGet license is not Apache-2.0',
    );
    includes('src/CloudpdfApi/Core/Public/Version.cs', expectedVersion);
    break;
  }
  case 'go': {
    includes('go.mod', 'module github.com/embedpdf/cloudpdf-sdk-go/v3');
    includes('core/request_option.go', `X-Fern-SDK-Version", "v${expectedVersion}`);
    break;
  }
  case 'java': {
    const build = read('build.gradle');
    assert(build.includes("group = 'com.cloudpdf'"), 'Gradle group is not com.cloudpdf');
    assert(build.includes("artifactId = 'cloudpdf'"), 'Gradle artifact is not cloudpdf');
    assert(
      build.includes(`version = '${expectedVersion}'`),
      `Gradle version is not ${expectedVersion}`,
    );
    assert(build.includes("name = 'APACHE-2.0'"), 'Maven license is not Apache-2.0');
    includes('src/main/java/CloudpdfApiClient.java', 'package com.cloudpdf.api;');
    includes('src/main/java/core/ClientOptions.java', expectedVersion);
    break;
  }
  case 'ruby': {
    includes('cloudpdf.gemspec', 'spec.name = "cloudpdf"');
    includes('lib/cloudpdf/version.rb', `VERSION = "${expectedVersion}"`);
    includes('custom.gemspec.rb', 'spec.license = "Apache-2.0"');
    break;
  }
}

const generation = readJson('cloudpdf-generation.json');
const expectedOpenApiSha256 = createHash('sha256')
  .update(readFileSync(`${repositoryDirectory}cloudpdf/contract/openapi.json`))
  .digest('hex');
assert(
  generation.canonicalVersion === canonicalVersion,
  'generation metadata canonical version is stale',
);
assert(generation.sdkVersion === expectedVersion, 'generation metadata SDK version is stale');
assert(generation.language === language, 'generation metadata language is incorrect');
assert(
  generation.source?.openapiSha256 === expectedOpenApiSha256,
  'generation metadata OpenAPI SHA-256 is stale',
);

console.log(`${language}: valid CloudPDF SDK ${expectedVersion} (canonical ${canonicalVersion})`);
