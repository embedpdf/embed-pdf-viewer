// Redaction on scans stays within its budgets (budgets.json): the saved file's
// size against the input's, and the WASM memory the run needed. Both are the
// same on every run of a build, unlike times, so CI can check them.
//
//   node --test test/redaction-perf/redaction-perf.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { measureRedaction } from './measure.mjs';

const { pages, marks, budgets } = JSON.parse(
  readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'),
);

const runtime = await import('../../dist/index.node.js').catch(() => null);
const wasm = runtime && (await runtime.createPdfRuntime({ prefer: 'wasm' }).catch(() => null));
await wasm?.destroy();

for (const [name, budget] of Object.entries(budgets)) {
  const [kind, mode] = name.split('/');
  test(`${kind}, ${mode === 'page' ? 'apply all' : 'one apply per mark'}: ${pages} pages, ${marks} marks`, async (t) => {
    if (!wasm) {
      t.skip('dist or the wasm runtime is not built');
      return;
    }
    const report = await measureRedaction({ runtime: 'wasm', kind, mode, pages, marks });
    t.diagnostic(
      `out/in ${report.outputRatio}, peak ${report.peakMiB} MiB, ` +
        `apply ${report.applyMs} ms, save ${report.saveMs} ms`,
    );
    assert.equal(report.marks, marks);
    assert.ok(
      report.outputRatio <= budget.maxOutputRatio,
      `the saved file is ${report.outputRatio}x the input; the budget is ${budget.maxOutputRatio}x`,
    );
    assert.ok(
      report.peakMiB <= budget.maxPeakMiB,
      `the run needed ${report.peakMiB} MiB; the budget is ${budget.maxPeakMiB} MiB`,
    );
  });
}
