#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LANGUAGES, mapSdkVersion, readCanonicalVersion } from './sdk-version.mjs';
import { normalizeSdkBranding } from './sdk-branding.mjs';

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
normalizeSdkBranding(outputDirectory, language);

// Registry-facing metadata that Fern does not currently expose through every
// generator configuration. Keep these deterministic and validate them below so
// a generator upgrade cannot silently publish incomplete package metadata.
if (language === 'typescript') {
  const manifestPath = `${outputDirectory}/package.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.publishConfig = { access: 'public' };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
}

if (language === 'php') {
  const manifestPath = `${outputDirectory}/composer.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // Packagist derives versions from immutable VCS tags and Composer warns when
  // a published library hard-codes its version in composer.json.
  delete manifest.version;
  manifest.authors = [
    {
      name: 'CloudPDF',
      email: 'hello@cloudpdf.com',
      homepage: 'https://www.cloudpdf.com',
    },
  ];
  manifest.support = {
    issues: 'https://github.com/embedpdf/cloudpdf-sdk-php/issues',
    source: 'https://github.com/embedpdf/cloudpdf-sdk-php',
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (language === 'python') {
  const projectPath = `${outputDirectory}/pyproject.toml`;
  const project = readFileSync(projectPath, 'utf8')
    .replace('description = ""', 'description = "The official Python SDK for the CloudPDF API."')
    .replace('authors = []', 'authors = ["CloudPDF <hello@cloudpdf.com>"]');
  writeFileSync(projectPath, project);
}

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
  spec.summary = "The official Ruby SDK for the CloudPDF API."
  spec.description = "A typed Ruby client for deployment, tenant, and document operations in the CloudPDF API."
  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/embedpdf/cloudpdf-sdk-ruby"
  spec.files = spec.files.reject do |file|
    file.start_with?(".github/") || file == "cloudpdf-generation.json"
  end
end
`,
  );
}

// NuGet supports SemVer prereleases, but AssemblyVersion and FileVersion are
// numeric CLR versions. Fern currently aliases both to $(Version), which makes
// prerelease SDKs fail to compile. Preserve the NuGet package version and use a
// stable numeric binary version for the current major/minor/patch line.
if (language === 'csharp') {
  const projectPath = `${outputDirectory}/src/CloudPDF/CloudPDF.csproj`;
  const numericBinaryVersion = `${canonicalVersion.split('-')[0]}.0`;
  const project = readFileSync(projectPath, 'utf8')
    .replace(
      '<PackageId>CloudPDF</PackageId>',
      `<PackageId>CloudPDF</PackageId>
    <Authors>CloudPDF</Authors>
    <Description>The official .NET SDK for the CloudPDF API.</Description>
    <PackageProjectUrl>https://www.cloudpdf.com</PackageProjectUrl>
    <RepositoryUrl>https://github.com/embedpdf/cloudpdf-sdk-dotnet</RepositoryUrl>
    <RepositoryType>git</RepositoryType>
    <PackageTags>cloudpdf;pdf;api;sdk</PackageTags>`,
    )
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

// Maven Central requires source and Javadoc artifacts, complete POM metadata,
// and a PGP signature for every published artifact. Fern generates the first
// two but currently leaves placeholder SCM URLs and an OSSRH-era remote
// repository. Stage a signed local Maven repository instead; the repository
// release workflow bundles and uploads it through the Central Portal API.
if (language === 'java') {
  const projectPath = `${outputDirectory}/build.gradle`;
  const project = readFileSync(projectPath, 'utf8')
    .replace("    id 'maven-publish'\n", "    id 'maven-publish'\n    id 'signing'\n")
    .replace(
      `                licenses {
                    license {
                        name = 'APACHE-2.0'
                    }
                }`,
      `                licenses {
                    license {
                        name = 'Apache License, Version 2.0'
                        url = 'https://www.apache.org/licenses/LICENSE-2.0.txt'
                        distribution = 'repo'
                    }
                }`,
    )
    .replace(
      `                developers {
                    developer {
                        name = 'CloudPDF'
                        email = 'hello@cloudpdf.com'
                    }
                }`,
      `                developers {
                    developer {
                        id = 'cloudpdf'
                        name = 'CloudPDF'
                        email = 'hello@cloudpdf.com'
                        organization = 'CloudPDF'
                        organizationUrl = 'https://www.cloudpdf.com'
                    }
                }`,
    )
    .replace(
      `                scm {
                    connection = 'scm:git:git://github.com/YOUR-ORG/YOUR-REPO.git'
                    developerConnection = 'scm:git:git://github.com/YOUR-ORG/YOUR-REPO.git'
                    url = 'https://github.com/YOUR-ORG/YOUR-REPO'
                }`,
      `                scm {
                    connection = 'scm:git:https://github.com/embedpdf/cloudpdf-sdk-java.git'
                    developerConnection = 'scm:git:ssh://git@github.com/embedpdf/cloudpdf-sdk-java.git'
                    url = 'https://github.com/embedpdf/cloudpdf-sdk-java'
                }`,
    )
    .replace(
      `    repositories {
        maven {
            url "$System.env.MAVEN_PUBLISH_REGISTRY_URL"
            credentials {
                username "$System.env.MAVEN_USERNAME"
                password "$System.env.MAVEN_PASSWORD"
            }
        }
    }`,
      `    repositories {
        maven {
            name = 'centralStaging'
            url = layout.buildDirectory.dir('central-staging')
        }
    }`,
    )
    .concat(`
tasks.withType(GenerateModuleMetadata) {
    enabled = false
}

signing {
    useInMemoryPgpKeys(
        System.getenv('MAVEN_GPG_PRIVATE_KEY'),
        System.getenv('MAVEN_GPG_PASSPHRASE')
    )
    sign publishing.publications.maven
}
`);
  writeFileSync(projectPath, project);
}
