import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { LANGUAGES, repositoryDirectory } from './sdk-version.mjs';
import { SDK_REPOSITORIES, sdkRepository } from './sdk-repositories.mjs';

const externalLanguages = LANGUAGES.filter((language) => language !== 'typescript');

test('every external generated language has one distinct public SDK repository', () => {
  assert.deepEqual(Object.keys(SDK_REPOSITORIES).sort(), [...externalLanguages].sort());

  const slugs = externalLanguages.map((language) => sdkRepository(language).slug);
  assert.equal(new Set(slugs).size, externalLanguages.length);
  for (const [index, slug] of slugs.entries()) {
    assert.match(slug, /^embedpdf\/cloudpdf-sdk-[a-z]+$/);
    assert.ok(
      existsSync(
        join(
          repositoryDirectory,
          'fern',
          'repository-overlays',
          externalLanguages[index],
          '.github',
          'workflows',
          'sdk-ci.yml',
        ),
      ),
      `${externalLanguages[index]} is missing its repository CI overlay`,
    );
  }
});

test('the C# generator publishes source to the consumer-facing .NET repository', () => {
  assert.equal(sdkRepository('csharp').slug, 'embedpdf/cloudpdf-sdk-dotnet');
  assert.equal(sdkRepository('csharp').displayName, '.NET');
});

test('every SDK receives a guarded repository release workflow', () => {
  for (const language of externalLanguages) {
    const workflowPath = join(
      repositoryDirectory,
      'fern',
      'repository-overlays',
      language,
      '.github',
      'workflows',
      'sdk-release.yml',
    );
    assert.ok(existsSync(workflowPath), `${language} is missing its release workflow`);
    const workflow = readFileSync(workflowPath, 'utf8');
    assert.match(workflow, /SDK_AUTO_PUBLISH_ENABLED/);
    assert.match(workflow, /environment: release/);
    assert.match(workflow, /cloudpdf-generation\.json/);
    assert.match(workflow, /Protect immutable release tag/);
    assert.match(workflow, /Create GitHub release/);
  }
});

test('release workflows use each registry publishing mechanism', () => {
  const workflow = (language) =>
    readFileSync(
      join(
        repositoryDirectory,
        'fern',
        'repository-overlays',
        language,
        '.github',
        'workflows',
        'sdk-release.yml',
      ),
      'utf8',
    );

  for (const language of ['python', 'csharp', 'ruby']) {
    assert.match(workflow(language), /id-token: write/);
  }
  assert.match(workflow('php'), /repo\.packagist\.org/);
  assert.match(workflow('go'), /proxy\.golang\.org/);
  assert.match(workflow('java'), /central\.sonatype\.com\/api\/v1\/publisher\/upload/);
  assert.match(workflow('java'), /MAVEN_GPG_PRIVATE_KEY/);
});

test('unknown languages and fields fail explicitly', () => {
  assert.throws(() => sdkRepository('swift'), /Unsupported SDK language/);
  assert.throws(() => sdkRepository('typescript'), /monorepo workspace package/);
});
