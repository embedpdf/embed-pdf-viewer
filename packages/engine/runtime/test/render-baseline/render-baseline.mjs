// Records or checks byte-exact render digests for this package's runtime.
//
//   node test/render-baseline/render-baseline.mjs record --runtime wasm --profile fast
//   node test/render-baseline/render-baseline.mjs check --runtime wasm --profile fast
//
// Options: --baseline <file> (default .render-baseline/<runtime>-<platform>-<profile>.json),
// --out <file> (check mode: also write this run), --jobs <n>, --timeout <seconds>,
// --wasm-binary <file> (render with another embedpdf.wasm), --only <substring>,
// --image-budget <MB> (decoded images kept across page loads, as the engine keeps
// them; default 128, 0 for none), --slice-ms <ms> (render engine variants in slices
// of this budget, as the engine does; 0 slices at every chance). See README.md next
// to this file. --high-heap (wasm): take the low 2 GiB of the heap first, so every
// render runs at addresses above 2 GiB.

import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { collectDocuments } from './corpus.mjs';
import { profileByName } from './variants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(here, '../..');

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];
if (mode !== 'record' && mode !== 'check') {
  console.error(
    'usage: render-baseline.mjs record|check --runtime native|wasm [--profile fast|release]',
  );
  process.exit(2);
}
const runtimeKind = args.runtime ?? 'wasm';
const profileName = args.profile ?? 'fast';
profileByName(profileName);
const jobs = Number(args.jobs ?? Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2))));
const timeoutMs = Number(args.timeout ?? 300) * 1000;
const wasmBinary = args['wasm-binary'] ? path.resolve(args['wasm-binary']) : undefined;
const imageBudgetMb = Number(args['image-budget'] ?? 128);
const sliceMs = args['slice-ms'] === undefined ? undefined : Number(args['slice-ms']);
const highHeap = args['high-heap'] !== undefined;

const documents = collectDocuments(profileName)
  .filter((document) => !args.only || document.id.includes(args.only))
  .map((document) => ({ ...document, size: statSync(document.file).size }))
  // Largest first, so the slowest documents do not start last.
  .sort((a, b) => b.size - a.size);

const started = performance.now();
const { cases, platform } = await runAll(documents);
const current = {
  meta: {
    runtime: runtimeKind,
    platform,
    profile: profileName,
    library: libraryIdentity(platform),
    node: process.version,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    documents: documents.length,
    ...(sliceMs === undefined ? {} : { sliceMs }),
    ...(highHeap ? { highHeap } : {}),
    seconds: Math.round((performance.now() - started) / 1000),
  },
  cases: sortKeys(cases),
};

const defaultFile = path.join(
  runtimeRoot,
  '.render-baseline',
  `${runtimeKind}-${platform}-${profileName}.json`,
);
if (sliceMs !== undefined) reportSlices(current.cases);
if (mode === 'record') {
  const out = path.resolve(args.out ?? args.baseline ?? defaultFile);
  write(out, current);
  const errors = Object.values(current.cases).filter((entry) => entry.error).length;
  console.log(
    `recorded ${Object.keys(current.cases).length} cases (${errors} errors) from ` +
      `${documents.length} documents in ${current.meta.seconds}s -> ${out}`,
  );
} else {
  const baselineFile = path.resolve(args.baseline ?? defaultFile);
  if (args.out) write(path.resolve(args.out), current);
  process.exit(compare(JSON.parse(readFileSync(baselineFile, 'utf8')), current) ? 0 : 1);
}

// ── rendering ──

function runAll(queue) {
  const pending = [...queue];
  const cases = {};
  let platform = 'unknown';
  let done = 0;
  return new Promise((resolve) => {
    let live = 0;
    const startWorker = () => {
      if (pending.length === 0) {
        if (live === 0) resolve({ cases, platform });
        return;
      }
      live++;
      const child = fork(
        path.join(here, 'worker.mjs'),
        [JSON.stringify({ runtimeKind, wasmBinary, imageBudgetMb, sliceMs, highHeap })],
        {
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        },
      );
      let current = null;
      let timer = null;
      const next = () => {
        current = pending.shift() ?? null;
        if (!current) {
          child.kill();
          return;
        }
        const docStarted = performance.now();
        current.started = docStarted;
        timer = setTimeout(() => {
          record(current, { [`${current.id}#doc`]: { error: 'timeout' } });
          current = null;
          child.kill('SIGKILL');
        }, timeoutMs);
        child.send({ type: 'document', document: current, profile: profileName });
      };
      const record = (document, result) => {
        clearTimeout(timer);
        Object.assign(cases, result);
        done++;
        const seconds = ((performance.now() - document.started) / 1000).toFixed(1);
        const failed = Object.values(result).some((entry) => entry.error);
        if (failed || Number(seconds) >= 5 || done % 25 === 0 || done === queue.length) {
          console.log(
            `[${done}/${queue.length}] ${document.id} ${seconds}s${failed ? ' (errors)' : ''}`,
          );
        }
      };
      child.on('message', (message) => {
        if (message.type === 'ready') {
          platform = message.platform;
          next();
        } else if (message.type === 'result' && current && message.id === current.id) {
          record(current, message.cases);
          current = null;
          // A worker whose runtime failed exits after answering; its replacement
          // takes the next document.
          if (!message.fatal) next();
        }
      });
      child.on('exit', (code, signal) => {
        live--;
        if (current) {
          record(current, { [`${current.id}#doc`]: { error: `crashed:${signal ?? code}` } });
          current = null;
        }
        startWorker();
      });
    };
    for (let i = 0; i < Math.min(jobs, queue.length); i++) startWorker();
    if (queue.length === 0) resolve({ cases, platform });
  });
}

