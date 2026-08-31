import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@embedpdf/core';
import type { PdfActionNode, PdfActionTree } from '@embedpdf/engine-core/runtime';

import { createActionsCapability } from '../src/capability';
import type {
  ActionContext,
  ActionsAction,
  ActionsPluginConfig,
  ActionsState,
  ActionUiAdapter,
} from '../src/types';

const USER: ActionContext = { origin: 'user', source: { kind: 'api' } };
const LIFECYCLE: ActionContext = { origin: 'lifecycle', source: { kind: 'api' } };

const tree = (root: PdfActionNode | null, incomplete = false): PdfActionTree => ({
  root,
  incomplete,
  warningFlags: 0,
  warnings: incomplete ? ['incomplete'] : [],
});

const js = (script: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script,
  next,
});
const goto = (next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'goto',
  subtype: 'GoTo',
  destination: { kind: 'fit', pageObjectNumber: 3 },
  next,
});
const uri = (value: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'uri',
  subtype: 'URI',
  uri: value,
  isMap: false,
  next,
});
const named = (name: string): PdfActionNode => ({ type: 'named', subtype: 'Named', name, next: [] });
const hide = (
  targets: Extract<PdfActionNode, { type: 'hide' }>['targets'],
  hidden = true,
): PdfActionNode => ({ type: 'hide', subtype: 'Hide', targets, hide: hidden, next: [] });

function harness(config?: ActionsPluginConfig, fields: Array<{ name: string; widgets: number[] }> = []) {
  const dispatch = vi.fn();
  const cleanups: Array<() => void> = [];
  const ctx = {
    doc: {
      forms: {
        list: async () => ({
          fields: fields.map(({ name, widgets }) => ({
            name,
            widgets: widgets.map((annotObjectNumber) => ({
              annotObjectNumber,
              pageObjectNumber: 3,
            })),
          })),
        }),
      },
    },
    documentId: 'doc-1',
    dispatch,
    tryGet: () => null,
    cleanup: (fn: () => void) => cleanups.push(fn),
  } as unknown as PluginContext<ActionsState, ActionsAction>;
  const capability = createActionsCapability(ctx, config);
  return { capability, dispatch, cleanups };
}

