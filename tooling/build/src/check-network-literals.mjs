#!/usr/bin/env node
/**
 * No request leaves the app's origin unless the app configured it. This
 * check enforces the code half of that promise: no `http(s)://` string
 * literal in SHIPPED source (packages, the cloud viewer/engine) other than
 * an allowlisted host — documentation links, XML namespaces, the CloudPDF
 * product's own endpoints. Comments are ignored (usage examples may show a
 * CDN URL); string and template literals are what ship.
 *
 * The runtime half is tooling/bundler-matrix, which fails on any request
 * that leaves the origin.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Directories whose non-test source ships to users. */
const ROOTS = [
  'packages/core',
  'packages/engine/core/src',
  'packages/engine/main/src',
  'packages/engine/services/src',
  'packages/plugin',
  'packages/framework',
  'packages/viewer',
  'packages/default-stamps',
  'cloudpdf/engine/src',
  'cloudpdf/viewer',
];

/** Hosts a shipped literal may name. Everything else is a finding. */
const ALLOWED_HOSTS = [
  /(^|\.)embedpdf\.com$/, // documentation links in error messages
  /(^|\.)cloudpdf\.com$/, // the CloudPDF product's own endpoints
  /^www\.w3\.org$/, // XML namespaces (SVG, XHTML)
  /^ns\.adobe\.com$/, // XMP namespaces
  /^purl\.org$/, // Dublin Core in XMP
  /(^|\.)example(\.test|\.com|\.org)?$/, // placeholders in docs strings
];

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /(?:^|\/)(?:test|tests|__tests__|fixtures)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const URL_IN_TEXT = /https?:\/\/([a-z0-9.-]+)/gi;

function* sourceFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'out', '.next', 'workers', 'lib', 'locales'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (SOURCE.test(entry.name) && !TEST.test(full.split(path.sep).join('/'))) yield full;
  }
}

function findings(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/https?:\/\//.test(text)) return [];
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      for (const match of node.text.matchAll(URL_IN_TEXT)) {
        const host = match[1].toLowerCase();
        if (ALLOWED_HOSTS.some((rule) => rule.test(host))) continue;
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        out.push(`${path.relative(root, file)}:${line + 1}: ${match[0]}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const problems = [];
let scanned = 0;
for (const dir of ROOTS) {
  for (const file of sourceFiles(path.join(root, dir))) {
    scanned += 1;
    problems.push(...findings(file));
  }
}
if (problems.length) {
  console.error('Off-origin URL literals in shipped source (see docs/viewer/self-hosting):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-network-literals: ${scanned} files, no off-origin URL literals.`);
