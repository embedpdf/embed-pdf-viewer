import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';

import { actionsPlugin } from '../src/actions.plugin';
import { ActionsToken } from '../src/internal';
import type { ActionsHostCapability, ActionsPluginConfig } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures', name);

/** Kernel + real engine + recording seams over one fixture. */
async function boot(file: string, opts?: { config?: ActionsPluginConfig }) {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [actionsPlugin(opts?.config)],
  });
  const bytes = new Uint8Array(await readFile(fixture(file)));
  await kernel.documents.open({ kind: 'bytes', id: `trigger-${file}`, bytes });
  const actions = kernel.capability(ActionsToken) as ActionsHostCapability;

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
  actions.registerExecutor('named', (node) => {
    seam.push(`named:${node.type === 'named' ? node.name : '?'}`);
    return { status: 'executed' };
  });
  actions.registerExecutor('goto', (node) => {
    seam.push(
      `goto:${node.type === 'goto' && 'kind' in node.destination ? node.destination.kind : '?'}`,
    );
    return { status: 'executed' };
  });

  const pon = 3; // both fixtures: first page is object 3
  const drain = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', pageObjectNumber: pon, annotObjectNumber: 999 },
      pon,
    });
  const ref = (annotObjectNumber: number): AnnotationRef => ({
    kind: 'objectNumber',
    pageObjectNumber: pon,
    annotObjectNumber,
  });

  return {
    kernel,
    engine,
    actions,
    seam,
    pon,
    ref,
    drain,
    async [Symbol.asyncDispose]() {
      await kernel.destroy();
      await engine.destroy();
    },
  };
}

describe('trigger integration (real engine)', () => {
  it('fans page open/close out in ISO order over real /AA trees', async () => {
    await using t = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    await t.actions.dispatch({ scope: 'page', event: 'open', pon: t.pon });
    // Page /O (shows pageTip 7) BEFORE the /PO set (shows lifeTip 9).
    expect(t.seam).toEqual(['show:7', 'show:9']);
    t.seam.length = 0;
    await t.actions.dispatch({ scope: 'page', event: 'close', pon: t.pon });
    // /PC set (hides lifeTip 9) BEFORE page /C (hides pageTip 7).
    expect(t.seam).toEqual(['hide:9', 'hide:7']);
  });

  it('fans visibility events out to the /PV /PI sets only', async () => {
    await using t = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    await t.actions.dispatch({ scope: 'page', event: 'visible', pon: t.pon });
    await t.actions.dispatch({ scope: 'page', event: 'invisible', pon: t.pon });
    expect(t.seam).toEqual(['show:12', 'hide:12']);
  });

  it('runs the native tooltip: /E shows, /X hides — zero scripting anywhere', async () => {
    await using t = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    await t.actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: t.ref(5),
      pon: t.pon,
    });
    expect(t.seam).toEqual(['show:6']);
    await t.actions.dispatch({
      scope: 'annotation',
      event: 'cursorExit',
      ref: t.ref(5),
      pon: t.pon,
    });
    expect(t.seam).toEqual(['show:6', 'hide:6']);
  });

  it('delivers a LINK annotation /AA hover tree (the link-plane feed target)', async () => {
    await using t = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    const result = await t.actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: t.ref(10),
      pon: t.pon,
      source: { kind: 'link', annotation: t.ref(10), pon: t.pon },
    });
    expect(result.status).toBe('executed');
    expect(t.seam).toEqual(['show:11']);
  });

  it('runs the open sequence on adapter install: openAction chain, in order, once', async () => {
    await using t = await boot('action_open_chain.pdf');
    expect(t.seam).toEqual([]);
    t.actions.setUiAdapter({ openUri: () => {}, print: () => {} });
    await t.drain();
    await t.drain();
    // The deferred-navigation law holds inside the open sequence too: the
    // /Next Hide applies INLINE during the walk, the Named navigation thunk
    // fires after — the view never moves before the session effect lands.
    // (No fallback page-open in auto.)
    expect(t.seam).toEqual(['show:4', 'named:NextPage']);
    const replay = await t.actions.dispatch({ scope: 'document', event: 'open' });
    expect(replay.diagnostics[0]).toMatchObject({ code: 'open-sequence-replayed' });
  });

  it('hands the destination-form /OpenAction to the goto executor as a lifecycle reveal', async () => {
    await using t = await boot('open_action_dest.pdf');
    t.actions.setUiAdapter({ openUri: () => {}, print: () => {} });
    await t.drain();
    await t.drain();
    expect(t.seam).toEqual(['goto:xyz']);
  });

  // The stage-report half of the coordinator (placement → page open, real
  // stagePlugin) lives with the feeder: plugin-stage/test/actions-feed —
  // a devDependency here would close the stage↔actions package cycle.
});
