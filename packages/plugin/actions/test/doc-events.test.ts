import { describe, expect, it, vi } from 'vitest';

import { createTestContext } from '@embedpdf/core/testing';
import type {
  DocumentActionsSnapshot,
  DocumentHandle,
  PdfActionNode,
  PdfActionTree,
  SubmitFormPayload,
} from '@embedpdf/engine-core/runtime';

import { createActionsController } from '../src/controller';
import type { ActionContext, ActionDiagnostic, ActionsConfig } from '../src/host-contract';

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
const script = (source: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script: source,
  next,
});
const named = (name: string): PdfActionNode => ({
  type: 'named',
  subtype: 'Named',
  name,
  next: [],
});

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
 * A test document whose catalog carries the five ISO 32000-2 Table 200 trees
 * (each a one-script JavaScript tree logging its own name), an optional
 * OpenAction (to probe the open ordering), an optional failing first read
 * (to probe the eviction of a failed catalog read), and an optional
 * `forms.submit` home.
 */
function docHarness(options: {
  config?: ActionsConfig;
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
  const ctx = createTestContext<void>({
    id: 'actions',
    doc: {
      actions: {
        get: () => {
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
    } as unknown as Partial<DocumentHandle>,
  });
  const capability = ctx.connect(
    createActionsController(ctx, { openSequence: 'off', ...options.config }),
  );
  const log: string[] = [];
  capability.registerExecutor('javascript', (node) => {
    if (node.type === 'javascript') log.push(node.script);
    return { status: 'executed' };
  });
  const diagnostics: ActionDiagnostic[] = [];
  capability.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));
  return { capability, log, diagnostics, readCallCount: () => readCalls };
}

describe('document lifecycle events (/WC, /WS, /DS, /WP, /DP)', () => {
  it('resolves each of the five catalog trees through dispatch', async () => {
    const { capability, log } = docHarness({
      trees: {
        willSave: tree(script('ws')),
        didSave: tree(script('ds')),
        willPrint: tree(script('wp')),
        didPrint: tree(script('dp')),
        willClose: tree(script('wc')),
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

  it('a first will-save under openSequence auto runs the OpenAction first', async () => {
    const { capability, log } = docHarness({
      config: { openSequence: 'auto' },
      openAction: tree(script('open')),
      trees: { willSave: tree(script('ws')) },
    });
    // No adapter, no user activity — the open latch is still armed.
    await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(log).toEqual(['open', 'ws']);
    // And the sequence counts as fired: a document-open trigger replays inert.
    const replay = await capability.dispatch({ scope: 'document', event: 'open' });
    expect(replay.status).toBe('inert');
    expect(
      replay.diagnostics.some((diagnostic) => diagnostic.code === 'open-sequence-replayed'),
    ).toBe(true);
  });

  it('two concurrent runDocumentVerb(save) calls fully serialize', async () => {
    const { capability, log } = docHarness({
      trees: { willSave: tree(script('ws')), didSave: tree(script('ds')) },
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

  it('the Print verb runs /WP → adapter (exactly once) → /DP; a nested Print is suppressed', async () => {
    const { capability, log, diagnostics } = docHarness({
      // The /WP tree itself chains into a nested Named Print: the reentrancy
      // probe. Policy admits lifecycle prints here so the probe reaches the
      // latch (the default lifecycle row would block it a layer earlier,
      // which is also fine, but this test pins the latch itself).
      config: { policy: { print: { user: 'adapter', hover: 'block', lifecycle: 'adapter' } } },
      trees: {
        willPrint: tree(script('wp', [named('Print')])),
        didPrint: tree(script('dp')),
      },
    });
    const print = vi.fn(() => log.push('print'));
    capability.setUiAdapter({ openUri: vi.fn(), print });
    const result = await capability.execute(tree(named('Print')), USER);
    expect(print).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['wp', 'print', 'dp']);
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'reentrant-print')).toBe(true);
    expect(result.nodes[0]?.status).toBe('executed');
  });

  it('an adapter throw skips /DP (the latch still resets)', async () => {
    const { capability, log } = docHarness({
      trees: { willPrint: tree(script('wp')), didPrint: tree(script('dp')) },
    });
    capability.setUiAdapter({
      openUri: vi.fn(),
      print: () => {
        throw new Error('dialog exploded');
      },
    });
    await expect(capability.execute(tree(named('Print')), USER)).rejects.toThrow('dialog exploded');
    expect(log).toEqual(['wp']);
    // The latch reset in finally: a later print works again.
    capability.setUiAdapter({ openUri: vi.fn(), print: () => log.push('print-2') });
    await capability.execute(tree(named('Print')), USER);
    expect(log).toEqual(['wp', 'wp', 'print-2', 'dp']);
  });

  it('a before-event failure never cancels the operation', async () => {
    const { capability, log } = docHarness({ trees: { willSave: tree(script('ws')) } });
    capability.registerExecutor('javascript', () => ({ status: 'failed', error: 'ws broke' }));
    const value = await capability.runDocumentVerb('save', () => {
      log.push('op');
      return 42;
    });
    expect(value).toBe(42);
    expect(log).toEqual(['op']);
  });

  it('an operation throw skips the after-event and rethrows', async () => {
    const { capability, log } = docHarness({
      trees: { willSave: tree(script('ws')), didSave: tree(script('ds')) },
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
      trees: { willSave: tree(script('ws')), didSave: tree(script('ds')) },
    });
    const value = await capability.runDocumentVerb('save', () => {
      log.push('op');
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(log).toEqual(['op']);
    const dispatched = await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(dispatched.status).toBe('inert');
    expect(
      dispatched.diagnostics.some((diagnostic) => diagnostic.code === 'trigger-disabled'),
    ).toBe(true);
  });

  it('prepareClose runs the /WC tree through the same door', async () => {
    const { capability, log } = docHarness({ trees: { willClose: tree(script('wc')) } });
    const result = await capability.prepareClose();
    expect(result.status).toBe('executed');
    expect(log).toEqual(['wc']);
  });

  it('a rejected catalog read is evicted: the next event retries', async () => {
    const { capability, log, diagnostics, readCallCount } = docHarness({
      readFailsFirst: true,
      trees: { willSave: tree(script('ws')) },
    });
    const first = await capability.dispatch({ scope: 'document', event: 'will-save' });
    expect(first.status).toBe('inert');
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'trigger-failed')).toBe(true);
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
    expect(
      noResolver.diagnostics.some((diagnostic) => diagnostic.code === 'no-submit-resolver'),
    ).toBe(true);

    const noSink = docHarness({});
    noSink.capability.registerSubmitResolver(async (intent, actionContext) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [{ name: 'plain', value: 'visible' }],
      origin: actionContext.origin,
      event: actionContext.event,
    }));
    const blocked = await noSink.capability.execute(tree(submitNode(submitPayload())), USER);
    expect(blocked.nodes[0]?.status).toBe('blocked');
    expect(noSink.diagnostics.some((diagnostic) => diagnostic.code === 'no-submit-sink')).toBe(
      true,
    );
  });

  it('the document home is sink 2: awaited, real result, real request shape', async () => {
    const formsSubmit = vi.fn(async (_request: unknown) => ({
      submissionId: 's-1',
      receivedAt: 'now',
    }));
    const { capability } = docHarness({ formsSubmit });
    capability.registerSubmitResolver(async (intent, actionContext) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [{ name: 'plain', value: 'visible' }],
      origin: actionContext.origin,
      event: actionContext.event,
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
    capability.registerSubmitResolver(async (intent, actionContext) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [],
      origin: actionContext.origin,
      event: actionContext.event,
    }));
    let delegate: (() => Promise<unknown>) | null = null;
    const handler = vi.fn((_request, chain) => {
      delegate = chain.submitToDocumentHome;
    });
    capability.setSubmitHandler(handler);
    const result = await capability.execute(tree(submitNode(submitPayload())), USER);
    expect(result.nodes[0]?.status).toBe('executed');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(formsSubmit).not.toHaveBeenCalled(); // the home never auto-fires
    expect(delegate).not.toBeNull(); // ...but the handler can compose
    await delegate!();
    expect(formsSubmit).toHaveBeenCalledTimes(1);
  });

  it('handler contract: sync throw fails the node; detached rejection is diagnostic-only', async () => {
    const thrower = docHarness({});
    thrower.capability.registerSubmitResolver(async (intent, actionContext) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [],
      origin: actionContext.origin,
      event: actionContext.event,
    }));
    thrower.capability.setSubmitHandler(() => {
      throw new Error('sync refuse');
    });
    const failed = await thrower.capability.execute(tree(submitNode(submitPayload())), USER);
    expect(failed.nodes[0]?.status).toBe('failed');

    const detached = docHarness({});
    detached.capability.registerSubmitResolver(async (intent, actionContext) => ({
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      entries: [],
      origin: actionContext.origin,
      event: actionContext.event,
    }));
    detached.capability.setSubmitHandler(() => Promise.reject(new Error('late network error')));
    const result = await detached.capability.execute(tree(submitNode(submitPayload())), USER);
    // Executed = handed to the embedder — a later rejection can never
    // retroactively rewrite the node.
    expect(result.nodes[0]?.status).toBe('executed');
    await tick();
    expect(
      detached.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'executor-failed' && diagnostic.message.includes('detached'),
      ),
    ).toBe(true);
  });
});
