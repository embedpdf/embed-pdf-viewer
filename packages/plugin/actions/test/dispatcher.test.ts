import { describe, expect, it, vi } from 'vitest';

import { createTestContext } from '@embedpdf/core/testing';
import {
  toPageRef,
  type DocumentHandle,
  type PdfActionNode,
  type PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import { createActionsController } from '../src/controller';
import type { ActionContext, ActionsConfig, ActionUiAdapter } from '../src/host-contract';

const USER: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};
const LIFECYCLE: ActionContext = {
  origin: 'lifecycle',
  source: { kind: 'api' },
  event: { scope: 'document', name: 'open' },
};

const tree = (root: PdfActionNode | null, incomplete = false): PdfActionTree => ({
  root,
  incomplete,
  warningFlags: 0,
  warnings: incomplete ? ['incomplete'] : [],
});

const script = (source: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script: source,
  next,
});
const goto = (next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'goto',
  subtype: 'GoTo',
  destination: { kind: 'fit', page: toPageRef(3) },
  next,
});
const uri = (value: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'uri',
  subtype: 'URI',
  uri: value,
  isMap: false,
  next,
});
const named = (name: string): PdfActionNode => ({
  type: 'named',
  subtype: 'Named',
  name,
  next: [],
});
const hide = (
  targets: Extract<PdfActionNode, { type: 'hide' }>['targets'],
  hidden = true,
): PdfActionNode => ({ type: 'hide', subtype: 'Hide', targets, hide: hidden, next: [] });

function harness(config?: ActionsConfig, fields: Array<{ name: string; widgets: number[] }> = []) {
  const ctx = createTestContext<void>({
    id: 'actions',
    doc: {
      forms: {
        list: async () => ({
          fields: fields.map(({ name, widgets }, index) => ({
            name,
            fieldObjectNumber: 100 + index,
            widgets: widgets.map((annotObjectNumber) => ({
              annotObjectNumber,
              page: toPageRef(3),
            })),
          })),
        }),
      },
    } as unknown as Partial<DocumentHandle>,
  });
  const capability = ctx.connect(createActionsController(ctx, config));
  return { capability };
}

