import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { toPageRef, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import { actionsPlugin } from '../src/actions.plugin';
import { ActionsToken } from '../src/host-contract';
import type { ActionsHostCapability, ActionsConfig } from '../src/host-contract';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures', name);

/** Kernel + real engine + recording seams over one fixture. */
async function boot(file: string, options?: { config?: ActionsConfig }) {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const kernel = createKernel({
    engine,
    plugins: [actionsPlugin(options?.config)],
  });
  const bytes = new Uint8Array(await readFile(fixture(file)));
  await kernel.documents.open({ kind: 'bytes', id: `trigger-${file}`, bytes });
  const actions = kernel.capability(ActionsToken) as ActionsHostCapability;

  const seam: string[] = [];
  actions.registerAnnotCommitSink(async (entries) => {
    for (const entry of entries) {
      seam.push(`${entry.patch.flags?.hidden ? 'hide' : 'show'}:${entry.annotObjectNumber}`);
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

  const firstPage = 3; // both fixtures: the first page is object 3
  const drain = () =>
    actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: { kind: 'objectNumber', page: toPageRef(firstPage), annotObjectNumber: 999 },
      page: toPageRef(firstPage),
    });
  const ref = (annotObjectNumber: number): AnnotationRef => ({
    kind: 'objectNumber',
    page: toPageRef(firstPage),
    annotObjectNumber,
  });

  return {
    kernel,
    engine,
    actions,
    seam,
    firstPage,
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
    await using booted = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    await booted.actions.dispatch({
      scope: 'page',
      event: 'open',
      page: toPageRef(booted.firstPage),
    });
    // Page /O (shows pageTip 7) before the /PO set (shows lifeTip 9).
    expect(booted.seam).toEqual(['show:7', 'show:9']);
    booted.seam.length = 0;
    await booted.actions.dispatch({
      scope: 'page',
      event: 'close',
      page: toPageRef(booted.firstPage),
    });
    // /PC set (hides lifeTip 9) before page /C (hides pageTip 7).
    expect(booted.seam).toEqual(['hide:9', 'hide:7']);
  });

  it('fans visibility events out to the /PV /PI sets only', async () => {
    await using booted = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    await booted.actions.dispatch({
      scope: 'page',
      event: 'visible',
      page: toPageRef(booted.firstPage),
    });
    await booted.actions.dispatch({
      scope: 'page',
      event: 'invisible',
      page: toPageRef(booted.firstPage),
    });
    expect(booted.seam).toEqual(['show:12', 'hide:12']);
  });

  it('runs the native tooltip: /E shows, /X hides — zero scripting anywhere', async () => {
    await using booted = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    await booted.actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: booted.ref(5),
      page: toPageRef(booted.firstPage),
    });
    expect(booted.seam).toEqual(['show:6']);
    await booted.actions.dispatch({
      scope: 'annotation',
      event: 'cursorExit',
      ref: booted.ref(5),
      page: toPageRef(booted.firstPage),
    });
    expect(booted.seam).toEqual(['show:6', 'hide:6']);
  });

  it('delivers a LINK annotation /AA hover tree (the link-plane feed target)', async () => {
    await using booted = await boot('action_triggers.pdf', {
      config: { openSequence: 'off' },
    });
    const result = await booted.actions.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: booted.ref(10),
      page: toPageRef(booted.firstPage),
      source: { kind: 'link', annotation: booted.ref(10), page: toPageRef(booted.firstPage) },
    });
    expect(result.status).toBe('executed');
    expect(booted.seam).toEqual(['show:11']);
  });

  it('runs the open sequence on adapter install: openAction chain, in order, once', async () => {
    await using booted = await boot('action_open_chain.pdf');
    expect(booted.seam).toEqual([]);
    booted.actions.setUiAdapter({ openUri: () => {}, print: () => {} });
    await booted.drain();
    await booted.drain();
    // The deferred-navigation law holds inside the open sequence too: the
    // /Next Hide applies inline during the walk, the Named navigation thunk
    // fires after — the view never moves before the session effect lands.
    // (No fallback page-open in auto.)
    expect(booted.seam).toEqual(['show:4', 'named:NextPage']);
    const replay = await booted.actions.dispatch({ scope: 'document', event: 'open' });
    expect(replay.diagnostics[0]).toMatchObject({ code: 'open-sequence-replayed' });
  });

  it('hands the destination-form /OpenAction to the goto executor as a lifecycle reveal', async () => {
    await using booted = await boot('open_action_dest.pdf');
    booted.actions.setUiAdapter({ openUri: () => {}, print: () => {} });
    await booted.drain();
    await booted.drain();
    expect(booted.seam).toEqual(['goto:xyz']);
  });

  // The stage-report half of the coordinator (placement → page open, real
  // stagePlugin) lives with the feeder: plugin-stage/test/actions-feed —
  // a devDependency here would close the stage↔actions package cycle.
});
