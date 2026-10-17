#!/usr/bin/env node
/**
 * The bundler matrix runner. For each app under apps/: production build,
 * serve the output statically under the strict Content-Security-Policy, open
 * it headless, wait for the probe, record what happened — result, timings,
 * which origins were contacted, every policy violation, what was emitted
 * (JS / wasm bytes). Prints a markdown table and writes results.json.
 *
 *   node run.mjs                 # every app
 *   node run.mjs --only vite,angular
 *   node run.mjs --script matrix:build:assets --only angular   # a variant
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

/**
 * The policy on docs/content/viewer/concepts/security.mdx, Trusted Types enforced, with what the
 * app itself needs beside it. From its `matrix.json`: `workerSrc`, `'self'` where the bundler
 * emits the engine's worker files and `'self' blob:` where the build starts them from blob: URLs
 * (the portable engine); `trustedTypes`, the bundler's own policies; `enforceTrustedTypes: false`
 * for a bundler whose runtime sets `script.src` without any policy. `scriptHashes` allow the
 * inline scripts the build wrote into its HTML.
 */
function strictPolicy({
  workerSrc,
  trustedTypes = [],
  enforceTrustedTypes = true,
  scriptHashes = [],
}) {
  return [
    "default-src 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...scriptHashes].join(' '),
    "style-src 'self'",
    `worker-src ${workerSrc}`,
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    ...(enforceTrustedTypes ? ["require-trusted-types-for 'script'"] : []),
    ['trusted-types embedpdf', ...trustedTypes].join(' '),
  ].join('; ');
}

/**
 * The `'sha256-…'` sources of the inline scripts in the build's `index.html` (an import map, a
 * framework's bootstrap), as a static host with a strict policy lists them. A script added
 * while the page runs matches none of them.
 */
function inlineScriptHashes(dist) {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return [];
  const html = readFileSync(index, 'utf8');
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/(?:^|\s)src\s*=/i.test(attributes))
    .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
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
    const csp = (entry) => ({
      workerSrc: entry.workerSrc,
      trustedTypes: entry.trustedTypes,
      enforceTrustedTypes: entry.enforceTrustedTypes,
    });
    runs.push({ name, dir, meta, toolchain: meta.toolchain, script, csp: csp(meta) });
    // Variants: documented opt-ins measured beside the zero-config row.
    for (const v of meta.variants ?? [])
      runs.push({ name: v.name, dir, meta, toolchain: v.toolchain, script: v.script, csp: csp(v) });
  }
  for (const run of runs)
    if (!run.csp.workerSrc)
      throw new Error(`${run.name}: its matrix.json entry must give a workerSrc`);
  for (const { name, dir, meta, toolchain, script, csp } of runs) {
    const row = { app: name, toolchain, script, ok: false };
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
    const scriptHashes = inlineScriptHashes(dist);
    const policy = strictPolicy({ ...csp, scriptHashes });
    row.csp = { ...csp, scriptHashes: scriptHashes.length, policy, violations: [] };
    const { server, origin } = await serve(dist, {
      headers: { 'content-security-policy': policy },
    });
    const page = await browser.newPage();
    // Heard from the first script on: the init script runs before any of the app's own.
    await page.exposeFunction('reportViolation', (report) => row.csp.violations.push(report));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) =>
        window.reportViolation(
          `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'} at ` +
            `${event.sourceFile}:${event.lineNumber} ${event.sample}`,
        ),
      );
    });
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
    page.on('console', (m) => {
      // The browser also logs each violation, including ones inside a worker.
      if (/Content Security Policy|Trusted ?Type|TrustedScript/i.test(m.text()))
        row.csp.violations.push(m.text());
      (m.type() === 'error' ? consoleErrors : m.type() === 'warning' ? warnings : []).push(
        m.text(),
      );
    });
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    try {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#probe[data-done]', { timeout: 90_000 });
      row.probe = await page.evaluate(() => window.__probe);
      // Late work (the encoder worker, lazy chunks) can still report.
      await page.waitForTimeout(1000);
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
    // An app passes when it boots, stays on its origin, and nothing violates the policy.
    row.ok = row.probe.ok && row.foreign.length === 0 && row.csp.violations.length === 0;
    console.log(
      `  build ${Math.round(row.buildMs / 1000)}s · probe ${row.probe.ok ? 'OK' : 'FAILED'} in ${row.probe.ms ?? '?'} ms · CSP ${row.csp.violations.length ? `${row.csp.violations.length} violations` : 'clean'} · wasm ${row.wasmFetched.join(', ') || 'none'} · foreign ${row.foreign.join(', ') || 'none'} · emitted js ${kb(row.emitted.js)} wasm ${kb(row.emitted.wasm)}`,
    );
    if (row.csp.violations.length)
      console.log('  ' + row.csp.violations.join('\n  ').slice(0, 1500));
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
  '\n| Toolchain | Result | Build | Probe | CSP (worker-src, additions) | wasm delivery | wasm fetched from | Off-origin | Emitted JS | Emitted wasm |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  const probe = r.build !== 'ok' ? '—' : r.probe.ok ? `✅ ${r.probe.ms} ms` : '❌';
  const additions = [
    ...(r.csp?.trustedTypes ?? []).map((name) => `+ ${name}`),
    ...(r.csp?.enforceTrustedTypes === false ? ['− require-trusted-types-for'] : []),
    ...(r.csp?.scriptHashes ? [`+ ${r.csp.scriptHashes} script hashes`] : []),
  ];
  const csp = !r.csp
    ? '—'
    : `${r.csp.violations.length ? `❌ ${r.csp.violations.length} violations` : '✅'} (${[r.csp.workerSrc, ...additions].join(', ')})`;
  console.log(
    `| ${r.toolchain} | ${r.ok ? '✅' : '❌'} | ${r.build === 'ok' ? `✅ ${Math.round(r.buildMs / 1000)}s` : '❌'} | ${probe} | ${csp} | ${r.delivery ?? '—'} | ${(r.wasmFetched ?? []).join('<br>') || '—'} | ${(r.foreign ?? []).join('<br>') || 'none'} | ${r.emitted ? kb(r.emitted.js) : '—'} | ${r.emitted ? kb(r.emitted.wasm) : '—'} |`,
  );
}

// What the docs promise of every row, whether or not its zero-config boot works: no request
// leaves the app's origin, and nothing violates the policy.
const broken = results.filter((r) => r.foreign?.length || r.csp?.violations.length);
if (broken.length) {
  console.error(
    `\n${broken.map((r) => r.app).join(', ')}: a request left the origin or the policy was violated`,
  );
  process.exitCode = 1;
}
