#!/usr/bin/env node
/**
 * Mount the shared docs corpus into a site (DOCS-PLATFORM-ARCHITECTURE.md).
 *
 *   node scripts/sync.mjs --target <site dir> --engine local|cloud [--frameworks react,...] [--check]
 *
 * MDX pages copy verbatim (the site's remark pipeline resolves `<Engine>`
 * blocks at compile time) — except rung 3 of the fork ladder: a sibling
 * `page.<flavor>.mdx` wins over `page.mdx` for that flavor. Every emitted
 * page carries a generated marker; `_meta.ts` files get a comment header.
 *
 * Samples emit per flavor: the engine import/factory lines swap from
 * `engines.mjs`, and each `// [!doc-source <key>]` block swaps to the
 * flavor's form from `documents.mjs`. Sample files carry NO marker (they are
 * displayed verbatim in docs code panels); the drift check is their guard.
 *
 * The generator OWNS the target directories: anything there it did not emit
 * is deleted (or fails `--check`). Site-local pages don't belong in them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_DOCUMENTS } from '../documents.mjs';
import { ENGINES } from '../engines.mjs';

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MDX_MARKER = '{/* Generated from docs/content — edit there, then `pnpm docs:sync`. */}';
const META_MARKER = '// Generated from docs/content — edit there, then `pnpm docs:sync`.';
const FLAVORS = Object.keys(ENGINES);
const ALL_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'];

/** corpus section → site subpath (relative to the site dir). */
const MOUNTS = {
  mdx: [{ from: 'headless', to: 'src/content/docs/headless' }],
  samples: [
    { from: 'samples/stage', to: 'src/samples/stage' },
    { from: 'samples/getting-started', to: 'src/samples/getting-started' },
  ],
};

function parseArgs(argv) {
  const args = { check: false, frameworks: ALL_FRAMEWORKS };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target') args.target = path.resolve(argv[++i]);
    else if (argv[i] === '--engine') args.engine = argv[++i];
    else if (argv[i] === '--frameworks') args.frameworks = argv[++i].split(',');
    else if (argv[i] === '--check') args.check = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.target) throw new Error('Missing --target <site dir>');
  if (!FLAVORS.includes(args.engine)) {
    throw new Error(`--engine must be one of: ${FLAVORS.join(', ')}`);
  }
  return args;
}

