import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import type { AnnotationRef, Engine, PdfActionTree } from '@embedpdf/engine-core/runtime';

import { actionsPlugin } from '../src/actions.plugin';
import { ActionsToken } from '../src/internal';
import type { ActionsHostCapability } from '../src/types';

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
  'action_payloads.pdf',
);

/**
 * The dispatcher against a REAL engine and the real payload fixture: trees
 * come from `annotations.list()`, hide names resolve through `doc.forms`,
 * and the executor/sink/adapter seams carry recording fakes.
 */
describe('plugin-actions integration (real engine)', () => {
  let engine: Engine;
  let kernel: Kernel;
  let actions: ActionsHostCapability;
  let pon = 0;
  let treeOf: (nm: string) => PdfActionTree;
  let refOf: (nm: string) => AnnotationRef;

  /** One flat recording of every seam crossing, in call order. */
  const calls: Array<{ seam: string; detail: unknown }> = [];

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    kernel = createKernel({ engine, plugins: [actionsPlugin()] });
    const bytes = new Uint8Array(await readFile(fixturePath));
    await kernel.documents.open({ kind: 'bytes', id: 'action-payloads', bytes });
    actions = kernel.capability(ActionsToken) as ActionsHostCapability;

    actions.registerExecutor('goto', (node) => {
      calls.push({ seam: 'goto', detail: node.type === 'goto' ? node.destination : null });
      return { status: 'executed' };
    });
    actions.registerExecutor('named', (node) => {
      calls.push({ seam: 'named', detail: node.type === 'named' ? node.name : null });
      return { status: 'executed' };
    });
    actions.registerExecutor('javascript', (node) => {
      calls.push({ seam: 'js', detail: node.type === 'javascript' ? node.script : null });
      return { status: 'executed' };
    });
    actions.registerExecutor('reset-form', (node) => {
      calls.push({
        seam: 'reset',
        detail: node.type === 'reset-form' ? { fields: node.fields, exclude: node.exclude } : null,
      });
      return { status: 'executed' };
    });
    actions.registerSessionSink({
      applyVisibility: (entries) => {
        calls.push({ seam: 'hide', detail: entries });
        return entries.length;
      },
    });
    actions.setUiAdapter({
      openUri: (uri, opts) => calls.push({ seam: 'uri', detail: { uri, ...opts } }),
      print: () => calls.push({ seam: 'print', detail: null }),
    });

    // Trees for execute() come straight off the annotation DTOs — read them
    // through a side handle so the tests stay independent of dispatch().
    const opened = await engine.open(
      { kind: 'bytes', id: 'action-payloads-probe', bytes },
      { scope: ['*'] },
    );
    const page = (await opened.pages.list()).pages[0];
    pon = page.pageObjectNumber;
    const { annotations } = await opened.page(pon).annotations.list();
    const byNm = new Map(annotations.map((a) => [a.nm, a]));
    treeOf = (nm: string) => {
      const tree = byNm.get(nm)?.actions?.activate;
      if (!tree) throw new Error(`no activate tree on '${nm}'`);
      return tree;
    };
    refOf = (nm: string) => {
      const ref = byNm.get(nm)?.ref;
      if (!ref) throw new Error(`no annotation named '${nm}'`);
      return ref;
    };
    await opened.close();
  });

  afterAll(async () => {
    await kernel?.destroy(); // closes documents; the engine is caller-owned
    await engine?.destroy();
  });

  const user = { origin: 'user' as const, source: { kind: 'api' as const } };
  const lastCallsSince = (mark: number) => calls.slice(mark).map((c) => c.seam);

  it('routes a GoTo /FitR tree to the navigation executor with its payload', async () => {
    const result = await actions.execute(treeOf('goto-fitr'), user);
    expect(result.status).toBe('executed');
    expect(calls.at(-1)).toMatchObject({
      seam: 'goto',
      detail: { kind: 'fitR', left: 10, bottom: 20, right: 300, top: 400 },
    });
  });

  it('routes a Named verb to the executor', async () => {
    const result = await actions.execute(treeOf('named-next'), user);
    expect(result.status).toBe('executed');
    expect(calls.at(-1)).toMatchObject({ seam: 'named', detail: 'NextPage' });
  });

  it('resolves hide-mixed: the objectNumber ref directly, the NAME through doc.forms', async () => {
    const mark = calls.length;
    const result = await actions.execute(treeOf('hide-mixed'), user);
    expect(result.status).toBe('executed');
    expect(lastCallsSince(mark)).toEqual(['hide']);
    const entries = calls.at(-1)!.detail as Array<{ annotObjectNumber: number; hidden: boolean }>;
    // /H false — a SHOW. Two resolved targets: the square (by object number)
    // and the note1 FIELD's widget (name → doc.forms → annotObjectNumber).
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.hidden === false)).toBe(true);
    expect(new Set(entries.map((e) => e.annotObjectNumber)).size).toBe(2);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports an unresolved hide name as a diagnostic, still executing the rest', async () => {
    const result = await actions.execute(treeOf('hide-scalar'), user); // (fieldB) — no such field
    expect(result.nodes[0]?.status).toBe('executed');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unresolved-target' }),
    );
  });

  it('carries the ResetForm three-state payload to the executor untouched', async () => {
    await actions.execute(treeOf('reset-include'), user);
    expect(calls.at(-1)).toMatchObject({
      seam: 'reset',
      detail: { fields: [{ kind: 'name', name: 'calc1' }], exclude: true },
    });
    await actions.execute(treeOf('reset-absent'), user);
    expect(calls.at(-1)).toMatchObject({ seam: 'reset', detail: { fields: null, exclude: true } });
    await actions.execute(treeOf('reset-empty'), user);
    expect(calls.at(-1)).toMatchObject({ seam: 'reset', detail: { fields: [], exclude: false } });
  });

  it('routes a user-origin URI through the adapter with /IsMap', async () => {
    const result = await actions.execute(treeOf('uri-map'), user);
    expect(result.status).toBe('executed');
    expect(calls.at(-1)).toMatchObject({
      seam: 'uri',
      detail: { uri: 'https://example.test/map', isMap: true, origin: 'user' },
    });
  });

  it('refuses launch and goto-remote as never-executable', async () => {
    for (const nm of ['launch-app', 'gotor-file']) {
      const result = await actions.execute(treeOf(nm), user);
      expect(result.nodes[0]?.status).toBe('blocked');
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'blocked' }));
    }
  });

  it('runs the JS→GoTo→Hide chain with document work first, navigation deferred last', async () => {
    const mark = calls.length;
    const result = await actions.execute(treeOf('chain-js-goto-hide'), user);
    expect(result.status).toBe('executed');
    // Walk order executes JS then Hide inline; the GoTo navigation thunk
    // fires only after every document-lifetime node succeeded.
    expect(lastCallsSince(mark)).toEqual(['js', 'hide', 'goto']);
    expect(result.nodes.map((n) => [n.path.join('.'), n.type, n.status])).toEqual([
      ['', 'javascript', 'executed'],
      ['0', 'goto', 'executed'],
      ['0.0', 'hide', 'executed'],
    ]);
    expect((calls[mark]!.detail as string).includes('chain')).toBe(true);
  });

  it('degraded payload-dropped nodes arrive as unknown and land no-executor', async () => {
    for (const nm of ['goto-malformed', 'hide-partial']) {
      const mark = calls.length;
      const result = await actions.execute(treeOf(nm), user);
      expect(result.nodes[0]?.type).toBe('unknown');
      expect(result.nodes[0]?.status).toBe('no-executor');
      expect(lastCallsSince(mark)).toEqual([]); // nothing executed, nothing leaked
    }
  });

  it('dispatches by activate trigger: annotation ref → tree → executors', async () => {
    const mark = calls.length;
    const result = await actions.dispatch({
      scope: 'activate',
      // The ref a trigger source really passes: the DTO's own (objectNumber).
      ref: refOf('named-next'),
      pon,
    });
    expect(result.status).toBe('executed');
    expect(lastCallsSince(mark)).toEqual(['named']);
  });
});
