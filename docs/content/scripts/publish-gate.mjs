#!/usr/bin/env node
/**
 * The publish gate: which headless pages are live, for which framework.
 *
 *   node scripts/publish-gate.mjs               check the snippets, write generated/live-pages.json
 *   node scripts/publish-gate.mjs --if-missing  the same, only when there's no live-pages.json yet
 *
 * A page is live for a framework when its snippets compile for it (`snippets.mjs`) and it names
 * nothing pending in `../reference.mjs`. A pending name holds back the pages whose Methods, State
 * or Events table lists it, read the way the reference check reads them: `print()` holds back
 * Saving, not Opening, though both document the documents capability. A pending name no table
 * lists is one the docs dropped (`save`, now `download()`), so it holds nothing back.
 *
 * The sites read `generated/live-pages.json` through `@embedpdf/docs-kit/publish`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REFERENCE } from '../reference.mjs';
import { checkSnippets, writeJson } from './snippets.mjs';

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const livePagesFile = path.join(contentRoot, 'generated/live-pages.json');

const FRAMEWORK_LABELS = { react: 'React', vue: 'Vue', svelte: 'Svelte', angular: 'Angular' };

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

// ── the status ──────────────────────────────────────────────────────────────

/** Check the snippets, then write which page is live for which framework. */
export async function writePublishStatus() {
  const snippets = await checkSnippets();
  const pending = pendingByPage();

  const pages = {};
  for (const [page, frameworks] of Object.entries(snippets.pages)) {
    const names = [...(pending.get(page) ?? [])].sort();
    const live = {};
    for (const [framework, { compiles }] of Object.entries(frameworks)) {
      live[framework] = compiles && names.length === 0;
    }
    pages[page] = { pending: names, live };
  }
  writeJson(livePagesFile, { pages });

  const all = Object.values(pages);
  const waiting = all.filter((page) => page.pending.length > 0).length;
  console.log(`Live pages (${waiting} of ${all.length} name something pending):`);
  for (const [framework, label] of Object.entries(FRAMEWORK_LABELS)) {
    const live = all.filter((page) => page.live[framework]).length;
    console.log(`  ${label.padEnd(8)} ${String(live).padStart(2)} of ${all.length}`);
  }
  console.log(`Wrote ${path.relative(process.cwd(), livePagesFile) || livePagesFile}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--if-missing') && fs.existsSync(livePagesFile)) {
    console.log(
      `${path.relative(process.cwd(), livePagesFile)} exists; not checking the snippets again.`,
    );
  } else {
    await writePublishStatus();
  }
}
