#!/usr/bin/env node

import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

import { sdkRepository } from './sdk-repositories.mjs';
import { LANGUAGES, readCanonicalVersion, repositoryDirectory } from './sdk-version.mjs';

const language = process.argv[2];
if (!LANGUAGES.includes(language)) {
  console.error(`Usage: node fern/scripts/sync-sdk-repository.mjs ${LANGUAGES.join('|')}`);
  process.exit(2);
}

const token = process.env.SDK_GITHUB_TOKEN;
if (!token) throw new Error('SDK_GITHUB_TOKEN is required');
if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required for GitHub pull requests');

const repository = sdkRepository(language);
const canonicalVersion = readCanonicalVersion();
const generatedDirectory =
  process.env.SDK_GENERATED_DIRECTORY ?? join(repositoryDirectory, 'sdks', language);
const generation = JSON.parse(
  readFileSync(join(generatedDirectory, 'cloudpdf-generation.json'), 'utf8'),
);

if (generation.language !== language) throw new Error(`${language}: generation language is stale`);
if (generation.canonicalVersion !== canonicalVersion) {
  throw new Error(
    `${language}: generated ${generation.canonicalVersion}, expected ${canonicalVersion}`,
  );
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), `cloudpdf-${language}-sdk-sync-`));
const checkoutDirectory = join(temporaryDirectory, repository.name);
const askPassPath = join(temporaryDirectory, 'git-askpass.sh');
writeFileSync(
  askPassPath,
  `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' 'x-access-token' ;;
  *Password*) printf '%s\\n' "$SDK_GITHUB_TOKEN" ;;
esac
`,
  { mode: 0o700 },
);

const commandEnvironment = {
  ...process.env,
  GIT_ASKPASS: askPassPath,
  GIT_TERMINAL_PROMPT: '0',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: commandEnvironment,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}${detail}`);
  }
  return options.capture ? (result.stdout ?? '').trim() : '';
}

function copyTree(source, target, sourceRoot = source) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const relativePath = relative(sourceRoot, sourcePath);
    const parts = relativePath.split('/');
    if (parts[0] === '.github') continue;
    if (
      parts.some((part) =>
        new Set([
          'node_modules',
          'dist',
          'build',
          '.gradle',
          'bin',
          'obj',
          'fern-dist',
          '__pycache__',
        ]).has(part),
      )
    ) {
      continue;
    }

    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, sourceRoot);
    } else if (entry.isSymbolicLink()) {
      cpSync(sourcePath, targetPath, { dereference: false });
    } else {
      copyFileSync(sourcePath, targetPath);
      chmodSync(targetPath, lstatSync(sourcePath).mode);
    }
  }
}

try {
  run('git', [
    'clone',
    '--depth=1',
    '--branch=main',
    process.env.SDK_REPOSITORY_REMOTE_URL ?? `https://github.com/${repository.slug}.git`,
    checkoutDirectory,
  ]);

  const branch = `automation/cloudpdf-sdk-v${canonicalVersion.replaceAll(/[^0-9A-Za-z._-]/g, '-')}`;
  const remoteBranchRef = `refs/heads/${branch}`;
  const remoteBranch = run('git', ['ls-remote', '--heads', 'origin', remoteBranchRef], {
    cwd: checkoutDirectory,
    capture: true,
  });
  const remoteBranchSha = remoteBranch ? remoteBranch.split(/\s+/)[0] : '';
  if (remoteBranchSha && !/^[0-9a-f]+$/.test(remoteBranchSha)) {
    throw new Error(`${repository.slug}: invalid remote branch SHA ${remoteBranchSha}`);
  }
  run('git', ['checkout', '-B', branch, 'origin/main'], { cwd: checkoutDirectory });
  run('git', ['config', 'user.name', 'cloudpdf-sdk-bot'], { cwd: checkoutDirectory });
  run('git', ['config', 'user.email', 'hello@cloudpdf.com'], { cwd: checkoutDirectory });

  // SDK repositories are generated-source repositories. Keep `.github`
  // repository-owned so CI and future registry workflows survive regeneration;
  // replace every other path with the exact validated Fern output.
  for (const entry of readdirSync(checkoutDirectory)) {
    if (entry === '.git' || entry === '.github') continue;
    rmSync(join(checkoutDirectory, entry), { recursive: true, force: true });
  }
  copyTree(generatedDirectory, checkoutDirectory);

  const overlayDirectory = join(repositoryDirectory, 'fern', 'repository-overlays', language);
  if (!existsSync(overlayDirectory)) throw new Error(`Missing repository overlay for ${language}`);
  cpSync(overlayDirectory, checkoutDirectory, { recursive: true, force: true });

  run('git', ['add', '--all'], { cwd: checkoutDirectory });
  const staged = run('git', ['diff', '--cached', '--name-only'], {
    cwd: checkoutDirectory,
    capture: true,
  });
  if (!staged) {
    console.log(`${repository.slug}: already matches CloudPDF SDK ${generation.sdkVersion}`);
  } else {
    run(
      'git',
      [
        'commit',
        '-m',
        `chore: generate CloudPDF ${repository.displayName} SDK ${generation.sdkVersion}`,
      ],
      { cwd: checkoutDirectory },
    );
    // The clone is intentionally shallow and tracks only main, so generic
    // --force-with-lease cannot infer the expected value for a previously used
    // automation branch. Pin the lease to the exact SHA observed above. An
    // empty expected SHA means the branch must still be absent.
    run(
      'git',
      [
        'push',
        'origin',
        `HEAD:${remoteBranchRef}`,
        `--force-with-lease=${remoteBranchRef}:${remoteBranchSha}`,
      ],
      { cwd: checkoutDirectory },
    );

    let pullRequestUrl = run(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        repository.slug,
        '--head',
        branch,
        '--state',
        'open',
        '--json',
        'url',
        '--jq',
        '.[0].url // ""',
      ],
      { capture: true },
    );

    if (!pullRequestUrl) {
      const bodyPath = join(temporaryDirectory, 'pull-request.md');
      writeFileSync(
        bodyPath,
        `Automated CloudPDF ${repository.displayName} SDK generation.

- Canonical release: \`${canonicalVersion}\`
- Ecosystem version: \`${generation.sdkVersion}\`
- OpenAPI SHA-256: \`${generation.source.openapiSha256}\`
- Source commit: \`${process.env.GITHUB_SHA ?? generation.source.gitCommit ?? 'unknown'}\`

This PR updates generated source and repository-owned automation. Registry publication remains gated by the SDK repository's release workflow and environment.
`,
      );
      pullRequestUrl = run(
        'gh',
        [
          'pr',
          'create',
          '--repo',
          repository.slug,
          '--base',
          'main',
          '--head',
          branch,
          '--title',
          `chore: generate CloudPDF ${repository.displayName} SDK ${generation.sdkVersion}`,
          '--body-file',
          bodyPath,
        ],
        { capture: true },
      );
    }

    console.log(`${repository.slug}: ${pullRequestUrl}`);
    if (process.env.SDK_AUTO_MERGE === 'true') {
      run('gh', ['pr', 'merge', pullRequestUrl, '--auto', '--squash', '--delete-branch']);
      console.log(`${repository.slug}: auto-merge enabled`);
    }
  }
} finally {
  // This is the mkdtemp-owned directory created above; never remove a caller
  // path or unresolved environment-variable target.
  if (basename(temporaryDirectory).startsWith(`cloudpdf-${language}-sdk-sync-`)) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
