/**
 * `@embedpdf/viewer-angular` on a server: importing its build touches no browser global, and
 * Angular's server rendering (`renderApplication`) renders `<epdf-pdf-viewer>` as the empty
 * `<embedpdf-viewer>`, with the size it was given and none of the templates inside it.
 * `server/import-published.mjs` checks it in plain Node; this runs it.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = join(dirname(fileURLToPath(import.meta.url)), 'server', 'import-published.mjs');

interface Report {
  checks: Record<string, { ok: boolean; detail?: unknown }>;
  errors: string[];
}

describe('@embedpdf/viewer-angular on a server', () => {
  it('imports without browser globals and renders the empty element, from both doors', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    const report = JSON.parse(run.stdout) as Report;
    expect(report.errors).toEqual([]);
    const failed = Object.entries(report.checks).filter(([, check]) => !check.ok);
    expect(failed).toEqual([]);
    expect(Object.keys(report.checks)).toHaveLength(3);
  });
});
