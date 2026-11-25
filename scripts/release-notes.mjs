#!/usr/bin/env node
// A release's notes, written from the packages' changelogs: the body of the
// version pull request while it is open, and the GitHub release once it is out.
// Both have a size limit on GitHub. Notes that fit are written whole; notes that
// don't have their longest entries shortened, with a link to the changelog.
//
//   node scripts/release-notes.mjs    # print the notes of this checkout

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** GitHub refuses a pull request body over 65,536 characters. */
export const PULL_REQUEST_LIMIT = 64_000;
/** GitHub refuses a release over 125,000 characters. */
export const RELEASE_LIMIT = 120_000;

/** Their entries carry no author: the notes name only contributors. */
const MAINTAINERS = new Set(['bobsingor']);

/** The packages people install come first, the ones those are built on last. */
const ORDER = [
  'packages/viewer/main/',
  'packages/viewer/',
  'packages/framework/',
  'packages/engine/main/',
  'cloudpdf/viewer/',
  'cloudpdf/server/',
  'cloudpdf/',
  'packages/plugin/',
  'packages/',
];

const RELEASES_HEADING = /^# Releases[ \t]*$/m;

const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

// ── what a release holds ──

/** The public packages whose version changed since the last release's tag. */
export function readRelease() {
  // From the parent, since the commit a release is made from may carry its tag already.
  const since = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD^');
  const projects = JSON.parse(run('pnpm', ['ls', '-r', '--depth', '-1', '--json']));
  const packages = projects
    .filter((project) => project.name && project.version && !project.private)
    .map(({ name, version, path: location }) => ({
      name,
      version,
      directory: path.relative(root, location).split(path.sep).join('/'),
    }))
    .filter(({ directory, version }) => versionAt(since, directory) !== version)
    .map((pkg) => ({ ...pkg, changelog: readChangelog(pkg.directory) }));
  return { packages, isEarlier: (commit) => isAncestor(commit, since) };
}

function versionAt(ref, directory) {
  try {
    return JSON.parse(git('show', `${ref}:${directory}/package.json`)).version;
  } catch {
    // A package added since then.
    return undefined;
  }
}

