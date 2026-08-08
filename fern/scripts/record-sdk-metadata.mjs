#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LANGUAGES, mapSdkVersion, readCanonicalVersion } from './sdk-version.mjs';

const language = process.argv[2];
if (!LANGUAGES.includes(language)) {
  console.error(`Usage: node fern/scripts/record-sdk-metadata.mjs ${LANGUAGES.join('|')}`);
  process.exit(2);
}

const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));
const outputDirectory = `${repositoryDirectory}sdks/${language}`;
const fernMetadata = JSON.parse(readFileSync(`${outputDirectory}/.fern/metadata.json`, 'utf8'));
const canonicalVersion = readCanonicalVersion();
const sdkVersion = mapSdkVersion(canonicalVersion, language);
const openApiSha256 = createHash('sha256')
  .update(readFileSync(`${repositoryDirectory}cloudpdf/contract/openapi.json`))
  .digest('hex');

const metadata = {
  language,
  canonicalVersion,
  sdkVersion,
  source: {
    repository: 'embedpdf/embed-pdf-viewer',
    openapi: 'cloudpdf/contract/openapi.json',
    openapiSha256: openApiSha256,
    gitCommit: fernMetadata.originGitCommit ?? null,
    gitCommitIsDirty: fernMetadata.originGitCommitIsDirty ?? null,
  },
  fern: {
    cliVersion: fernMetadata.cliVersion,
    generatorName: fernMetadata.generatorName,
    generatorVersion: fernMetadata.generatorVersion,
  },
};

writeFileSync(
  `${outputDirectory}/cloudpdf-generation.json`,
  `${JSON.stringify(metadata, null, 2)}\n`,
);

copyFileSync(`${repositoryDirectory}cloudpdf/contract/LICENSE`, `${outputDirectory}/LICENSE`);

// The Ruby generator intentionally leaves registry metadata in its generated
// custom.gemspec.rb hook. Fill that hook deterministically until each SDK has
// its own repository-owned customization layer.
if (language === 'ruby') {
  writeFileSync(
    `${outputDirectory}/custom.gemspec.rb`,
    `# frozen_string_literal: true

def add_custom_gemspec_data(spec)
  spec.authors = ["CloudPDF"]
  spec.email = ["hello@cloudpdf.com"]
  spec.homepage = "https://www.cloudpdf.com"
  spec.license = "Apache-2.0"
end
`,
  );
}

// NuGet supports SemVer prereleases, but AssemblyVersion and FileVersion are
// numeric CLR versions. Fern currently aliases both to $(Version), which makes
// prerelease SDKs fail to compile. Preserve the NuGet package version and use a
// stable numeric binary version for the current major/minor/patch line.
if (language === 'csharp') {
  const projectPath = `${outputDirectory}/src/CloudpdfApi/CloudpdfApi.csproj`;
  const numericBinaryVersion = `${canonicalVersion.split('-')[0]}.0`;
  const project = readFileSync(projectPath, 'utf8')
    .replace(
      '<AssemblyVersion>$(Version)</AssemblyVersion>',
      `<AssemblyVersion>${numericBinaryVersion}</AssemblyVersion>`,
    )
    .replace(
      '<FileVersion>$(Version)</FileVersion>',
      `<FileVersion>${numericBinaryVersion}</FileVersion>`,
    );
  writeFileSync(projectPath, project);
}