describe('actions dispatcher', () => {
  it('refuses an incomplete tree without executing anything', async () => {
    const { capability } = harness();
    const executor = vi.fn(() => ({ status: 'executed' as const }));
    capability.registerExecutor('javascript', executor);
    const result = await capability.execute(tree(script('boot()'), true), USER);
    expect(result.status).toBe('refused');
    expect(result.nodes).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: 'incomplete-tree' });
    expect(executor).not.toHaveBeenCalled();
    expect(capability.canExecute(tree(script('boot()'), true), USER)).toBe(false);
  });

  it('walks /Next in PDF order with path bookkeeping', async () => {
    const { capability } = harness();
    const seen: string[] = [];
    capability.registerExecutor('javascript', (node) => {
      seen.push((node as Extract<PdfActionNode, { type: 'javascript' }>).script);
      return { status: 'executed' };
    });
    const result = await capability.execute(
      tree(script('a', [script('b', [script('c')]), script('d')])),
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
    // PDF order: goto → js → uri. Navigation/external must still fire after js.
    await capability.execute(tree(goto([script('x', [uri('https://a.test/')])])), USER);
    expect(order).toEqual(['js', 'goto', 'uri']);
  });

  it('drops deferred effects and skips later document nodes after a failure', async () => {
    const { capability } = harness();
    const openUri = vi.fn();
    capability.setUiAdapter({ openUri, print: vi.fn() });
    capability.registerExecutor(
      'goto',
      vi.fn(() => ({ status: 'executed' as const })),
    );
    capability.registerExecutor('javascript', (node) => {
      const source = (node as Extract<PdfActionNode, { type: 'javascript' }>).script;
      return source === 'boom' ? { status: 'failed', error: 'exploded' } : { status: 'executed' };
    });
    const result = await capability.execute(
      tree(goto([script('boom', [script('after'), uri('https://a.test/')])])),
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

  it('applies the origin policy matrix: lifecycle uri reports, submit-form gates, launch never', async () => {
    const { capability } = harness();
    const openUri = vi.fn();
    capability.setUiAdapter({ openUri, print: vi.fn() });
    const lifecycle = await capability.execute(tree(uri('https://a.test/')), LIFECYCLE);
    expect(lifecycle.nodes[0].status).toBe('blocked');
    expect(openUri).not.toHaveBeenCalled();
    expect(capability.canExecute(tree(uri('https://a.test/')), LIFECYCLE)).toBe(false);
    expect(capability.canExecute(tree(uri('https://a.test/')), USER)).toBe(true);

    // A submit node without a payload (a runtime that does not extract it)
    // is recognized but inert, and diagnosed.
    const bare = await capability.execute(
      tree({ type: 'submit-form', subtype: 'SubmitForm', next: [] }),
      USER,
    );
    expect(bare.nodes[0].status).toBe('inert');
    expect(
      bare.diagnostics.some((diagnostic) => diagnostic.code === 'submit-payload-unavailable'),
    ).toBe(true);

    // A payloaded submit under hover origin never reaches any sink.
    const payloaded = tree({
      type: 'submit-form',
      subtype: 'SubmitForm',
      payload: {
        url: 'https://home.test/x',
        fields: null,
        flags: {
          raw: 0,
          exclude: false,
          includeNoValueFields: false,
          format: 'fdf' as const,
          method: 'post' as const,
          submitCoordinates: false,
          includeAppendSaves: false,
          includeAnnotations: false,
          canonicalFormat: false,
          exclNonUserAnnots: false,
          exclFKey: false,
          embedForm: false,
        },
      },
      next: [],
    });
    const hover = await capability.execute(payloaded, {
      origin: 'hover',
      source: { kind: 'api' },
      event: { scope: 'annotation', name: 'cursorEnter' },
    });
    expect(hover.nodes[0].status).toBe('blocked');

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

  it('routes hide by OWNING plane: field names → form setDisplay, plain annots → flag patches', async () => {
    const { capability } = harness(undefined, [{ name: 'note1', widgets: [41, 42] }]);
    const displays: Array<{ fieldObjectNumber: number; display: string }> = [];
    capability.registerFormCommitSink(async (effects) => {
      for (const effect of effects) {
        if (effect.kind === 'setDisplay' && effect.ref.kind === 'objectNumber') {
          displays.push({
            fieldObjectNumber: effect.ref.fieldObjectNumber,
            display: effect.display,
          });
        }
      }
      return {
        results: effects.map((_, index) => ({
          index,
          status: 'applied' as const,
          fields: [],
          changedWidgets: [],
        })),
        meta: { affectedPages: [], cacheDelta: null, changedFields: [], changedWidgets: [] },
      };
    });
    const flagged: Array<{ annotObjectNumber: number; hidden: boolean | undefined }> = [];
    capability.registerAnnotCommitSink(async (entries) => {
      for (const entry of entries) {
        flagged.push({
          annotObjectNumber: entry.annotObjectNumber,
          hidden: entry.patch.flags?.hidden,
        });
      }
      return {
        results: entries.map((entry) => ({
          annotObjectNumber: entry.annotObjectNumber,
          status: 'applied' as const,
        })),
      };
    });
    const result = await capability.execute(
      tree(
        hide(
          [
            { kind: 'name', name: 'note1' },
            { kind: 'objectNumber', objectNumber: 7 },
          ],
          false,
        ),
      ),
      USER,
    );
    expect(result.status).toBe('executed');
    // The field name became field-level display truth (the engine's widget
    // visibility door); the bare object number stayed an annotation flag.
    expect(displays).toEqual([{ fieldObjectNumber: 100, display: 'visible' }]);
    expect(flagged).toEqual([{ annotObjectNumber: 7, hidden: false }]);
  });

  it('reports missing sinks, unresolved names, and refused commits honestly', async () => {
    const { capability } = harness();
    const noSink = await capability.execute(
      tree(hide([{ kind: 'objectNumber', objectNumber: 7 }])),
      USER,
    );
    expect(noSink.nodes[0].status).toBe('no-executor');
    expect(noSink.diagnostics[0]).toMatchObject({ code: 'no-commit-sink' });

    const ghost = await capability.execute(tree(hide([{ kind: 'name', name: 'ghost' }])), USER);
    expect(ghost.nodes[0].status).toBe('executed'); // nothing resolved, nothing failed
    expect(ghost.diagnostics.some((diagnostic) => diagnostic.code === 'unresolved-target')).toBe(
      true,
    );

    // An authority refusal is a failed document mutation — full ISO.
    capability.registerAnnotCommitSink(async (entries) => ({
      results: entries.map((entry) => ({
        annotObjectNumber: entry.annotObjectNumber,
        status: 'failed' as const,
        error: 'PermissionDenied: doc.annotate.modify',
      })),
    }));
    const refused = await capability.execute(
      tree(hide([{ kind: 'objectNumber', objectNumber: 7 }])),
      USER,
    );
    expect(refused.nodes[0].status).toBe('failed');
    expect(
      refused.diagnostics.some((diagnostic) => diagnostic.message.includes('PermissionDenied')),
    ).toBe(true);
  });

  it('serializes dispatches on one queue', async () => {
    const { capability } = harness();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    capability.registerExecutor('javascript', async (node) => {
      const source = (node as Extract<PdfActionNode, { type: 'javascript' }>).script;
      order.push(`${source}-start`);
      if (source === 'slow') await gate;
      order.push(`${source}-end`);
      return { status: 'executed' };
    });
    const first = capability.execute(tree(script('slow')), USER);
    const second = capability.execute(tree(script('fast')), USER);
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
    offFirst(); // must not remove the current (second) registration
    await capability.execute(tree(script('x')), USER);
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

  it('emits onExecuted with the inline result and reports javascript-without-executor as inert', async () => {
    const { capability } = harness();
    const events: string[] = [];
    capability.onExecuted(({ result }) => events.push(result.status));
    const result = await capability.execute(tree(script('orphan()')), USER);
    expect(result.status).toBe('inert');
    expect(result.nodes[0].status).toBe('inert');
    expect(events).toEqual(['inert']);
  });
});