function readChangelog(directory) {
  try {
    return readFileSync(path.join(root, directory, 'CHANGELOG.md'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function isAncestor(commit, ref) {
  try {
    git('merge-base', '--is-ancestor', commit, ref);
    return true;
  } catch {
    return false;
  }
}

function git(...args) {
  return run('git', args).trim();
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ── the notes ──

/**
 * The notes of `packages`, at most `limit` characters. `ref` is the commit or
 * tag a shortened package's changelog is linked at.
 */
export function writeNotes(packages, { repository, ref, limit }) {
  const read = packages.map((pkg) => ({
    ...pkg,
    entries: readEntries(pkg.changelog, pkg.version, repository),
    folded: false,
  }));
  const changed = read.filter((pkg) => pkg.entries.length > 0).sort(inOrder);
  const unchanged = read.length - changed.length;
  const entries = changed.flatMap((pkg) => pkg.entries);

  const draw = () =>
    [
      ...changed.map((pkg) => drawPackage(pkg, { repository, ref })),
      ...(unchanged > 0 ? [drawUnchanged(unchanged, changed.length > 0)] : []),
    ].join('\n\n');

  let notes = draw();
  while (notes.length > limit) {
    const entry = longest(entries.filter(({ form, forms }) => form < forms.length - 1));
    if (!entry) break;
    entry.form += 1;
    notes = draw();
  }
  for (const pkg of changed.toReversed()) {
    if (notes.length <= limit) break;
    pkg.folded = true;
    notes = draw();
  }
  return notes;
}

function inOrder(a, b) {
  const rank = ({ directory }) => {
    const index = ORDER.findIndex((prefix) => `${directory}/`.startsWith(prefix));
    return index < 0 ? ORDER.length : index;
  };
  return rank(a) - rank(b) || (a.directory < b.directory ? -1 : 1);
}

function longest(entries) {
  return entries.reduce(
    (best, entry) => (!best || textOf(entry).length > textOf(best).length ? entry : best),
    undefined,
  );
}

function textOf({ form, forms }) {
  return form === 0 ? forms[0] : `${forms[form]} …`;
}

function drawPackage(pkg, { repository, ref }) {
  const blocks = [`## ${pkg.name}@${pkg.version}`];
  if (pkg.folded) {
    blocks.push(pkg.entries.length === 1 ? '1 change.' : `${pkg.entries.length} changes.`);
  } else {
    let heading;
    for (const entry of pkg.entries) {
      if (entry.heading && entry.heading !== heading) blocks.push(`### ${entry.heading}`);
      heading = entry.heading;
      blocks.push(textOf(entry));
    }
  }
  if (pkg.folded || pkg.entries.some(({ form }) => form > 0)) {
    const { owner, repo } = repository;
    const anchor = pkg.version.replace(/[^\w-]/g, '');
    blocks.push(
      `[Full notes](https://github.com/${owner}/${repo}/blob/${ref}/${pkg.directory}/CHANGELOG.md#${anchor})`,
    );
  }
  return blocks.join('\n\n');
}

function drawUnchanged(count, isRest) {
  const packages = `${count}${isRest ? ' more' : ''} ${count === 1 ? 'package gets' : 'packages get'}`;
  return `## Other packages\n\n${packages} a new version with no changes of their own.`;
}

// ── a changelog's entries ──

/** One version's entries, each with the forms it can be written in, the whole one first. */
function readEntries(changelog, version, repository) {
  const entries = [];
  let heading = '';
  let current;
  for (const line of sectionOf(changelog, version)) {
    const match = /^### (.+)/.exec(line);
    if (match) {
      heading = match[1].trim();
      current = undefined;
    } else if (line.startsWith('- ') || (!current && line.trim())) {
      current = { heading, lines: [line] };
      entries.push(current);
    } else {
      current?.lines.push(line);
    }
  }
  return entries.map(({ heading, lines }) => ({
    heading,
    forms: formsOf(shortenLinks(lines.join('\n').trimEnd(), repository)),
    form: 0,
  }));
}

function sectionOf(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `## ${version}`);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

/**
 * GitHub links `#123` itself in a pull request and in a release. In a changelog
 * file it doesn't, so those keep the whole link.
 */
function shortenLinks(text, { owner, repo }) {
  const home = `https://github.com/${owner}/${repo}`;
  return text
    .replace(/\[#(\d+)\]\((\S+?)\/(?:pull|issues)\/(\d+)\)/g, (link, shown, base, number) =>
      base === home && number === shown ? `#${number}` : link,
    )
    .replace(/ by \[@([^\]]+)\]\([^)]+\)(?= –)/, (author, login) =>
      MAINTAINERS.has(login) ? '' : author,
    );
}

/** The whole entry, then its first paragraph, then its first sentence. */
function formsOf(whole) {
  // A note that opens with a list has its text in the first item.
  const text = whole.replace(/^(-(?: .* –)?)\s*\n\s*(?:[-*+]|\d+[.)]) /, '$1 ');
  const lines = text.split('\n');
  // A list, a fence, a table or a quote ends the paragraph too.
  const end = lines.findIndex(
    (line, index) =>
      index > 0 && (!line.trim() || /^\s*(?:[-*+] |\d+[.)] |```|~~~|[|>])/.test(line)),
  );
  const paragraph = (end < 0 ? lines : lines.slice(0, end))
    .map((line, index) => (index === 0 ? line.trimEnd() : line.trim()))
    .join(' ');
  const sentence = firstSentence(paragraph);
  return [whole, ...(end < 0 ? [] : [paragraph]), ...(sentence === paragraph ? [] : [sentence])];
}

function firstSentence(text) {
  let end = 0;
  for (const { segment } of sentences.segment(text)) {
    end += segment.length;
    const sentence = text.slice(0, end).trimEnd();
    if (isClosed(sentence)) return sentence;
  }
  return text;
}

/** Whether `text` leaves no code span, emphasis or link open. */
function isClosed(text) {
  const count = (pattern) => text.match(pattern)?.length ?? 0;
  return (
    count(/`/g) % 2 === 0 &&
    count(/\*\*/g) % 2 === 0 &&
    count(/\[/g) === count(/\]/g) &&
    count(/\(/g) === count(/\)/g)
  );
}

// ── on GitHub ──

/** Writes the notes into the version pull request, under the text the Changesets action put there. */
export async function writePullRequestNotes({
  github,
  repository,
  number,
  release = readRelease(),
  ref = git('rev-parse', 'HEAD'),
}) {
  const { data } = await github.rest.pulls.get({ ...repository, pull_number: number });
  const [introduction] = (data.body ?? '').split(RELEASES_HEADING);
  const top = `${introduction.trimEnd()}\n\n# Releases\n\n`.trimStart();
  const notes = writeNotes(release.packages, {
    repository,
    ref,
    limit: PULL_REQUEST_LIMIT - top.length,
  });
  await github.rest.pulls.update({ ...repository, pull_number: number, body: `${top}${notes}` });
}

/**
 * The notes of the release tagged `tag`: what a person wrote in its version
 * pull request, or the packages' changelogs.
 */
export async function releaseNotes({ github, repository, tag, release = readRelease() }) {
  return (
    (await writtenByHand({ github, repository, release })) ??
    writeNotes(release.packages, { repository, ref: tag, limit: RELEASE_LIMIT })
  );
}

/** The version pull request's notes when a person was the last to edit its body. */
async function writtenByHand({ github, repository, release }) {
  const data = await github.graphql(
    `query ($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(headRefName: "changeset-release/main", baseRefName: "main", states: MERGED, last: 1) {
          nodes { body editor { __typename } mergeCommit { oid } }
        }
      }
    }`,
    repository,
  );
  const [pull] = data.repository.pullRequests.nodes;
  if (pull?.editor?.__typename !== 'User') return undefined;
  if (release.isEarlier(pull.mergeCommit.oid)) return undefined;
  const [introduction, ...notes] = pull.body.split(RELEASES_HEADING);
  return (notes.length > 0 ? notes.join('# Releases') : introduction).trim() || undefined;
}

// ── the command ──

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(path.join(root, '.changeset', 'config.json'), 'utf8'));
  const [owner, repo] = config.changelog[1].repo.split('/');
  const { packages } = readRelease();
  console.log(
    writeNotes(packages, { repository: { owner, repo }, ref: 'main', limit: RELEASE_LIMIT }),
  );
}
