import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';

import { stagePlugin } from '../src/stage.plugin';
import { StageToken } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'main',
  'test',
  'fixtures',
  'action_triggers.pdf',
);

/**
 * The stage → actions FEED (this package's side of the trigger contract):
 * stage reports placement and page-set changes into the actions lifecycle
 * coordinator, which fans page open/close/visible out over the real /AA
 * trees. The dispatcher-only halves live in plugin-actions' own suite;
 * this one needs a real stage, so it lives with the feeder.
 */
async function boot() {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [actionsPlugin(), stagePlugin()],
  });
  const bytes = new Uint8Array(await readFile(fixturePath));
  await kernel.documents.open({ kind: 'bytes', id: 'stage-feed', bytes });
  const actions = kernel.capability(ActionsHostToken);

  const seam: string[] = [];
  actions.registerAnnotCommitSink(async (entries) => {
    for (const e of entries) {
      seam.push(`${e.patch.flags?.hidden ? 'hide' : 'show'}:${e.annotObjectNumber}`);
    }
    return {
      results: entries.map((entry) => ({
        annotObjectNumber: entry.annotObjectNumber,
        status: 'applied' as const,
      })),
    };
  });
  // Recorders: any navigation node firing would land in the seam and fail
  // the exact-equality assertions below.
  actions.registerExecutor('named', (node) => {
    seam.push(`named:${node.type === 'named' ? node.name : '?'}`);
    return { status: 'executed' };
  });
  actions.registerExecutor('goto', () => {
    seam.push('goto');
    return { status: 'executed' };
  });

  const pon = 3; // fixture: first page is object 3
  const drain = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', pageObjectNumber: pon, annotObjectNumber: 999 },
      pon,
    });

  return {
    kernel,
    actions,
    seam,
    drain,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

describe('the stage → actions trigger feed (real engine)', () => {
  it('wires stage state reports through the coordinator: placement opens the actual page', async () => {
    await using t = await boot();
    const stage = t.kernel.capability(StageToken);
    t.actions.setUiAdapter({ openUri: () => {}, print: () => {} });
    await t.drain();
    expect(t.seam).toEqual([]); // no stage report yet, no fallback in auto
    stage.setViewport({ width: 800, height: 600 }); // placement → report
    await t.drain();
    await t.drain();
    // Canonical coordinator order: the visible set (/PV shows 12) precedes
    // the open fan-out (page /O shows 7, then the /PO set shows 9).
    expect(t.seam).toEqual(['show:12', 'show:7', 'show:9']);
    t.seam.length = 0;
    stage.goToPage(1); // programmatic navigation to page 2 (no /AA there)
    await t.drain();
    await t.drain();
    // Leaving page 3: close fires (/PC set then /C — ISO order). The /PI
    // set is VIEWPORT truth, not cursor truth — at this zoom page 3 may
    // still peek into the viewport, so only assert it never fired a bogus
    // show and the close pair is ordered.
    expect(t.seam.slice(0, 2)).toEqual(['hide:9', 'hide:7']);
    expect(t.seam).not.toContain('show:12');
  });
});
