#!/usr/bin/env node
/**
 * Framework parity by spec: the React package's `exports`
 * map IS the vertical manifest — no second hand-written list. This script
 * fails when React grows a vertical this package neither ships (an
 * ng-package.json entry point) nor explicitly defers (the PENDING set), and
 * when PENDING goes stale in either direction.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Verticals React ships that the Angular adapter has NOT ported yet. Shrink
// this set as entries land; never grow it silently — a new React vertical
// should either be ported or added here in the same change, consciously.
const PENDING = new Set([
  'scrollbar',
  'page-view',
  'interaction',
  'selection',
  'annotation',
  'annotation-menu',
  'search',
  'stamp',
  'views',
  'page-edit',
  'metadata',
  'i18n',
  'commands',
  'shell',
  'form',
  'toolbar',
  'link',
  'redaction',
]);

const reactPkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../react/package.json', import.meta.url)), 'utf8'),
);
const verticals = Object.keys(reactPkg.exports)
  // '.' is the barrel; './package.json' is tsdown's generated manifest export.
  .filter((k) => k !== '.' && k !== './package.json')
  .map((k) => k.replace(/^\.\//, ''));

const missing = verticals.filter(
  (v) =>
    !PENDING.has(v) &&
    !existsSync(fileURLToPath(new URL(`../${v}/ng-package.json`, import.meta.url))),
);
const shipped = [...PENDING].filter((v) =>
  existsSync(fileURLToPath(new URL(`../${v}/ng-package.json`, import.meta.url))),
);
const unknown = [...PENDING].filter((v) => !verticals.includes(v));

let failed = false;
if (missing.length) {
  failed = true;
  console.error(
    `[parity] React ships verticals this package neither ports nor defers: ${missing.join(', ')}\n` +
      '         Port each as a secondary entry point, or add it to PENDING in scripts/check-parity.mjs.',
  );
}
if (shipped.length) {
  failed = true;
  console.error(`[parity] PENDING is stale — these entry points exist now: ${shipped.join(', ')}`);
}
if (unknown.length) {
  failed = true;
  console.error(`[parity] PENDING lists verticals React does not export: ${unknown.join(', ')}`);
}
if (failed) process.exit(1);
console.log(
  `[parity] ok — ${verticals.length - PENDING.size}/${verticals.length} verticals ported, ${PENDING.size} pending`,
);