// ── comparison ──

function compare(baseline, current) {
  const changed = [];
  const missing = [];
  const added = [];
  for (const [id, entry] of Object.entries(baseline.cases)) {
    const now = current.cases[id];
    if (!now) missing.push(id);
    else if (fingerprint(entry) !== fingerprint(now))
      changed.push({ id, before: entry, after: now });
  }
  for (const id of Object.keys(current.cases)) {
    if (!(id in baseline.cases)) added.push(id);
  }
  const total = Object.keys(baseline.cases).length;
  console.log(`baseline: ${describe(baseline.meta)}`);
  console.log(`current:  ${describe(current.meta)}`);
  for (const { id, before, after } of changed.slice(0, 40)) {
    console.log(
      `  changed ${id}\n    before ${fingerprint(before)}\n    after  ${fingerprint(after)}`,
    );
  }
  for (const id of missing.slice(0, 20)) console.log(`  missing ${id}`);
  for (const id of added.slice(0, 20)) console.log(`  new     ${id}`);
  console.log(
    `${total - changed.length - missing.length}/${total} identical, ${changed.length} changed, ` +
      `${missing.length} missing, ${added.length} new`,
  );
  return changed.length === 0 && missing.length === 0 && (!args.strict || added.length === 0);
}

// What must stay identical: the digest and size of a render, the page count of a
// document, or the exact failure. Timings are ignored.
function fingerprint(entry) {
  if (entry.error) return `error ${entry.error}`;
  if ('pages' in entry) return `pages ${entry.pages}`;
  return `${entry.width}x${entry.height} ${entry.sha}`;
}

function describe(meta) {
  const library = meta.library
    ? `${path.basename(meta.library.file)} ${meta.library.sha256.slice(0, 12)}`
    : '?';
  return `${meta.runtime} ${meta.platform} ${meta.profile}, ${library}, ${meta.documents} documents`;
}

// ── slices ──

// How closely sliced renders kept to the budget: the cases whose longest slice ran
// longest, and how many ran past twice the budget.
function reportSlices(cases) {
  const sliced = Object.entries(cases).filter(([, entry]) => entry.slices !== undefined);
  if (sliced.length === 0) return;
  const longest = sliced.map(([, entry]) => entry.longestSliceMs).sort((a, b) => a - b);
  const at = (q) => longest[Math.min(longest.length - 1, Math.floor(q * longest.length))];
  const over = longest.filter((ms) => ms > Math.max(2 * sliceMs, 1)).length;
  console.log(
    `sliced ${sliced.length} renders at ${sliceMs} ms: longest slice p50 ${at(0.5)} ms, ` +
      `p90 ${at(0.9)} ms, p99 ${at(0.99)} ms, max ${longest[longest.length - 1]} ms; ` +
      `${over} over twice the budget`,
  );
  for (const [id, entry] of sliced
    .sort(([, a], [, b]) => b.longestSliceMs - a.longestSliceMs)
    .slice(0, 12)) {
    console.log(`  ${entry.longestSliceMs} ms of ${entry.ms} ms, ${entry.slices} slices  ${id}`);
  }
}

// ── helpers ──

function libraryIdentity(platform) {
  const file =
    runtimeKind === 'wasm'
      ? (wasmBinary ?? path.join(runtimeRoot, 'npm/wasm32/lib/embedpdf.wasm'))
      : ['libembedpdf.dylib', 'libembedpdf.so', 'embedpdf.dll']
          .map((name) => path.join(runtimeRoot, 'npm', platform, 'lib', name))
          .find((candidate) => existsSync(candidate));
  if (!file || !existsSync(file)) return null;
  return { file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
}

function write(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
}

function sortKeys(object) {
  return Object.fromEntries(
    Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) parsed._.push(arg);
    else if (arg === '--strict' || arg === '--high-heap') parsed[arg.slice(2)] = true;
    else parsed[arg.slice(2)] = argv[++i];
  }
  return parsed;
}
