// Finds the documents a baseline covers.
//
// Four sources, each named in the case ids so ids are stable across checkouts:
// - `fixture`: the documents in fixtures/ next to this file, every page;
// - `repo`: every other PDF tracked in this repository;
// - `pdfium`: `testing/resources` of the runtime source (skipped when absent);
// - `extra:<name>`: every PDF in a directory listed in `RENDER_BASELINE_EXTRA`.
// The fast profile takes the engine fixtures, about one PDFium document in eight and all
// extra documents; the release profile takes everything.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(runtimeRoot, '../../..');

export function collectDocuments(profileName, env = process.env) {
  const documents = [
    ...fixtureDocuments(),
    ...repoDocuments(profileName),
    ...pdfiumDocuments(profileName, env),
  ];
  for (const dir of (env.RENDER_BASELINE_EXTRA ?? '').split(path.delimiter).filter(Boolean)) {
    documents.push(...extraDocuments(dir));
  }
  return documents;
}

// Documents made for these baselines (see fixtures/): every page, in every profile.
function fixtureDocuments() {
  const dir = path.join(runtimeRoot, 'test/render-baseline/fixtures');
  return walkPdfs(dir)
    .sort()
    .map((file) => ({ id: `fixture:${path.relative(dir, file)}`, file, allPages: true }));
}

function repoDocuments(profileName) {
  const tracked = execFileSync('git', ['ls-files', '-z', '*.pdf'], { cwd: repoRoot })
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort();
  const own = 'packages/engine/runtime/test/render-baseline/fixtures/';
  const chosen = (
    profileName === 'fast'
      ? tracked.filter((file) => /^packages\/[^/]+\/[^/]+\/test\/fixtures\/[^/]+\.pdf$/.test(file))
      : tracked
  ).filter((file) => !file.startsWith(own));
  return chosen.map((file) => ({ id: `repo:${file}`, file: path.join(repoRoot, file) }));
}

function pdfiumDocuments(profileName, env) {
  const root =
    env.RENDER_BASELINE_PDFIUM ?? path.join(runtimeRoot, 'runtime-src/testing/resources');
  if (!existsSync(root)) return [];
  const files = walkPdfs(root).sort();
  const chosen =
    profileName === 'fast' ? files.filter((file) => sampled(path.relative(root, file))) : files;
  return chosen.map((file) => ({ id: `pdfium:${path.relative(root, file)}`, file }));
}

// About one document in eight, chosen by name so the sample does not shift when
// documents are added or removed.
function sampled(name) {
  return createHash('sha256').update(name).digest()[0] % 8 === 0;
}

function extraDocuments(dir) {
  const name = path.basename(path.resolve(dir));
  return walkPdfs(dir)
    .sort()
    .map((file) => ({ id: `extra:${name}/${path.relative(dir, file)}`, file }));
}

function walkPdfs(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) found.push(...walkPdfs(full));
    else if (entry.toLowerCase().endsWith('.pdf')) found.push(full);
  }
  return found;
}
