#!/usr/bin/env node
// Publish-phase tripwire — runs as the first command of `ci:publish`.
//
// `pnpm publish -r` is version-presence-driven: it ships every workspace
// package whose (name, version) is missing from the registry. A publishable
// package that dodged versioning (missing from the `fixed` group in
// .changeset/config.json and covered by no changeset) would quietly publish
// at its stale baseline (e.g. 2.15.0) and read on npm as a v2-compatible
// release. This script turns that into a hard failure at the only moment it
// matters — and also refuses to let the version line and the npm dist-tag
// disagree (a prerelease must never land on `latest`; a stable release must
// never hide behind `next`).
//
// The expected shape is derived from .changeset/pre.json, so GA promotion
// needs no edit here: the assertions flip on their own once
// `changeset pre exit` lands and the stable Version PR is merged.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(lines) {
  console.error(['✖ publish blocked (scripts/assert-publish-phase.mjs):', ...lines].join('\n'));
  process.exit(1);
}

const prePath = path.join(root, '.changeset', 'pre.json');
const pre = existsSync(prePath) ? JSON.parse(readFileSync(prePath, 'utf8')) : undefined;
const inPre = pre?.mode === 'pre';
const tag = pre?.tag;
if (inPre && !tag) {
  fail(['  .changeset/pre.json is in pre mode but carries no `tag`.']);
}

// Same source of truth the release workflow uses for name→path mapping: ask
// the workspace, never reconstruct package lists by hand.
const projects = JSON.parse(
  execSync('pnpm ls -r --depth -1 --json', {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);
const publishable = projects.filter((p) => p.name && p.private !== true);
if (publishable.length === 0) {
  fail(['  found no publishable workspace packages — refusing to publish blind.']);
}

const onExpectedLine = (v) =>
  typeof v === 'string' && (inPre ? v.includes(`-${tag}.`) : !v.includes('-'));
const offenders = publishable.filter((p) => !onExpectedLine(p.version));
if (offenders.length > 0) {
  fail(
    [
      inPre
        ? `  ${offenders.length} publishable package(s) are not on the \`-${tag}.\` prerelease line:`
        : `  ${offenders.length} publishable package(s) still carry a prerelease version:`,
      ...offenders.map((p) => `    ${p.name}@${p.version}`),
      inPre
        ? '  Likely cause: missing from the `fixed` group in .changeset/config.json (and covered'
        : '  Likely cause: `changeset pre exit` landed but the stable Version PR has not been merged.',
      inPre
        ? '  by no changeset), so `changeset version` never moved it off the old baseline.'
        : null,
    ].filter(Boolean),
  );
}

// Dist-tag agreement: the version line and the npm dist-tag must describe the
// same channel.
const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const publishCmd = rootPkg.scripts?.['ci:publish'] ?? '';
const tagFlag = publishCmd.match(/--tag\s+(\S+)/)?.[1];
if (inPre && tagFlag !== tag) {
  fail([
    `  pre mode ("${tag}") is active but ci:publish passes ${tagFlag ? `\`--tag ${tagFlag}\`` : 'no `--tag`'} —`,
    `  a prerelease must never land on the \`latest\` dist-tag. Add \`--tag ${tag}\`.`,
  ]);
}
if (!inPre && tagFlag) {
  fail([
    `  stable phase, but ci:publish still passes \`--tag ${tagFlag}\` — the release would not`,
    '  move `latest`. Remove the flag (GA checklist step 2 in .github/workflows/release.yml).',
  ]);
}

console.log(
  `✓ assert-publish-phase: ${publishable.length} publishable packages ${
    inPre
      ? `on the \`-${tag}.\` line, publishing under --tag ${tag}`
      : 'on stable versions, publishing to `latest`'
  }.`,
);
