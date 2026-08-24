#!/usr/bin/env node
/**
 * Copies a site's prerendered social cards out of `.next` so the design can
 * be looked at.
 *
 *   node ../../docs/kit/scripts/collect-og-cards.mjs [--out <dir>] [--filter <substring>]
 *
 * Run from a site directory, after `next build`. The OG route is
 * `force-static`, so the build has already rendered every card — this only
 * gives them names you can open. Iterating on a Satori layout without seeing
 * the output is guesswork; this is the shortest path to seeing it.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const source = path.resolve('.next/server/app/api/og');
const out = path.resolve(option('out', 'og-preview'));
const filter = option('filter', '');

if (!fs.existsSync(source)) {
  console.error(
    `No prerendered cards at ${path.relative(process.cwd(), source)} — run \`next build\` first.`,
  );
  process.exit(1);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });

fs.mkdirSync(out, { recursive: true });
let written = 0;

for (const file of walk(source)) {
  if (!file.endsWith('.body')) continue;
  const route = path.relative(source, file).replace(/\.body$/, '');
  if (filter && !route.includes(filter)) continue;
  fs.copyFileSync(file, path.join(out, `${route.replace(/\//g, '_')}.png`));
  written += 1;
}

console.log(`${written} card${written === 1 ? '' : 's'} → ${path.relative(process.cwd(), out)}/`);
