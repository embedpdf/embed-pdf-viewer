#!/usr/bin/env node
/**
 * The publish gate: which docs pages are live, for which framework.
 *
 *   node scripts/publish-gate.mjs               check the snippets, write generated/live-pages.json
 *   node scripts/publish-gate.mjs --if-missing  the same, only when there's no live-pages.json yet
 *   node scripts/publish-gate.mjs --strict      the same, and fail as CI does (`strictProblems`)
 *
 * A headless page is live for a framework when its snippets compile for it (`snippets.mjs`) and
 * it names nothing pending in `../reference.mjs`. A pending name holds back the pages whose
 * Methods, State or Events table lists it, read the way the reference check reads them: `print()`
 * holds back Saving, not Opening, though both document the documents capability. A pending name
 * no table lists is one the docs dropped (`save`, now `download()`), so it holds nothing back.
 *
 * A viewer page (`viewer/setup`) is live for a framework, `vanilla` among them, when its snippets
 * and the code it shows compile for it, and `../viewer-pending.mjs` lists nothing that holds it
 * back: a page whose prose promises what the viewer doesn't do yet stays coming everywhere.
 *
 * The sites read `generated/live-pages.json` through `@embedpdf/docs-kit/publish`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REFERENCE } from '../reference.mjs';
import { VIEWER_PENDING } from '../viewer-pending.mjs';
import { FRAMEWORK_LABELS, FRAMEWORKS, VIEWER_INTEGRATIONS } from './compile.mjs';
import { checkSnippets, writeJson } from './snippets.mjs';

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePagesFile = path.join(contentRoot, 'generated/live-pages.json');

// ── the pending names each page lists ───────────────────────────────────────

function section(mdx, heading) {
  const match = mdx.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return match ? match[1] : '';
}

/** The names in the column headed `header` of each table in a section, as `reference.mjs` reads them. */
function namesIn(text, header) {
  const names = new Set();
  let column = -1;
  let inTable = false;
  for (const row of text.split('\n')) {
    if (!row.startsWith('|')) {
      inTable = false;
      continue;
    }
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!inTable) {
      inTable = true;
      column = cells.indexOf(header);
      continue;
    }
    if (column < 0 || /^:?-+:?$/.test(cells[0] ?? '')) continue;
    for (const [, span] of (cells[column] ?? '').matchAll(/`([^`]+)`/g)) {
      const match = span.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/);
      if (match) names.add(match[1]);
    }
  }
  return names;
}

/** The names a page's reference lists: its Methods, State and Events tables. */
function referenceNames(page) {
  const mdx = fs.readFileSync(path.join(contentRoot, page), 'utf8');
  return [
    ...namesIn(section(mdx, 'Methods'), 'Method'),
    ...namesIn(section(mdx, 'State'), 'Read once'),
    ...namesIn(section(mdx, 'Events'), 'Event'),
  ];
}

/** Per page (`text/search`, as the snippet status names it), the pending names it lists. */
function pendingByPage() {
  const byPage = new Map();
  for (const entry of REFERENCE) {
    const pending = entry.pending ?? {};
    for (const listed of entry.pages) {
      const { page, base } = typeof listed === 'string' ? { page: listed } : listed;
      const id = page.replace(/^headless\//, '').replace(/\.mdx$/, '');
      const names = byPage.get(id) ?? new Set();
      for (const name of referenceNames(page)) {
        // `{ page, base }`: a row names a noun's member without the noun (`reply` for `comments.reply`).
        const resolved = base && !name.startsWith(`${base}.`) ? `${base}.${name}` : name;
        if (resolved in pending) names.add(resolved);
        else if (name in pending) names.add(name);
      }
      byPage.set(id, names);
    }
  }
  return byPage;
}

/**
 * Per viewer page (`viewer/setup`, as the snippet status names it), what `../viewer-pending.mjs`
 * says holds it back. Throws on a page the status doesn't have, or an entry without a reason.
 */
export function viewerPendingByPage(pages, pending = VIEWER_PENDING) {
  const byPage = new Map();
  for (const [page, rows] of Object.entries(pending)) {
    const id = `viewer/${page}`;
    if (!(id in pages)) throw new Error(`viewer-pending.mjs: there's no page viewer/${page}.mdx`);
    for (const [row, why] of Object.entries(rows)) {
      if (!/^[A-Z]+\d+$/.test(row) || typeof why !== 'string' || !why.trim()) {
        throw new Error(
          `viewer-pending.mjs: ${page} ${row} needs a gap id and why it holds the page back`,
        );
      }
    }
    byPage.set(id, new Set(Object.keys(rows)));
  }
  return byPage;
}

