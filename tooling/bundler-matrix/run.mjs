#!/usr/bin/env node
/**
 * The bundler matrix runner. For each app under apps/: production build,
 * serve the output statically, open it headless, wait for the probe, record
 * what happened — result, timings, which origins were contacted, what was
 * emitted (JS / wasm bytes). Prints a markdown table and writes results.json.
 *
 *   node run.mjs                 # every app
 *   node run.mjs --only vite,angular
 *   node run.mjs --script matrix:build:assets --only angular   # a variant
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const script = args.includes('--script') ? args[args.indexOf('--script') + 1] : 'matrix:build';
// `--only` matches app directory names and variant names.

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

async function launch() {
  const opts = { args: ['--disable-features=LocalNetworkAccessChecks'] };
  try {
    return await chromium.launch(opts);
  } catch {
    return chromium.launch({ ...opts, channel: 'chrome' });
  }
}

function emitted(dir) {
  const files = walk(dir);
  const sum = (pred) => files.filter(pred).reduce((n, f) => n + statSync(f).size, 0);
  return {
    js: sum((f) => /\.m?js$/.test(f)),
    wasm: sum((f) => f.endsWith('.wasm')),
    total: sum(() => true),
    files: files.length,
  };
}

const kb = (n) => `${Math.round(n / 1024)} kB`;
const results = [];
const browser = await launch();
try {
  const apps = readdirSync(join(here, 'apps')).filter((n) =>
    existsSync(join(here, 'apps', n, 'matrix.json')),
  );
  const runs = [];
  for (const name of apps) {
    if (
      only &&
      !only.includes(name) &&
      !(
        JSON.parse(readFileSync(join(here, 'apps', name, 'matrix.json'), 'utf8')).variants ?? []
      ).some((v) => only.includes(v.name))
    )
      continue;
    const dir = join(here, 'apps', name);
    const meta = JSON.parse(readFileSync(join(dir, 'matrix.json'), 'utf8'));
    runs.push({ name, dir, meta, toolchain: meta.toolchain, script });
    // Variants: documented opt-ins measured beside the zero-config row.
    for (const v of meta.variants ?? [])
      runs.push({ name: v.name, dir, meta, toolchain: v.toolchain, script: v.script });
  }
  for (const { name, dir, meta, toolchain, script } of runs) {
    const row = { app: name, toolchain, script };
    process.stdout.write(`\n▶ ${name} (${toolchain}) — ${script}\n`);
    // Sizes are measured on the output directory: start it empty.
    rmSync(resolve(dir, meta.dist), { recursive: true, force: true });
    const t0 = Date.now();
    const build = spawnSync('pnpm', ['run', script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CI: '1', NODE_ENV: 'production' },
    });
    row.buildMs = Date.now() - t0;
    if (build.status !== 0) {
      row.build = 'failed';
      row.log = (build.stdout + build.stderr).split('\n').filter(Boolean).slice(-15).join('\n');
      console.log(`  build FAILED\n${row.log}`);
      results.push(row);
      continue;
    }
    row.build = 'ok';
    const dist = resolve(dir, meta.dist);
    row.emitted = emitted(dist);
    const { server, origin } = await serve(dist);
    const page = await browser.newPage();
    const responses = [];
    const failures = [];
    const consoleErrors = [];
    const warnings = [];
    page.on('response', (r) =>
      responses.push({
        url: r.url(),
        status: r.status(),
        bytes: Number(r.headers()['content-length'] ?? 0),
      }),
    );
    page.on('requestfailed', (r) => failures.push(`${r.url()} → ${r.failure()?.errorText}`));
    page.on('console', (m) =>
      (m.type() === 'error' ? consoleErrors : m.type() === 'warning' ? warnings : []).push(
        m.text(),
      ),
    );
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    try {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#probe[data-done]', { timeout: 90_000 });
      row.probe = await page.evaluate(() => window.__probe);
    } catch (error) {
      row.probe = { ok: false, errors: [String(error)] };
    }
    // blob: (the inline worker) and data: URLs are the page's own.
    const network = responses.filter((r) => /^https?:/.test(r.url));
    row.foreign = [
      ...new Set(
        network.filter((r) => !r.url.startsWith(origin)).map((r) => new URL(r.url).origin),
      ),
    ];
    row.wasmFetched = network
      .filter((r) => r.url.endsWith('.wasm'))
      .map((r) => `${r.url.replace(origin, '')} (${r.status})`);
    // The portable entry carries the wasm as a JS chunk: the one JS response
    // in the megabytes that no emitted asset accounts for.
    const inlineChunk = network.find(
      (r) => /\.m?js$/.test(r.url.split('?')[0]) && r.bytes > 3_000_000,
    );
    const assetOk = network.some((r) => r.url.endsWith('.wasm') && r.status === 200);
    row.delivery = assetOk
      ? 'emitted asset'
      : inlineChunk
        ? `inline chunk (${kb(inlineChunk.bytes)} JS)`
        : 'none';
    row.failures = failures;
    row.consoleErrors = consoleErrors;
    row.warnings = warnings.filter((w) => /embedpdf|wasm/i.test(w));
    await page.close();
    server.close();
    console.log(
      `  build ${Math.round(row.buildMs / 1000)}s · probe ${row.probe.ok ? 'OK' : 'FAILED'} in ${row.probe.ms ?? '?'} ms · wasm ${row.wasmFetched.join(', ') || 'none'} · foreign ${row.foreign.join(', ') || 'none'} · emitted js ${kb(row.emitted.js)} wasm ${kb(row.emitted.wasm)}`,
    );
    if (!row.probe.ok)
      console.log(
        '  ' +
          [...(row.probe.errors ?? []), ...failures, ...consoleErrors].join('\n  ').slice(0, 1500),
      );
    results.push(row);
  }
} finally {
  await browser.close();
}

writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(
  '\n| Toolchain | Build | Probe | wasm delivery | wasm fetched from | Off-origin | Emitted JS | Emitted wasm |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  const probe = r.build !== 'ok' ? '—' : r.probe.ok ? `✅ ${r.probe.ms} ms` : '❌';
  console.log(
    `| ${r.toolchain} | ${r.build === 'ok' ? `✅ ${Math.round(r.buildMs / 1000)}s` : '❌'} | ${probe} | ${r.delivery ?? '—'} | ${(r.wasmFetched ?? []).join('<br>') || '—'} | ${(r.foreign ?? []).join('<br>') || 'none'} | ${r.emitted ? kb(r.emitted.js) : '—'} | ${r.emitted ? kb(r.emitted.wasm) : '—'} |`,
  );
}
