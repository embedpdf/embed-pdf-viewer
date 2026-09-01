#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LANGUAGES, mapSdkVersion, readCanonicalVersion } from './sdk-version.mjs';
import { assertCanonicalCloudPdfCasing } from './sdk-casing.mjs';

const language = process.argv[2];
if (!LANGUAGES.includes(language)) {
  console.error(`Usage: node fern/scripts/validate-sdk.mjs ${LANGUAGES.join('|')}`);
  process.exit(2);
}

const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));
const outputDirectory =
  language === 'typescript'
    ? `${repositoryDirectory}cloudpdf/sdk`
    : `${repositoryDirectory}sdks/${language}`;
const canonicalVersion = readCanonicalVersion();
const expectedVersion = mapSdkVersion(canonicalVersion, language);
const languageNames = {
  typescript: 'TypeScript',
  python: 'Python',
  php: 'PHP',
  csharp: '.NET',
  go: 'Go',
  java: 'Java',
  ruby: 'Ruby',
};

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
includes('README.md', `# CloudPDF ${languageNames[language]} SDK`);
assertCanonicalCloudPdfCasing(outputDirectory);

switch (language) {
  case 'typescript': {
    const manifest = readJson('package.json');
    assert(manifest.name === '@cloudpdf/sdk', `package.json name is ${manifest.name}`);
    assert(manifest.version === expectedVersion, `package.json version is ${manifest.version}`);
    // requestedVersion is stable across Fern generators. sdkVersion is not:
    // some generators omit it, while Go prefixes it with "v". The TypeScript
    // SDK is published from this workspace, so validate its value exactly here.
    assert(
      fernMetadata.sdkVersion === expectedVersion,
      `.fern/metadata.json sdkVersion is ${fernMetadata.sdkVersion}, expected ${expectedVersion}`,
    );
    assert(manifest.license === 'Apache-2.0', `package.json license is ${manifest.license}`);
    assert(
      manifest.publishConfig?.access === 'public',
      'package.json publishConfig.access is not public',
    );
    assert(
      manifest.repository?.directory === 'cloudpdf/sdk',
      'package.json repository.directory is not cloudpdf/sdk',
    );
    assert(
      manifest.scripts?.['test:unit'] === 'vitest run --project unit',
      'package.json test:unit is not a finite CI command',
    );
    assert(
      fernMetadata.originGitCommit === null && fernMetadata.originGitCommitIsDirty === null,
      'committed TypeScript Fern metadata contains nondeterministic Git state',
    );
    includes('src/version.ts', expectedVersion);
    includes('src/BaseClient.ts', `"X-Fern-SDK-Version": "${expectedVersion}"`);
    includes('src/BaseClient.ts', `"User-Agent": "@cloudpdf/sdk/${expectedVersion}"`);
    includes('src/Client.ts', 'export class CloudPDFClient');
    includes('src/CloudPDFClient.ts', 'public readonly uploads: Uploads');
    includes('src/uploads/Uploads.ts', 'class Uploads');
    includes('src/errors/CloudPDFError.ts', 'export class CloudPDFError');
    includes('src/errors/CloudPDFTimeoutError.ts', 'export class CloudPDFTimeoutError');
    includes('src/api/types/PdfActionNode.ts', 'export type PdfActionNode =');
    includes('src/api/types/PdfActionNode.ts', 'payload?: PdfActionNodeSubmitForm.Payload');
    const pathScopedActionTypes = readdirSync(`${outputDirectory}/src/api/types`).filter((file) =>
      /^Doc(?:Annotations|Forms).*Actions.*Root/.test(file),
    );
    assert(
      pathScopedActionTypes.length === 0,
      `shared action components expanded into ${pathScopedActionTypes.length} path-scoped types`,
    );
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
    assert(
      pyproject.includes('description = "The official Python SDK for the CloudPDF API."'),
      'pyproject.toml description is not publication-ready',
    );
    assert(
      pyproject.includes('authors = ["CloudPDF <hello@cloudpdf.com>"]'),
      'pyproject.toml authors are not publication-ready',
    );
    includes('src/cloudpdf/core/client_wrapper.py', expectedVersion);
    includes('src/cloudpdf/client.py', 'class CloudPDFClient:');
    includes('src/cloudpdf/client.py', 'class AsyncCloudPDFClient:');
    break;
  }
  case 'php': {
    const manifest = readJson('composer.json');
    assert(manifest.name === 'cloudpdf/sdk', `composer.json name is ${manifest.name}`);
    assert(
      !('version' in manifest),
      'composer.json version must be derived from the Packagist tag',
    );
    assert(manifest.license === 'Apache-2.0', `composer.json license is ${manifest.license}`);
    assert(manifest.authors?.[0]?.name === 'CloudPDF', 'Composer author is not CloudPDF');
    assert(
      manifest.support?.source === 'https://github.com/embedpdf/cloudpdf-sdk-php',
      'Composer source URL is not the PHP SDK repository',
    );
    includes('src/CloudPDFClient.php', expectedVersion);
    includes('src/CloudPDFClient.php', 'class CloudPDFClient');
    includes('src/Exceptions/CloudPDFException.php', 'class CloudPDFException');
    includes('src/Exceptions/CloudPDFApiException.php', 'class CloudPDFApiException');
    assert(
      !readdirSync(`${outputDirectory}/src/Exceptions`).includes('CloudpdfException.php'),
      'incorrectly cased CloudpdfException.php still exists',
    );
    break;
  }
  case 'csharp': {
    const project = read('src/CloudPDF/CloudPDF.csproj');
    assert(project.includes('<PackageId>CloudPDF</PackageId>'), 'NuGet package ID is not CloudPDF');
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
    includes('src/CloudPDF/CloudPDF.csproj', '<Authors>CloudPDF</Authors>');
    includes(
      'src/CloudPDF/CloudPDF.csproj',
      '<Description>The official .NET SDK for the CloudPDF API.</Description>',
    );
    includes(
      'src/CloudPDF/CloudPDF.csproj',
      '<RepositoryUrl>https://github.com/embedpdf/cloudpdf-sdk-dotnet</RepositoryUrl>',
    );
    includes('src/CloudPDF/Core/Public/Version.cs', expectedVersion);
    includes('src/CloudPDF/CloudPDFClient.cs', 'class CloudPDFClient');
    includes('src/CloudPDF/Core/Public/CloudPDFException.cs', 'class CloudPDFException');
    includes('src/CloudPDF/Core/Public/CloudPDFApiException.cs', 'class CloudPDFApiException');
    break;
  }
  case 'go': {
    includes('go.mod', 'module github.com/embedpdf/cloudpdf-sdk-go/v3');
    includes('core/request_option.go', `X-Fern-SDK-Version", "v${expectedVersion}`);
    includes('client/client.go', 'func NewClient(');
    break;
  }
  case 'java': {
    assert(
      read('gradle.properties') ===
        'org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8\n',
      'Gradle build JVM memory is not configured for the generated API surface',
    );
    const build = read('build.gradle');
    assert(build.includes("group = 'com.cloudpdf'"), 'Gradle group is not com.cloudpdf');
    assert(build.includes("artifactId = 'sdk'"), 'Gradle artifact is not sdk');
    assert(
      build.includes(`version = '${expectedVersion}'`),
      `Gradle version is not ${expectedVersion}`,
    );
    assert(
      build.includes(`tasks.withType(Jar).configureEach {
    zip64 = true
}`),
      'ZIP64 is not enabled for Gradle JAR tasks',
    );
    assert(build.includes("id 'signing'"), 'Gradle signing plugin is not enabled');
    assert(
      build.includes("name = 'Apache License, Version 2.0'"),
      'Maven license name is not publication-ready',
    );
    assert(
      build.includes("url = 'https://www.apache.org/licenses/LICENSE-2.0.txt'"),
      'Maven license URL is not publication-ready',
    );
    assert(
      build.includes("url = 'https://github.com/embedpdf/cloudpdf-sdk-java'"),
      'Maven SCM URL is not the Java SDK repository',
    );
    assert(build.includes("name = 'centralStaging'"), 'Central staging repository is missing');
    assert(
      build.includes("System.getenv('MAVEN_GPG_PRIVATE_KEY')"),
      'in-memory Maven signing key is not configured',
    );
    assert(!build.includes('YOUR-ORG'), 'placeholder Maven SCM organization remains');
    includes('src/main/java/api/CloudPDFClient.java', 'package com.cloudpdf.api;');
    includes('src/main/java/api/CloudPDFClient.java', 'class CloudPDFClient');
    includes('src/main/java/api/core/CloudPDFException.java', 'class CloudPDFException');
    includes('src/main/java/api/core/CloudPDFApiException.java', 'class CloudPDFApiException');
    includes('src/main/java/api/core/ClientOptions.java', expectedVersion);
    break;
  }
  case 'ruby': {
    includes('cloudpdf.gemspec', 'spec.name = "cloudpdf"');
    includes('lib/CloudPDF/version.rb', `VERSION = "${expectedVersion}"`);
    includes('lib/CloudPDF/client.rb', 'module CloudPDF');
    includes('lib/CloudPDF/client.rb', 'class Client');
    includes(
      'lib/CloudPDF/documents/client.rb',
      'body.add_file(name: "file", file: params[:file], content_type: "application/pdf")',
    );
    assert(
      !read('lib/CloudPDF/documents/client.rb').includes('to_form_data_part'),
      'Ruby multipart upload still calls the nonexistent to_form_data_part helper',
    );
    includes(
      'lib/CloudPDF/documents/types/upload_proxy_documents_request.rb',
      'field :file, -> { Object }, optional: false',
    );
    includes('reference.md', 'File.open("document.pdf", "rb") do |file|');
    includes('reference.md', 'file: file');
    includes('README.md', 'require "cloudpdf"');
    includes('custom.gemspec.rb', 'spec.license = "Apache-2.0"');
    includes('custom.gemspec.rb', 'spec.summary = "The official Ruby SDK for the CloudPDF API."');
    includes(
      'custom.gemspec.rb',
      'spec.metadata["source_code_uri"] = "https://github.com/embedpdf/cloudpdf-sdk-ruby"',
    );
    includes('custom.gemspec.rb', 'file.start_with?(".github/")');
    assert(
      !readdirSync(outputDirectory).includes('CloudPDF.gemspec'),
      'uppercase Ruby gemspec still exists',
    );
    assert(
      !readdirSync(`${outputDirectory}/lib`).includes('CloudPDF.rb'),
      'uppercase Ruby entrypoint still exists',
    );
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