// ── the status ──────────────────────────────────────────────────────────────

/** Per page: what it names that's pending, and for which frameworks it's live. */
function liveIn(snippetPages, pending = new Map()) {
  const pages = {};
  for (const [page, frameworks] of Object.entries(snippetPages)) {
    const names = [...(pending.get(page) ?? [])].sort();
    const live = {};
    for (const [framework, { compiles }] of Object.entries(frameworks)) {
      live[framework] = compiles && names.length === 0;
    }
    pages[page] = { pending: names, live };
  }
  return pages;
}

function printLive(title, pages, frameworks) {
  const all = Object.values(pages);
  const waiting = all.filter((page) => page.pending.length > 0).length;
  console.log(`${title} (${waiting} of ${all.length} name something pending):`);
  for (const framework of frameworks) {
    const live = all.filter((page) => page.live[framework]).length;
    console.log(
      `  ${FRAMEWORK_LABELS[framework].padEnd(10)} ${String(live).padStart(2)} of ${all.length}`,
    );
  }
}

/**
 * Check the snippets, then write which page is live for which framework: the headless pages and
 * the viewer's, in one `pages`. Returns them, and the snippet status they come from.
 */
export async function writePublishStatus() {
  const snippets = await checkSnippets();
  const headless = liveIn(snippets.pages, pendingByPage());
  const viewer = liveIn(snippets.viewer.pages, viewerPendingByPage(snippets.viewer.pages));
  writeJson(livePagesFile, { pages: { ...headless, ...viewer } });

  printLive('Live headless pages', headless, FRAMEWORKS);
  printLive('Live viewer pages', viewer, VIEWER_INTEGRATIONS);
  console.log(`Wrote ${path.relative(process.cwd(), livePagesFile) || livePagesFile}.`);
  return { headless, viewer, snippets };
}

/**
 * What fails the gate in CI: a compiler that isn't checking (then no page it compiles can be
 * vouched for), and a headless page whose snippets don't compile for a framework. A headless page
 * written ahead of the code names it `pending` in `../reference.mjs` instead. A viewer page that
 * doesn't compile yet is held back and fails nothing: the viewer's pages describe the API it's
 * moving to.
 */
export function strictProblems(snippets) {
  const problems = [];
  const checks = [
    ['headless', snippets.frameworks],
    ['viewer', snippets.viewer.frameworks],
  ];
  for (const [docs, frameworks] of checks) {
    for (const [framework, { tool, reason }] of Object.entries(frameworks)) {
      if (!tool)
        problems.push(`the ${docs} ${FRAMEWORK_LABELS[framework]} check isn't checking: ${reason}`);
    }
  }
  for (const [page, frameworks] of Object.entries(snippets.pages)) {
    for (const [framework, status] of Object.entries(frameworks)) {
      if (status.compiles || !snippets.frameworks[framework]?.tool) continue;
      const [first] = status.errors;
      const where = first.file ? `${first.file}:${first.line}` : first.snippet;
      problems.push(
        `headless/${page}.mdx doesn't compile for ${FRAMEWORK_LABELS[framework]} ` +
          `(${status.errorCount} errors; ${where}: ${first.message})`,
      );
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--if-missing') && fs.existsSync(livePagesFile)) {
    console.log(
      `${path.relative(process.cwd(), livePagesFile)} exists; not checking the snippets again.`,
    );
  } else {
    const { snippets } = await writePublishStatus();
    const problems = process.argv.includes('--strict') ? strictProblems(snippets) : [];
    for (const problem of problems) {
      console.error(process.env.GITHUB_ACTIONS ? `::error::${problem}` : `error: ${problem}`);
    }
    if (problems.length) process.exitCode = 1;
  }
}
