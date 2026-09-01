import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@embedpdf/core';
import type {
  DocumentActionsSnapshot,
  PdfActionNode,
  PdfActionTree,
  SubmitFormPayload,
} from '@embedpdf/engine-core/runtime';

import { createActionsCapability } from '../src/capability';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionsAction,
  ActionsPluginConfig,
  ActionsState,
} from '../src/types';

const USER: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

const tree = (root: PdfActionNode | null): PdfActionTree => ({
  root,
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});
const js = (script: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script,
  next,
});
const named = (name: string): PdfActionNode => ({ type: 'named', subtype: 'Named', name, next: [] });

const FLAGS_ZERO = {
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
};
const submitPayload = (overrides: Partial<SubmitFormPayload> = {}): SubmitFormPayload => ({
  url: 'https://home.test/submit',
  fields: null,
  flags: FLAGS_ZERO,
  ...overrides,
});
const submitNode = (payload: SubmitFormPayload | undefined): PdfActionNode => ({
  type: 'submit-form',
  subtype: 'SubmitForm',
  ...(payload ? { payload } : {}),
  next: [],
});

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A doc-events harness: a fake document whose catalog carries the five
 * Table-200 trees (each a one-script JS tree logging its own name), an
 * optional OpenAction (the D1 ordering probe), an optional failing first
 * read (the D11 eviction probe), and an optional `forms.submit` home.
 */
function docHarness(options: {
  config?: ActionsPluginConfig;
  trees?: Partial<
    Record<'willSave' | 'didSave' | 'willPrint' | 'didPrint' | 'willClose', PdfActionTree>
  >;
  openAction?: PdfActionTree;
  readFailsFirst?: boolean;
  formsSubmit?: (request: unknown) => Promise<{ submissionId: string; receivedAt: string }>;
}) {
  let readCalls = 0;
  const snapshot: DocumentActionsSnapshot = {
    nameTreeScripts: [],
    openAction: options.openAction ?? null,
    openDestination: null,
    ...(options.trees ?? {}),
  };
  const ctx = {
    doc: {
      actions: {
        read: () => {
          readCalls += 1;
          if (options.readFailsFirst && readCalls === 1) {
            return Promise.reject(new Error('transient read failure'));
          }
          return Promise.resolve(snapshot);
        },
      },
      forms: {
        list: async () => ({ fields: [] }),
        ...(options.formsSubmit ? { submit: options.formsSubmit } : {}),
      },
    },
    documentId: 'doc-1',
    dispatch: vi.fn(),
    tryGet: () => null,
    cleanup: () => undefined,
  } as unknown as PluginContext<ActionsState, ActionsAction>;
  const capability = createActionsCapability(ctx, { openSequence: 'off', ...options.config });
  const log: string[] = [];
  capability.registerExecutor('javascript', (node) => {
    if (node.type === 'javascript') log.push(node.script);
    return { status: 'executed' };
  });
  const diagnostics: ActionDiagnostic[] = [];
  capability.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));
  return { capability, log, diagnostics, readCallCount: () => readCalls };
}

