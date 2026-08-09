import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { readCanonicalVersion } from './sdk-version.mjs';

const script = fileURLToPath(new URL('./sync-sdk-repository.mjs', import.meta.url));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

test('sync creates and safely updates a reused PR branch while preserving repository workflows', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'cloudpdf-sdk-sync-test-'));
  try {
    const remote = join(fixture, 'remote.git');
    const seed = join(fixture, 'seed');
    const generated = join(fixture, 'generated');
    const fakeBin = join(fixture, 'bin');
    const ghLog = join(fixture, 'gh.log');
    const inspection = join(fixture, 'inspection');
    mkdirSync(seed);
    mkdirSync(join(seed, '.github', 'workflows'), { recursive: true });
    mkdirSync(generated);
    mkdirSync(join(generated, 'node_modules', 'ignored'), { recursive: true });
    mkdirSync(fakeBin);

    run('git', ['init', '--bare', remote]);
    run('git', ['init'], { cwd: seed });
    run('git', ['config', 'user.name', 'Fixture'], { cwd: seed });
    run('git', ['config', 'user.email', 'fixture@example.com'], { cwd: seed });
    writeFileSync(join(seed, 'README.md'), 'seed\n');
    writeFileSync(join(seed, '.github', 'workflows', 'existing.yml'), 'name: Existing\n');
    run('git', ['add', '--all'], { cwd: seed });
    run('git', ['commit', '-m', 'seed'], { cwd: seed });
    run('git', ['branch', '-M', 'main'], { cwd: seed });
    run('git', ['remote', 'add', 'origin', remote], { cwd: seed });
    run('git', ['push', '-u', 'origin', 'main'], { cwd: seed });

    const canonicalVersion = readCanonicalVersion();
    writeFileSync(join(generated, 'README.md'), 'generated\n');
    writeFileSync(join(generated, 'node_modules', 'ignored', 'file.js'), 'ignored\n');
    writeFileSync(
      join(generated, 'cloudpdf-generation.json'),
      `${JSON.stringify(
        {
          language: 'typescript',
          canonicalVersion,
          sdkVersion: canonicalVersion,
          source: { openapiSha256: 'fixture', gitCommit: 'fixture' },
        },
        null,
        2,
      )}\n`,
    );

    const fakeGh = join(fakeBin, 'gh');
    writeFileSync(
      fakeGh,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
case "$1 $2" in
  "pr list") exit 0 ;;
  "pr create") printf '%s\\n' 'https://github.com/embedpdf/cloudpdf-sdk-typescript/pull/1' ;;
  "pr merge") exit 0 ;;
  *) printf '%s\\n' "unexpected gh invocation: $*" >&2; exit 1 ;;
esac
`,
    );
    chmodSync(fakeGh, 0o700);

    run(process.execPath, [script, 'typescript'], {
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        GH_LOG: ghLog,
        GH_TOKEN: 'fixture-token',
        SDK_GITHUB_TOKEN: 'fixture-token',
        SDK_GENERATED_DIRECTORY: generated,
        SDK_REPOSITORY_REMOTE_URL: remote,
        SDK_AUTO_MERGE: 'true',
      },
    });

    // Auto-merge may leave its head ref behind. Regenerating the same canonical
    // version must safely replace that existing ref using an explicit lease.
    writeFileSync(join(generated, 'README.md'), 'generated again\n');
    run(process.execPath, [script, 'typescript'], {
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        GH_LOG: ghLog,
        GH_TOKEN: 'fixture-token',
        SDK_GITHUB_TOKEN: 'fixture-token',
        SDK_GENERATED_DIRECTORY: generated,
        SDK_REPOSITORY_REMOTE_URL: remote,
        SDK_AUTO_MERGE: 'true',
      },
    });

    const branch = `automation/cloudpdf-sdk-v${canonicalVersion}`;
    run('git', ['clone', '--branch', branch, remote, inspection]);
    assert.equal(readFileSync(join(inspection, 'README.md'), 'utf8'), 'generated again\n');
    assert.equal(
      readFileSync(join(inspection, '.github', 'workflows', 'existing.yml'), 'utf8'),
      'name: Existing\n',
    );
    assert.ok(existsSync(join(inspection, '.github', 'workflows', 'sdk-ci.yml')));
    assert.equal(existsSync(join(inspection, 'node_modules')), false);
    const ghInvocations = readFileSync(ghLog, 'utf8');
    assert.match(ghInvocations, /pr merge .* --auto --squash --delete-branch/);
    assert.equal(ghInvocations.match(/^pr create /gm)?.length, 2);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