describe('actions dispatcher', () => {
  it('refuses an incomplete tree without executing anything', async () => {
    const { capability } = harness();
    const executor = vi.fn(() => ({ status: 'executed' as const }));
    capability.registerExecutor('javascript', executor);
    const result = await capability.execute(tree(js('boot()'), true), USER);
    expect(result.status).toBe('refused');
    expect(result.nodes).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: 'incomplete-tree' });
    expect(executor).not.toHaveBeenCalled();
    expect(capability.canExecute(tree(js('boot()'), true), USER)).toBe(false);
  });

  it('walks /Next in PDF order with path bookkeeping', async () => {
    const { capability } = harness();
    const seen: string[] = [];
    capability.registerExecutor('javascript', (node) => {
      seen.push((node as Extract<PdfActionNode, { type: 'javascript' }>).script);
      return { status: 'executed' };
    });
    const result = await capability.execute(
      tree(js('a', [js('b', [js('c')]), js('d')])),
      USER,
    );
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(result.nodes.map((node) => node.path)).toEqual([[], [0], [0, 0], [1]]);
    expect(result.status).toBe('executed');
  });

  it('defers navigation and external effects until document work succeeded', async () => {
    const { capability } = harness();
    const order: string[] = [];
    capability.registerExecutor('javascript', () => {
      order.push('js');
      return { status: 'executed' };
    });
    capability.registerExecutor('goto', () => {
      order.push('goto');
      return { status: 'executed' };
    });
    capability.setUiAdapter({
      openUri: () => order.push('uri'),
      print: () => order.push('print'),
    });
    // PDF order: goto → js → uri. Navigation/external must still fire AFTER js.
    await capability.execute(tree(goto([js('x', [uri('https://a.test/')])])), USER);
    expect(order).toEqual(['js', 'goto', 'uri']);
  });

  it('drops deferred effects and skips later document nodes after a failure', async () => {
    const { capability } = harness();
    const openUri = vi.fn();
    capability.setUiAdapter({ openUri, print: vi.fn() });
    capability.registerExecutor('goto', vi.fn(() => ({ status: 'executed' as const })));
    capability.registerExecutor('javascript', (node) => {
      const script = (node as Extract<PdfActionNode, { type: 'javascript' }>).script;
      return script === 'boom'
        ? { status: 'failed', error: 'exploded' }
        : { status: 'executed' };
    });
    const result = await capability.execute(
      tree(goto([js('boom', [js('after'), uri('https://a.test/')])])),
      USER,
    );
    expect(openUri).not.toHaveBeenCalled();
    expect(result.status).toBe('partial');
    expect(result.nodes.map((node) => node.status)).toEqual([
      'skipped', // goto: deferred, dropped
      'failed', // boom
      'skipped', // later document node
      'skipped', // uri: deferred, dropped
    ]);
  });

  it('applies the origin policy matrix: lifecycle uri reports, submit-form blocks, launch never', async () => {
    const { capability } = harness();
    const openUri = vi.fn();
    capability.setUiAdapter({ openUri, print: vi.fn() });
    const lifecycle = await capability.execute(tree(uri('https://a.test/')), LIFECYCLE);
    expect(lifecycle.nodes[0].status).toBe('blocked');
    expect(openUri).not.toHaveBeenCalled();
    expect(capability.canExecute(tree(uri('https://a.test/')), LIFECYCLE)).toBe(false);
    expect(capability.canExecute(tree(uri('https://a.test/')), USER)).toBe(true);

    const submit = await capability.execute(
      tree({ type: 'submit-form', subtype: 'SubmitForm', next: [] }),
      USER,
    );
    expect(submit.nodes[0].status).toBe('blocked');
    const launch = await capability.execute(
      tree({ type: 'launch', subtype: 'Launch', filePath: 'x.exe', next: [] }),
      USER,
    );
    expect(launch.nodes[0].status).toBe('blocked');
  });

  it('routes Named Print through the adapter, never an executor', async () => {
    const { capability } = harness();
    const namedExecutor = vi.fn(() => ({ status: 'executed' as const }));
    capability.registerExecutor('named', namedExecutor);
    const print = vi.fn();
    capability.setUiAdapter({ openUri: vi.fn(), print });
    const result = await capability.execute(tree(named('Print')), USER);
    expect(print).toHaveBeenCalledTimes(1);
    expect(namedExecutor).not.toHaveBeenCalled();
    expect(result.status).toBe('executed');
  });

  it('resolves hide name targets to field widgets and object numbers to the sink', async () => {
    const { capability } = harness(undefined, [{ name: 'note1', widgets: [41, 42] }]);
    const applied: Array<{ annotObjectNumber: number; hidden: boolean }> = [];
    capability.registerSessionSink({
      applyVisibility: (entries) => {
        applied.push(...entries);
        return entries.length;
      },
    });
    const result = await capability.execute(
      tree(hide([{ kind: 'name', name: 'note1' }, { kind: 'objectNumber', objectNumber: 7 }], false)),
      USER,
    );
    expect(result.status).toBe('executed');
    expect(applied).toEqual([
      { annotObjectNumber: 7, hidden: false },
      { annotObjectNumber: 41, hidden: false },
      { annotObjectNumber: 42, hidden: false },
    ]);
  });

  it('reports unresolved hide names and a missing sink honestly', async () => {
    const { capability } = harness();
    const noSink = await capability.execute(tree(hide([{ kind: 'name', name: 'ghost' }])), USER);
    expect(noSink.nodes[0].status).toBe('no-executor');
    expect(noSink.diagnostics[0]).toMatchObject({ code: 'no-session-sink' });

    capability.registerSessionSink({ applyVisibility: () => 0 });
    const missing = await capability.execute(tree(hide([{ kind: 'name', name: 'ghost' }])), USER);
    expect(missing.nodes[0].status).toBe('executed');
    expect(missing.diagnostics.some((d) => d.code === 'unresolved-target')).toBe(true);
  });

  it('serializes dispatches on one queue', async () => {
    const { capability } = harness();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    capability.registerExecutor('javascript', async (node) => {
      const script = (node as Extract<PdfActionNode, { type: 'javascript' }>).script;
      order.push(`${script}-start`);
      if (script === 'slow') await gate;
      order.push(`${script}-end`);
      return { status: 'executed' };
    });
    const first = capability.execute(tree(js('slow')), USER);
    const second = capability.execute(tree(js('fast')), USER);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['slow-start', 'slow-end', 'fast-start', 'fast-end']);
  });

  it('replaces duplicate executors last-wins with identity-safe disposal', async () => {
    const { capability } = harness();
    const first = vi.fn(() => ({ status: 'executed' as const }));
    const second = vi.fn(() => ({ status: 'executed' as const }));
    const offFirst = capability.registerExecutor('javascript', first);
    capability.registerExecutor('javascript', second);
    offFirst(); // must NOT remove the current (second) registration
    await capability.execute(tree(js('x')), USER);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('installs the UI adapter identity-safely', async () => {
    const { capability } = harness();
    const first: ActionUiAdapter = { openUri: vi.fn(), print: vi.fn() };
    const second: ActionUiAdapter = { openUri: vi.fn(), print: vi.fn() };
    const offFirst = capability.setUiAdapter(first);
    capability.setUiAdapter(second);
    offFirst(); // a stale disposer must not wipe the successor
    await capability.execute(tree(uri('https://a.test/')), USER);
    expect(second.openUri).toHaveBeenCalledTimes(1);
    expect(first.openUri).not.toHaveBeenCalled();
  });

  it('emits onAction with the inline result and reports javascript-without-executor as inert', async () => {
    const { capability } = harness();
    const events: string[] = [];
    capability.onAction(({ result }) => events.push(result.status));
    const result = await capability.execute(tree(js('orphan()')), USER);
    expect(result.status).toBe('inert');
    expect(result.nodes[0].status).toBe('inert');
    expect(events).toEqual(['inert']);
  });
});