describe('document lifecycle events (WC/WS/DS/WP/DP)', () => {
  it('resolves each of the five catalog trees through dispatch', async () => {
    const { capability, log } = docHarness({
      trees: {
        willSave: tree(js('ws')),
        didSave: tree(js('ds')),
        willPrint: tree(js('wp')),
        didPrint: tree(js('dp')),
        willClose: tree(js('wc')),
      },
    });
    for (const event of [
      'will-save',
      'did-save',
      'will-print',
      'did-print',
      'will-close',
    ] as const) {
      const result = await capability.dispatch({ scope: 'document', event });
      expect(result.status).toBe('executed');
    }
    expect(log).toEqual(['ws', 'ds', 'wp', 'dp', 'wc']);
  });

  it('D1: a first will-save under openSequence auto runs the OpenAction FIRST', async () => {
    const { capability, log } = docHarness({
      config: { openSequence: 'auto' },
      openAction: tree(js('open')),
      trees: { willSave: tree(js('ws')) },
    });
    // No adapter, no user activity — the open latch is still armed.
    await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(log).toEqual(['open', 'ws']);
    // And the sequence counts as fired: a document-open trigger replays inert.
    const replay = await capability.dispatch({ scope: 'document', event: 'open' });
    expect(replay.status).toBe('inert');
    expect(replay.diagnostics.some((d) => d.code === 'open-sequence-replayed')).toBe(true);
  });

  it('D2: two concurrent runDocumentVerb(save) calls fully serialize', async () => {
    const { capability, log } = docHarness({
      trees: { willSave: tree(js('ws')), didSave: tree(js('ds')) },
    });
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const first = capability.runDocumentVerb('save', async () => {
      log.push('op1');
      await gate;
      log.push('op1-done');
      return 'bytes-1';
    });
    const second = capability.runDocumentVerb('save', async () => {
      log.push('op2');
      return 'bytes-2';
    });
    await tick();
    // The second verb has not started: no interleaving is representable.
    expect(log).toEqual(['ws', 'op1']);
    releaseFirst();
    await expect(first).resolves.toBe('bytes-1');
    await expect(second).resolves.toBe('bytes-2');
    expect(log).toEqual(['ws', 'op1', 'op1-done', 'ds', 'ws', 'op2', 'ds']);
  });

  it('D3: the Print verb runs WP → adapter (exactly once) → DP; a nested Print is suppressed', async () => {
    const { capability, log, diagnostics } = docHarness({
      // The WP tree itself chains into a nested Named Print — the
      // reentrancy probe. Policy admits lifecycle prints HERE so the probe
      // reaches the LATCH (the default lifecycle row would block it a layer
      // earlier — also fine, but this test pins the latch itself).
      config: { policy: { print: { user: 'adapter', hover: 'block', lifecycle: 'adapter' } } },
      trees: {
        willPrint: tree(js('wp', [named('Print')])),
        didPrint: tree(js('dp')),
      },
    });
    const print = vi.fn(() => log.push('print'));
    capability.setUiAdapter({ openUri: vi.fn(), print });
    const result = await capability.execute(tree(named('Print')), USER);
    expect(print).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['wp', 'print', 'dp']);
    expect(diagnostics.some((d) => d.code === 'reentrant-print')).toBe(true);
    expect(result.nodes[0]?.status).toBe('executed');
  });

  it('D3: an adapter throw skips DP (the latch still resets)', async () => {
    const { capability, log } = docHarness({
      trees: { willPrint: tree(js('wp')), didPrint: tree(js('dp')) },
    });
    capability.setUiAdapter({
      openUri: vi.fn(),
      print: () => {
        throw new Error('dialog exploded');
      },
    });
    await expect(capability.execute(tree(named('Print')), USER)).rejects.toThrow(
      'dialog exploded',
    );
    expect(log).toEqual(['wp']);
    // The latch reset in finally: a later print works again.
    capability.setUiAdapter({ openUri: vi.fn(), print: () => log.push('print-2') });
    await capability.execute(tree(named('Print')), USER);
    expect(log).toEqual(['wp', 'wp', 'print-2', 'dp']);
  });

  it('D2: a before-event failure never cancels the operation', async () => {
    const { capability, log } = docHarness({ trees: { willSave: tree(js('ws')) } });
    capability.registerExecutor('javascript', () => ({ status: 'failed', error: 'ws broke' }));
    const value = await capability.runDocumentVerb('save', () => {
      log.push('op');
      return 42;
    });
    expect(value).toBe(42);
    expect(log).toEqual(['op']);
  });

  it('D2: an operation throw skips the after-event and rethrows', async () => {
    const { capability, log } = docHarness({
      trees: { willSave: tree(js('ws')), didSave: tree(js('ds')) },
    });
    await expect(
      capability.runDocumentVerb('save', () => {
        log.push('op');
        throw new Error('save failed');
      }),
    ).rejects.toThrow('save failed');
    expect(log).toEqual(['ws', 'op']);
  });

  it('honors triggers.document: false — trees skipped, operation still runs', async () => {
    const { capability, log } = docHarness({
      config: { triggers: { document: false } },
      trees: { willSave: tree(js('ws')), didSave: tree(js('ds')) },
    });
    const value = await capability.runDocumentVerb('save', () => {
      log.push('op');
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(log).toEqual(['op']);
    const dispatched = await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(dispatched.status).toBe('inert');
    expect(dispatched.diagnostics.some((d) => d.code === 'trigger-disabled')).toBe(true);
  });

  it('prepareClose runs the WC tree through the same door', async () => {
    const { capability, log } = docHarness({ trees: { willClose: tree(js('wc')) } });
    const result = await capability.prepareClose();
    expect(result.status).toBe('executed');
    expect(log).toEqual(['wc']);
  });

  it('D11: a rejected catalog read is evicted — the next event retries', async () => {
    const { capability, log, diagnostics, readCallCount } = docHarness({
      readFailsFirst: true,
      trees: { willSave: tree(js('ws')) },
    });
    const first = await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(first.status).toBe('inert');
    expect(diagnostics.some((d) => d.code === 'trigger-failed')).toBe(true);
    const second = await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(second.status).toBe('executed');
    expect(log).toEqual(['ws']);
    expect(readCallCount()).toBe(2);
  });
});

describe('the submit sink chain', () => {
  it('no resolver and no sink are DISTINCT diagnostics', async () => {
    const noResolver = docHarness({});
    const result = await noResolver.capability.execute(tree(submitNode(submitPayload())), USER);
    expect(result.nodes[0]?.status).toBe('blocked');
    expect(noResolver.diagnostics.some((d) => d.code === 'no-submit-resolver')).toBe(true);

    const noSink = docHarness({});
    noSink.capability.registerSubmitResolver(async (intent, actionCtx) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [{ name: 'plain', value: 'visible' }],
      origin: actionCtx.origin,
      event: actionCtx.event,
    }));
    const blocked = await noSink.capability.execute(tree(submitNode(submitPayload())), USER);
    expect(blocked.nodes[0]?.status).toBe('blocked');
    expect(noSink.diagnostics.some((d) => d.code === 'no-submit-sink')).toBe(true);
  });

  it('the document home is sink 2: awaited, real result, real request shape', async () => {
    const formsSubmit = vi.fn(async () => ({ submissionId: 's-1', receivedAt: 'now' }));
    const { capability } = docHarness({ formsSubmit });
    capability.registerSubmitResolver(async (intent, actionCtx) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [{ name: 'plain', value: 'visible' }],
      origin: actionCtx.origin,
      event: actionCtx.event,
    }));
    const result = await capability.execute(tree(submitNode(submitPayload())), USER);
    expect(result.nodes[0]?.status).toBe('executed');
    expect(formsSubmit).toHaveBeenCalledTimes(1);
    expect(formsSubmit.mock.calls[0]?.[0]).toMatchObject({
      entries: [{ name: 'plain', value: 'visible' }],
      intent: { url: 'https://home.test/submit', format: 'fdf', method: 'post', flagsRaw: 0 },
      origin: 'user',
    });
  });

  it('an installed handler BEATS the home (explicit beats ambient) and can delegate', async () => {
    const formsSubmit = vi.fn(async () => ({ submissionId: 's-2', receivedAt: 'now' }));
    const { capability } = docHarness({ formsSubmit });
    capability.registerSubmitResolver(async (intent, actionCtx) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [],
      origin: actionCtx.origin,
      event: actionCtx.event,
    }));
    let delegate: (() => Promise<unknown>) | null = null;
    const handler = vi.fn((_request, handlerCtx) => {
      delegate = handlerCtx.submitToDocumentHome;
    });
    capability.setSubmitHandler(handler);
    const result = await capability.execute(tree(submitNode(submitPayload())), USER);
    expect(result.nodes[0]?.status).toBe('executed');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(formsSubmit).not.toHaveBeenCalled(); // the home never auto-fires
    expect(delegate).not.toBeNull(); // ...but the handler CAN compose
    await delegate!();
    expect(formsSubmit).toHaveBeenCalledTimes(1);
  });

  it('handler contract: sync throw fails the node; detached rejection is diagnostic-only', async () => {
    const thrower = docHarness({});
    thrower.capability.registerSubmitResolver(async (intent, actionCtx) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [],
      origin: actionCtx.origin,
      event: actionCtx.event,
    }));
    thrower.capability.setSubmitHandler(() => {
      throw new Error('sync refuse');
    });
    const failed = await thrower.capability.execute(tree(submitNode(submitPayload())), USER);
    expect(failed.nodes[0]?.status).toBe('failed');

    const detached = docHarness({});
    detached.capability.registerSubmitResolver(async (intent, actionCtx) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [],
      origin: actionCtx.origin,
      event: actionCtx.event,
    }));
    detached.capability.setSubmitHandler(() => Promise.reject(new Error('late network error')));
    const result = await detached.capability.execute(tree(submitNode(submitPayload())), USER);
    // Executed = handed to the embedder — a later rejection can never
    // retroactively rewrite the node.
    expect(result.nodes[0]?.status).toBe('executed');
    await tick();
    expect(
      detached.diagnostics.some(
        (d) => d.code === 'executor-failed' && d.message.includes('detached'),
      ),
    ).toBe(true);
  });
});
