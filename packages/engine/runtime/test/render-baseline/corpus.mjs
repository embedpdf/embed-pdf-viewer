// Finds the documents a baseline covers.
//
// Three sources, each named in the case ids so ids are stable across checkouts:
// - `repo`: every PDF tracked in this repository;
// - `pdfium`: `testing/resources` of the runtime source (skipped when absent);
// - `extra:<name>`: every PDF in a directory listed in `RENDER_BASELINE_EXTRA`.
// The fast profile takes the engine fixtures, every eighth PDFium document and all
// extra documents; the release profile takes everything.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(runtimeRoot, '../../..');

export function collectDocuments(profileName, env = process.env) {
  const documents = [...repoDocuments(profileName), ...pdfiumDocuments(profileName, env)];
  for (const dir of (env.RENDER_BASELINE_EXTRA ?? '').split(path.delimiter).filter(Boolean)) {
    documents.push(...extraDocuments(dir));
  }
  return documents;
}

function repoDocuments(profileName) {
  const tracked = execFileSync('git', ['ls-files', '-z', '*.pdf'], { cwd: repoRoot })
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort();
  const chosen =
    profileName === 'fast'
      ? tracked.filter((file) => /^packages\/[^/]+\/[^/]+\/test\/fixtures\/[^/]+\.pdf$/.test(file))
      : tracked;
  return chosen.map((file) => ({ id: `repo:${file}`, file: path.join(repoRoot, file) }));
}

function pdfiumDocuments(profileName, env) {
  const root =
    env.RENDER_BASELINE_PDFIUM ?? path.join(runtimeRoot, 'runtime-src/testing/resources');
  if (!existsSync(root)) return [];
  const files = walkPdfs(root).sort();
  const chosen = profileName === 'fast' ? files.filter((_, i) => i % 8 === 0) : files;
  return chosen.map((file) => ({ id: `pdfium:${path.relative(root, file)}`, file }));
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
