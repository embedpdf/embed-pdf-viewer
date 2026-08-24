#!/usr/bin/env node
// New-package name bootstrap — the local half of trusted publishing.
//
// npm cannot attach a trusted-publisher configuration to a package that does
// not exist yet, and CI has no long-lived token (by design). So a brand-new
// package is born in two steps:
//
//   1. THIS SCRIPT (run by a human, locally): publish a tiny claim stub —
//      version 0.0.0-bootstrap.0 under the `bootstrap` dist-tag — using your
//      interactive npm session + 2FA OTP. No token is involved anywhere;
//      the OTP prompt is the one publish path npm never restricts.
//   2. Attach the trusted publisher to the now-existing name (command is
//      printed on success), after which the next release train publishes the
//      real package from CI via OIDC like every other workspace package.
//
// The stub is synthesized in a temp directory OUTSIDE the repo: the repo
// .npmrc wires auth to ${NPM_TOKEN}, and this flow must work with no token
// in the environment at all. Only your user-level npm login applies.
//
// Usage:
//   pnpm bootstrap:package <@scope/name | workspace/dir> [--dry-run]

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_REPO_URL = 'git+https://github.com/embedpdf/embed-pdf-viewer.git';
const STUB_VERSION = '0.0.0-bootstrap.0';
const STUB_TAG = 'bootstrap';

function fail(lines) {
  console.error(['✖ bootstrap aborted (scripts/bootstrap-package.mjs):', ...lines].join('\n'));
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.log('Usage: pnpm bootstrap:package <@scope/name | workspace/dir> [--dry-run]');
  process.exit(args.length === 0 ? 1 : 0);
}
if (process.env.CI) {
  fail(['  this is a local human ritual (interactive 2FA OTP); it must not run in CI.']);
}

// Ask the workspace, never reconstruct: resolve the target to a workspace
// package whether the caller passed a name or a directory.
const projects = JSON.parse(
  execFileSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
    // stderr suppressed: the repo .npmrc references ${NPM_TOKEN}, which is
    // deliberately unset in this flow and would only print scary warnings.
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
).filter((p) => p.name && p.path);

const project = target.startsWith('@')
  ? projects.find((p) => p.name === target)
  : projects.find((p) => path.resolve(root, target) === p.path);
if (!project) {
  fail([
    `  ${target} is not a workspace package (checked name and path).`,
    '  Create the package directory with its package.json first.',
  ]);
}

const manifest = JSON.parse(readFileSync(path.join(project.path, 'package.json'), 'utf8'));
if (manifest.private === true) {
  fail([`  ${manifest.name} is private — private packages are never published or bootstrapped.`]);
}

const relDir = path.relative(root, project.path);
const repository = {
  type: 'git',
  url: normalizeGitUrl(manifest.repository?.url ?? CANONICAL_REPO_URL),
  directory: manifest.repository?.directory ?? relDir,
};
if (!manifest.repository?.url || !manifest.repository?.directory) {
  console.warn(
    `⚠ ${manifest.name}: package.json is missing repository.url/.directory — the stub derives\n` +
      `  them (${repository.url} @ ${repository.directory}), but the REAL manifest needs the\n` +
      '  fields before its first CI publish (npm provenance requires them).',
  );
}

// A temp cwd keeps the repo .npmrc (and its ${NPM_TOKEN} substitution) out of
// scope for every registry interaction below.
const workDir = mkdtempSync(path.join(os.tmpdir(), 'epdf-bootstrap-'));
process.on('exit', () => rmSync(workDir, { recursive: true, force: true }));

// Already published? Then there is nothing to claim — go straight to trust.
const view = spawnSync('npm', ['view', manifest.name, 'versions', '--json'], {
  cwd: workDir,
  encoding: 'utf8',
});
const missing = view.status !== 0 && /E404|not found/i.test(view.stderr + view.stdout);
if (view.status === 0) {
  console.log(`✔ ${manifest.name} already exists on the registry — no bootstrap needed.`);
  printTrustSteps(manifest.name);
  process.exit(0);
}
if (!missing) {
  fail([
    `  could not determine whether ${manifest.name} exists on the registry:`,
    ...(view.stderr || 'no error output').trim().split('\n').map((l) => `    ${l}`),
  ]);
}

const stub = {
  name: manifest.name,
  version: STUB_VERSION,
  description: `${manifest.description ?? manifest.name} (name claim — real releases are published from CI via npm trusted publishing)`,
  license: manifest.license ?? 'Apache-2.0',
  repository,
};
writeFileSync(path.join(workDir, 'package.json'), `${JSON.stringify(stub, null, 2)}\n`);
writeFileSync(
  path.join(workDir, 'README.md'),
  [
    `# ${manifest.name}`,
    '',
    `This version (\`${STUB_VERSION}\`, dist-tag \`${STUB_TAG}\`) is a name claim so npm`,
    'trusted publishing can be attached to the package. Real releases are published',
    `from CI: https://github.com/embedpdf/embed-pdf-viewer (${relDir}).`,
    '',
  ].join('\n'),
);

console.log(
  `▸ publishing claim stub ${manifest.name}@${STUB_VERSION} (dist-tag: ${STUB_TAG})` +
    `${dryRun ? ' [dry-run]' : ' — npm will prompt for your 2FA OTP'}`,
);
const publish = spawnSync(
  'npm',
  ['publish', '--access', 'public', '--tag', STUB_TAG, ...(dryRun ? ['--dry-run'] : [])],
  { cwd: workDir, stdio: 'inherit' },
);
if (publish.status !== 0) {
  fail([
    '  npm publish failed (see output above).',
    '  Not logged in? Run `npm login` first — the whole point of this flow is that it',
    '  uses your interactive session + OTP, never a token.',
  ]);
}

console.log(`✔ ${dryRun ? 'dry-run complete for' : 'claimed'} ${manifest.name}`);
printTrustSteps(manifest.name);

function printTrustSteps(name) {
  // Mirror the workflow's actual environment so the trusted-publisher config
  // can never disagree with what release.yml presents at publish time.
  const releaseYml = readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  const environment = releaseYml.match(/^\s*environment:\s*([\w-]+)\s*$/m)?.[1];
  console.log(
    [
      '',
      'Next: attach the trusted publisher (needs account 2FA; npm >= 11.15 via npx):',
      '',
      `  npx npm@latest trust github ${name} \\`,
      '    --repo embedpdf/embed-pdf-viewer \\',
      `    --file release.yml \\`,
      ...(environment ? [`    --environment ${environment} \\`] : []),
      '    --allow-publish',
      '',
      ...(environment
        ? []
        : [
            'note: release.yml pins no GitHub environment yet — once it gains one',
            '(e.g. npm-release), re-run trust with --environment to match.',
            '',
          ]),
      'or via the web UI: npmjs.com package page → Settings → Trusted Publisher.',
      'The next release train then publishes the real package from CI via OIDC.',
    ].join('\n'),
  );
}

function normalizeGitUrl(url) {
  // npm normalizes repository URLs to `git+https://…​.git` at publish time;
  // do it up front so the stub publishes without manifest-correction warnings.
  let out = url;
  if (!out.startsWith('git+')) out = `git+${out}`;
  if (!out.endsWith('.git')) out = `${out}.git`;
  return out;
}
