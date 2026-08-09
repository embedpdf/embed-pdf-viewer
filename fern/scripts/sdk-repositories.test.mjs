import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { LANGUAGES, repositoryDirectory } from './sdk-version.mjs';
import { SDK_REPOSITORIES, sdkRepository } from './sdk-repositories.mjs';

test('every generated language has one distinct public SDK repository', () => {
  assert.deepEqual(Object.keys(SDK_REPOSITORIES).sort(), [...LANGUAGES].sort());

  const slugs = LANGUAGES.map((language) => sdkRepository(language).slug);
  assert.equal(new Set(slugs).size, LANGUAGES.length);
  for (const [index, slug] of slugs.entries()) {
    assert.match(slug, /^embedpdf\/cloudpdf-sdk-[a-z]+$/);
    assert.ok(
      existsSync(
        join(
          repositoryDirectory,
          'fern',
          'repository-overlays',
          LANGUAGES[index],
          '.github',
          'workflows',
          'sdk-ci.yml',
        ),
      ),
      `${LANGUAGES[index]} is missing its repository CI overlay`,
    );
  }
});

test('the C# generator publishes source to the consumer-facing .NET repository', () => {
  assert.equal(sdkRepository('csharp').slug, 'embedpdf/cloudpdf-sdk-dotnet');
  assert.equal(sdkRepository('csharp').displayName, '.NET');
});

test('trusted-publishing SDKs receive guarded repository release workflows', () => {
  for (const language of ['typescript', 'python', 'csharp', 'ruby']) {
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
    assert.match(workflow, /id-token: write/);
    assert.match(workflow, /cloudpdf-generation\.json/);
    assert.match(workflow, /Protect immutable release tag/);
    assert.match(workflow, /Create GitHub release/);
  }
});

test('unknown languages and fields fail explicitly', () => {
  assert.throws(() => sdkRepository('swift'), /Unsupported SDK language/);
});