function walk(directory) {
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const frameworkOf = (relative) => {
  const match = relative.match(/\.(react|vue|svelte|angular)(\.|\/|$)/);
  return match?.[1] ?? null;
};

/** rung 3: `page.<flavor>.mdx` beats `page.mdx` for that flavor. */
function resolveMdxOverride(files, relative, engine) {
  const base = relative.replace(/\.mdx$/, '');
  const flavorMatch = base.match(/\.(\w+)$/);
  if (flavorMatch && FLAVORS.includes(flavorMatch[1])) {
    // A flavored page: emit (under its base name) only for its own flavor.
    return flavorMatch[1] === engine ? `${base.slice(0, -flavorMatch[1].length - 1)}.mdx` : null;
  }
  // A shared page: emit unless this flavor has an override sibling.
  return files.includes(`${base}.${engine}.mdx`) ? null : relative;
}

function transformSample(source, engine, relative) {
  const flavor = ENGINES[engine];
  let output = source;

  if (engine !== 'local') {
    if (!source.includes(ENGINES.local.importLine) || !source.includes(ENGINES.local.factoryLine)) {
      throw new Error(
        `${relative}: expected the canonical local engine import/factory lines ` +
          `(see engines.mjs) — mark or update the sample`,
      );
    }
    output = output.replace(ENGINES.local.importLine, flavor.importLine);
    output = output.replace(ENGINES.local.factoryLine, flavor.factoryLine);
  }

  // Swap (or, for local, unwrap) every marked document-source block.
  const marker = /\/\/ \[!doc-source (\w+)\]\n([\s\S]*?)\/\/ \[!\/doc-source\]\n/g;
  output = output.replace(marker, (whole, key, body) => {
    const entry = DEMO_DOCUMENTS[key];
    if (!entry) throw new Error(`${relative}: unknown doc-source key '${key}' (documents.mjs)`);
    if (engine === 'local') return body;
    const name = body.match(/const (\w+)/)?.[1];
    if (!name) throw new Error(`${relative}: doc-source block does not declare a const`);
    return `${entry.cloudSource(name)}\n`;
  });

  return output;
}

function buildExpected(engine, frameworks) {
  const expected = new Map();

  for (const mount of MOUNTS.mdx) {
    const root = path.join(contentRoot, mount.from);
    const files = walk(root).map((file) => path.relative(root, file));
    for (const relative of files) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      if (relative.endsWith('.mdx')) {
        const emitAs = resolveMdxOverride(files, relative, engine);
        if (!emitAs) continue;
        const marked = source.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n${MDX_MARKER}\n`);
        expected.set(path.join(mount.to, emitAs), marked);
      } else if (relative.endsWith('_meta.ts')) {
        expected.set(path.join(mount.to, relative), `${META_MARKER}\n${source}`);
      } else {
        expected.set(path.join(mount.to, relative), source);
      }
    }
  }

  for (const mount of MOUNTS.samples) {
    const root = path.join(contentRoot, mount.from);
    for (const absolute of walk(root)) {
      const relative = path.relative(root, absolute);
      const framework = frameworkOf(relative);
      if (framework && !frameworks.includes(framework)) continue;
      const source = fs.readFileSync(absolute, 'utf8');
      const emitted = framework
        ? transformSample(source, engine, relative)
        : source; // _shared chrome, css — engine-neutral lesson scaffolding
      expected.set(path.join(mount.to, relative), emitted);
    }
  }

  // The ?inline/css ambient declarations every synced samples tree needs.
  expected.set(
    'src/samples/samples-env.d.ts',
    fs.readFileSync(path.join(contentRoot, 'samples/samples-env.d.ts'), 'utf8'),
  );

  return expected;
}

function ownedRoots() {
  return [...MOUNTS.mdx, ...MOUNTS.samples].map((mount) => mount.to);
}

function main() {
  const args = parseArgs(process.argv);
  const expected = buildExpected(args.engine, args.frameworks);

  const stale = [];
  const onDisk = new Set(
    ownedRoots().flatMap((root) =>
      walk(path.join(args.target, root)).map((file) => path.relative(args.target, file)),
    ),
  );

  for (const [relative, contents] of expected) {
    const absolute = path.join(args.target, relative);
    let current = null;
    try {
      current = fs.readFileSync(absolute, 'utf8');
    } catch {
      /* missing */
    }
    if (current !== contents) stale.push(relative);
    onDisk.delete(relative);
  }
  const orphans = [...onDisk].filter((relative) =>
    ownedRoots().some((root) => relative.startsWith(root)),
  );

  if (args.check) {
    if (stale.length || orphans.length) {
      console.error('Synced docs content is stale:');
      for (const file of [...stale, ...orphans.map((o) => `${o} (orphan)`)]) {
        console.error(`- ${file}`);
      }
      console.error('Run: pnpm docs:sync');
      process.exit(1);
    }
    console.log(`Docs content is current (${expected.size} files, engine=${args.engine}).`);
    return;
  }

  for (const orphan of orphans) fs.unlinkSync(path.join(args.target, orphan));
  for (const [relative, contents] of expected) {
    const absolute = path.join(args.target, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  console.log(
    `Synced ${expected.size} files into ${path.relative(process.cwd(), args.target) || '.'} (engine=${args.engine}${
      args.frameworks.length < ALL_FRAMEWORKS.length ? `, frameworks=${args.frameworks.join(',')}` : ''
    }).`,
  );
}

main();
