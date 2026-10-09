#!/usr/bin/env node
/**
 * Codemod: rewrite ALL-CAPS emphasis in comments as ordinary words, the
 * mechanical half of docs/conventions/comments.md rule 8. Acronyms (the
 * checker's allowlist), code in backticks, identifiers with digits or
 * underscores, and PDF names (`/AcroForm`) are left alone; a word that starts
 * a sentence keeps a capital first letter.
 *
 *   node scripts/lower-caps-emphasis.mjs packages/plugin/form
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const checker = fs.readFileSync(path.join(root, 'scripts/check-comments.mjs'), 'utf8');
const acronymBlock = checker.slice(checker.indexOf('const ACRONYMS'), checker.indexOf('const RULES'));
const ACRONYMS = new Set(
  [...acronymBlock.matchAll(/'([^']*)'/g)].flatMap((match) => match[1].split(/\s+/)).filter(Boolean),
);

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.turbo'].includes(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
};
for (const target of process.argv.slice(2)) {
  const full = path.resolve(root, target);
  if (fs.statSync(full).isDirectory()) walk(full);
  else files.push(full);
}

const rewriteLine = (line) => {
  // Split out code spans so they are never touched.
  return line
    .split(/(`[^`]*`)/)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/(^|[^/\w])([A-Z][A-Z]+(?:-[A-Z]+)*)(?![\w/])/g, (match, before, word, offset, whole) => {
        const pieces = word.split('-');
        if (pieces.every((piece) => ACRONYMS.has(piece))) return match;
        if (/\d|_/.test(word)) return match;
        const lower = pieces
          .map((piece) => (ACRONYMS.has(piece) ? piece : piece.toLowerCase()))
          .join('-');
        const preceding = whole.slice(0, offset + before.length);
        const startsSentence = /(^\s*(\/\/+|\/\*+|\*)?\s*$)|([.!?:]\s+$)/.test(preceding);
        return before + (startsSentence ? lower[0].toUpperCase() + lower.slice(1) : lower);
      });
    })
    .join('');
};

let changedFiles = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const ranges = new Map();
  const collect = (position) => {
    for (const range of ts.getLeadingCommentRanges(text, position) ?? []) ranges.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(text, position) ?? []) ranges.set(range.pos, range);
  };
  const visit = (node) => {
    collect(node.getFullStart());
    collect(node.getEnd());
    ts.forEachChild(node, visit);
  };
  visit(source);
  const sorted = [...ranges.values()].sort((left, right) => right.pos - left.pos);
  let next = text;
  for (const range of sorted) {
    const comment = next.slice(range.pos, range.end);
    const rewritten = comment.split('\n').map(rewriteLine).join('\n');
    if (rewritten !== comment) next = next.slice(0, range.pos) + rewritten + next.slice(range.end);
  }
  if (next !== text) {
    fs.writeFileSync(file, next);
    changedFiles++;
  }
}
console.log(`lower-caps-emphasis: rewrote comments in ${changedFiles} file(s)`);
