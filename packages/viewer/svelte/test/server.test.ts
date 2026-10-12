/**
 * `@embedpdf/viewer-svelte` on a server: importing its build touches no browser global, `render`
 * from `svelte/server` gives the empty `<embedpdf-viewer>` with its class and style, and the
 * `/core` door's files never import the local engine's door. `server/render-published.mjs`
 * checks it in plain Node; this runs it.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = join(dirname(fileURLToPath(import.meta.url)), 'server', 'render-published.mjs');

interface Report {
  checks: Record<string, { ok: boolean; detail?: unknown }>;
  errors: string[];
}

describe('@embedpdf/viewer-svelte on a server', () => {
  it('imports without browser globals, renders the empty element and keeps the doors apart', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    const report = JSON.parse(run.stdout) as Report;
    expect(report.errors).toEqual([]);
    const failed = Object.entries(report.checks).filter(([, check]) => !check.ok);
    expect(failed).toEqual([]);
    expect(Object.keys(report.checks)).toHaveLength(4);
  });
});
