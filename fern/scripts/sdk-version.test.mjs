import assert from 'node:assert/strict';
import test from 'node:test';

import { LANGUAGES, mapSdkVersion } from './sdk-version.mjs';

test('stable CloudPDF versions are identical in every ecosystem', () => {
  for (const language of LANGUAGES) {
    assert.equal(mapSdkVersion('3.0.0', language), '3.0.0');
  }
});

test('next prereleases use each ecosystem native syntax', () => {
  assert.deepEqual(
    Object.fromEntries(
      LANGUAGES.map((language) => [language, mapSdkVersion('3.0.0-next.12', language)]),
    ),
    {
      typescript: '3.0.0-next.12',
      python: '3.0.0a12',
      php: '3.0.0-alpha.12',
      csharp: '3.0.0-next.12',
      go: '3.0.0-next.12',
      java: '3.0.0-alpha.12',
      ruby: '3.0.0.alpha.12',
    },
  );
});

test('unsupported canonical prerelease conventions fail explicitly', () => {
  assert.throws(() => mapSdkVersion('3.0.0-beta.1', 'typescript'), /Unsupported CloudPDF version/);
});
