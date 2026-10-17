// Times redaction on scanned documents: a 300 dpi scan page repeated into a
// document, marks over its text, apply, content regeneration and a full save.
//
//   node test/redaction-perf/redaction-perf.mjs [--runtime wasm|native]
//        [--mode page|each|both] [--kinds bw-ccitt,gray-jpeg,color-jpeg,gray-jpx,color-jpx]
//        [--pages 30] [--marks 100] [--out report.json] [--save-dir dir]
//
// mode page = "Apply all"; each = one apply per mark. Times depend on the
// machine and its load; output size and WASM memory don't (the CI budgets in
// redaction-perf.test.mjs check those). With the native runtime, memory is the
// process's peak resident size, not one run's.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { KINDS, MODES, measureRedaction } from './measure.mjs';

const args = parseArgs(process.argv.slice(2));
const runtime = args.runtime ?? 'wasm';
const modes = !args.mode || args.mode === 'both' ? MODES : [args.mode];
const kinds = args.kinds ? args.kinds.split(',') : KINDS;
const pages = Number(args.pages ?? 30);
const marks = Number(args.marks ?? 100);

const reports = [];
console.log(
  `${runtime}, ${pages} pages, ${marks} marks\n` +
    '  scan         mode   apply ms  generate ms   save ms   in MiB  out MiB  ratio  memory MiB',
);
for (const mode of modes) {
  for (const kind of kinds) {
    const report = await measureRedaction({ runtime, kind, mode, pages, marks });
    if (args['save-dir']) {
      mkdirSync(args['save-dir'], { recursive: true });
      writeFileSync(path.join(args['save-dir'], `${kind}.${mode}.${runtime}.pdf`), report.saved);
    }
    delete report.saved;
    reports.push(report);
    const mib = (bytes) => (bytes / 1048576).toFixed(1).padStart(8);
    console.log(
      `  ${kind.padEnd(12)} ${mode.padEnd(5)} ${String(report.applyMs).padStart(9)} ` +
        `${String(report.generateMs).padStart(12)} ${String(report.saveMs).padStart(9)} ` +
        `${mib(report.inputBytes)} ${mib(report.outputBytes)} ${report.outputRatio.toFixed(2).padStart(6)} ` +
        `${String(report.peakMiB).padStart(11)}`,
    );
  }
}
if (args.out) {
  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify({ runtime, pages, marks, reports }, null, 1)}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument ${argv[i]}`);
    parsed[argv[i].slice(2)] = argv[++i];
  }
  return parsed;
}
