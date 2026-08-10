#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { LANGUAGES } from './sdk-version.mjs';

export const SDK_REPOSITORIES = Object.freeze({
  python: {
    name: 'cloudpdf-sdk-python',
    slug: 'embedpdf/cloudpdf-sdk-python',
    displayName: 'Python',
  },
  php: {
    name: 'cloudpdf-sdk-php',
    slug: 'embedpdf/cloudpdf-sdk-php',
    displayName: 'PHP',
  },
  csharp: {
    name: 'cloudpdf-sdk-dotnet',
    slug: 'embedpdf/cloudpdf-sdk-dotnet',
    displayName: '.NET',
  },
  go: {
    name: 'cloudpdf-sdk-go',
    slug: 'embedpdf/cloudpdf-sdk-go',
    displayName: 'Go',
  },
  java: {
    name: 'cloudpdf-sdk-java',
    slug: 'embedpdf/cloudpdf-sdk-java',
    displayName: 'Java',
  },
  ruby: {
    name: 'cloudpdf-sdk-ruby',
    slug: 'embedpdf/cloudpdf-sdk-ruby',
    displayName: 'Ruby',
  },
});

export function sdkRepository(language) {
  const repository = SDK_REPOSITORIES[language];
  if (!repository || !LANGUAGES.includes(language)) {
    throw new Error(
      language === 'typescript'
        ? 'TypeScript SDK is a monorepo workspace package, not an external SDK repository'
        : `Unsupported SDK language: ${language}`,
    );
  }
  return repository;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const language = process.argv[2];
    const field = process.argv[3] ?? 'slug';
    const repository = sdkRepository(language);
    if (!['name', 'slug', 'displayName'].includes(field)) {
      throw new Error('Field must be name, slug, or displayName');
    }
    console.log(repository[field]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
