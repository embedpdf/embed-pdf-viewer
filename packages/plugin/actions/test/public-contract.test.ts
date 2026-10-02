import { describe, expect, it, vi } from 'vitest';

import {
  toPageRef,
  type AnnotationRef,
  type DocumentHandle,
  type PdfActionNode,
  type PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import { createActionsController } from '../src/controller';
import type { ActionExecutor, ActionsConfig } from '../src/host-contract';
import { createActionsTestContext } from './helpers/context';

/**
 * The public reads and verbs beyond dispatch: `executeNamed` and
 * `canExecuteNamed`, `getActionTree`, the settings, `isScriptingEnabled`,
 * cancelling, `onExecuted`, `onDiagnosticReported` and
 * `onOpenSequenceCompleted`, against a test document.
 */
const tree = (root: PdfActionNode): PdfActionTree => ({
  root,
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});
const named = (name: string): PdfActionNode => ({
  type: 'named',
  subtype: 'Named',
  name,
  next: [],
});
const uri = (value: string): PdfActionNode => ({
  type: 'uri',
  subtype: 'URI',
  uri: value,
  isMap: false,
  next: [],
});

const PAGE = toPageRef(3);
const ANNOT: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 41 };
const activate = tree(named('NextPage'));
const enter = tree(named('FirstPage'));
const validate = tree(uri('https://validate.test/'));
const pageOpen = tree(named('LastPage'));
const openAction = tree(named('PrevPage'));
const willSave = tree(uri('https://save.test/'));

function harness(
  config?: ActionsConfig,
  session: { allows?: (permission: string) => boolean } = {},
) {
  const ctx = createActionsTestContext(
    {
      id: 'actions',
      pages: [{ ref: PAGE }],
      doc: {
        page: () => ({
          annotations: {
            list: async () => ({
              annotations: [{ ref: ANNOT, actions: { activate, cursorEnter: enter } }],
            }),
          },
        }),
        forms: {
          list: async () => ({
            fields: [
              {
                name: 'amount',
                ref: { kind: 'objectNumber', objectNumber: 7 },
                actions: { validate },
              },
            ],
          }),
        },
        actions: { get: async () => ({ nameTreeScripts: [], openAction, willSave }) },
        security: { allows: session.allows ?? (() => true), allowsAnnotation: () => true },
      } as unknown as Partial<DocumentHandle>,
    },
    config,
  );
  // The page's own /AA tree, as the kernel's page registry carries it.
  Object.assign(ctx.document()!.pages[0], { actions: { open: pageOpen } });
  return { ctx, capability: ctx.connect(createActionsController(ctx, config)) };
}

describe('actions public contract', () => {
  it('executeNamed runs a Named verb as a user-origin api action and reports through onExecuted', async () => {
    const { capability } = harness({ openSequence: 'off' });
    const executor = vi.fn<ActionExecutor>(async () => ({ status: 'executed' }));
    capability.registerExecutor('named', executor);
    const seen: unknown[] = [];
    capability.onExecuted((event) => seen.push(event));
    const result = await capability.executeNamed('NextPage');
    expect(result.status).toBe('executed');
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'named', name: 'NextPage' }),
      expect.objectContaining({ origin: 'user', source: { kind: 'api' } }),
    );
    // The event carries what its table lists: the tree, the result and what started it.
    expect(seen).toEqual([
      {
        tree: expect.objectContaining({ root: expect.objectContaining({ name: 'NextPage' }) }),
        result,
        source: { kind: 'api' },
      },
    ]);
  });

  it('canExecuteNamed answers what executeNamed would run; Print also needs doc.print', () => {
    const { capability } = harness({ openSequence: 'off' });
    expect(capability.canExecuteNamed('NextPage')).toBe(true);
    expect(capability.canExecuteNamed('Print')).toBe(true);
    // Hover origin: the Print row blocks it.
    expect(capability.canExecuteNamed('Print', { origin: 'hover' })).toBe(false);
    capability.updateSettings({ policy: { named: { user: 'block' } } });
    expect(capability.canExecuteNamed('NextPage')).toBe(false);

    const noPrint = harness(
      { openSequence: 'off' },
      { allows: (permission) => permission !== 'doc.print' },
    );
    expect(noPrint.capability.canExecuteNamed('Print')).toBe(false);
    expect(noPrint.capability.canExecuteNamed('NextPage')).toBe(true);
  });

  it("a 'report' rule reports the action it stops; a 'block' rule stops it quietly", async () => {
    const { capability } = harness({
      openSequence: 'off',
      policy: { uri: { hover: 'report', lifecycle: 'block' } },
    });
    const reported: string[] = [];
    capability.onDiagnosticReported(({ code }) => reported.push(code));
    const run = (origin: 'hover' | 'lifecycle') =>
      capability.execute(tree(uri('https://a.test/')), {
        origin,
        source: { kind: 'api' },
        event: { scope: 'activate' },
      });
    const quiet = await run('lifecycle');
    expect(quiet.nodes[0]?.status).toBe('blocked');
    expect(quiet.diagnostics).toEqual([]);
    expect(reported).toEqual([]);
    const loud = await run('hover');
    expect(loud.nodes[0]?.status).toBe('blocked');
    expect(reported).toEqual(['blocked']);
  });

  it('reports a blocked action with its type and what started it', async () => {
    const { capability } = harness({ openSequence: 'off' });
    const reported: unknown[] = [];
    capability.onDiagnosticReported((event) => reported.push(event));
    const context = {
      origin: 'hover' as const,
      source: { kind: 'api' as const },
      event: { scope: 'activate' as const },
    };
    await capability.execute(tree(uri('https://a.test/')), context);
    expect(reported).toEqual([
      expect.objectContaining({ code: 'blocked', action: 'uri', source: { kind: 'api' } }),
    ]);
  });

  it('getActionTree reads annotation, field, page and document trees raw from the document', async () => {
    const { capability } = harness({ openSequence: 'off' });
    // An annotation's tree comes back in page space: a copy, the same when it holds no goto.
    await expect(
      capability.getActionTree({ kind: 'annotation', annotation: ANNOT, page: PAGE }),
    ).resolves.toEqual(activate);
    await expect(
      capability.getActionTree({
        kind: 'annotation',
        annotation: ANNOT,
        page: PAGE,
        event: 'cursorEnter',
      }),
    ).resolves.toEqual(enter);
    await expect(
      capability.getActionTree({
        kind: 'annotation',
        annotation: { kind: 'objectNumber', page: PAGE, objectNumber: 99 },
        page: PAGE,
      }),
    ).resolves.toBeNull();
    await expect(
      capability.getActionTree({
        kind: 'field',
        field: { kind: 'objectNumber', objectNumber: 7 },
        event: 'validate',
      }),
    ).resolves.toBe(validate);
    await expect(
      capability.getActionTree({
        kind: 'field',
        field: { kind: 'fqn', name: 'amount' },
        event: 'format',
      }),
    ).resolves.toBeNull();
    await expect(capability.getActionTree({ kind: 'page', page: PAGE })).resolves.toBe(pageOpen);
    await expect(
      capability.getActionTree({ kind: 'page', page: PAGE, event: 'close' }),
    ).resolves.toBeNull();
    await expect(capability.getActionTree({ kind: 'document' })).resolves.toBe(openAction);
    await expect(capability.getActionTree({ kind: 'document', event: 'will-save' })).resolves.toBe(
      willSave,
    );
    await expect(
      capability.getActionTree({ kind: 'document', event: 'did-save' }),
    ).resolves.toBeNull();
  });

  it('the policy setting merges row-wise over the defaults, and a change applies to the next action', () => {
    const { capability } = harness({
      openSequence: 'off',
      policy: { uri: { hover: 'allow' } },
    });
    const before = capability.getSettings();
    expect(before).toBe(capability.getSettings());
    expect(before.policy.uri).toEqual({ user: 'adapter', hover: 'allow', lifecycle: 'report' });
    const context = {
      origin: 'user' as const,
      source: { kind: 'api' as const },
      event: { scope: 'activate' as const },
    };
    expect(capability.canExecute(tree(uri('https://a.test/')), context)).toBe(true);

    const changes: unknown[] = [];
    capability.onSettingsChanged((event) => changes.push(event.changed));
    capability.updateSettings({ policy: { uri: { user: 'block' } } });
    const after = capability.getSettings();
    expect(after).not.toBe(before);
    expect(after.policy.uri).toEqual({ user: 'block', hover: 'allow', lifecycle: 'report' });
    expect(after.policy.named).toBe(before.policy.named); // untouched rows keep identity
    expect(capability.canExecute(tree(uri('https://a.test/')), context)).toBe(false);
    expect(changes).toEqual([['policy']]);

    // Reset goes back to what was registered, not to the defaults.
    capability.resetSettings();
    expect(capability.getSettings().policy.uri).toEqual({
      user: 'adapter',
      hover: 'allow',
      lifecycle: 'report',
    });
  });

  it('the triggers setting turns a trigger family off and on while the app runs', async () => {
    const { capability } = harness({ openSequence: 'off' });
    const pageTrigger = { scope: 'page' as const, event: 'open' as const, page: PAGE };
    expect(capability.canDispatch(pageTrigger)).toBe(true);
    capability.updateSettings({ triggers: { page: false } });
    expect(capability.canDispatch(pageTrigger)).toBe(false);
    const result = await capability.dispatch(pageTrigger);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['trigger-disabled']);
  });

  it('the script environment is no setting: the settings hold enabled and identity only', () => {
    const { capability } = harness({
      openSequence: 'off',
      javascript: { enabled: false, identity: { name: 'Dana' }, now: () => 0 },
    });
    expect(capability.getSettings().javascript).toEqual({
      enabled: false,
      identity: { name: 'Dana' },
    });
  });

  it('isScriptingEnabled reflects the javascript switch', () => {
    expect(harness({ openSequence: 'off' }).capability.isScriptingEnabled()).toBe(false);
  });

  describe('cancelling', () => {
    const context = {
      origin: 'user' as const,
      source: { kind: 'api' as const },
      event: { scope: 'activate' as const },
    };
    const aborted = () => {
      const controller = new AbortController();
      controller.abort();
      return controller.signal;
    };

    it('execute and executeNamed reject operation-cancelled for a signal that fired before they ran', async () => {
      const { capability } = harness({ openSequence: 'off' });
      const executor = vi.fn<ActionExecutor>(async () => ({ status: 'executed' }));
      capability.registerExecutor('named', executor);
      const signal = aborted();
      await expect(
        capability.execute(tree(named('NextPage')), context, { signal }),
      ).rejects.toMatchObject({ code: 'operation-cancelled' });
      await expect(
        capability.executeNamed('NextPage', undefined, { signal }),
      ).rejects.toMatchObject({ code: 'operation-cancelled' });
      expect(executor).not.toHaveBeenCalled();
    });

    it('a signal that fires while a tree runs stops it before its next node', async () => {
      const { capability } = harness({ openSequence: 'off' });
      const controller = new AbortController();
      const ran: string[] = [];
      capability.registerExecutor('reset-form', () => {
        ran.push('reset-form');
        controller.abort();
        return { status: 'executed' };
      });
      const results: string[] = [];
      capability.onExecuted((event) => results.push(event.result.status));
      const chain: PdfActionNode = {
        type: 'reset-form',
        subtype: 'ResetForm',
        fields: null,
        exclude: false,
        next: [named('NextPage')],
      };
      const nextPage = vi.fn<ActionExecutor>(async () => ({ status: 'executed' }));
      capability.registerExecutor('named', nextPage);
      await expect(
        capability.execute(tree(chain), context, { signal: controller.signal }),
      ).rejects.toMatchObject({ code: 'operation-cancelled' });
      expect(ran).toEqual(['reset-form']);
      expect(nextPage).not.toHaveBeenCalled();
      expect(results).toEqual(['cancelled']);
    });

    it('dispatch and prepareClose never reject: a cancelled trigger resolves cancelled', async () => {
      const { capability } = harness({ openSequence: 'off' });
      const signal = aborted();
      await expect(
        capability.dispatch({ scope: 'activate', ref: ANNOT, page: PAGE }, { signal }),
      ).resolves.toEqual({ status: 'cancelled', steps: [], diagnostics: [] });
      await expect(capability.prepareClose({ signal })).resolves.toMatchObject({
        status: 'cancelled',
      });
    });

    it('getActionTree rejects operation-cancelled', async () => {
      const { capability } = harness({ openSequence: 'off' });
      await expect(
        capability.getActionTree({ kind: 'document' }, { signal: aborted() }),
      ).rejects.toMatchObject({ code: 'operation-cancelled' });
    });

    it('runDocumentVerb skips an operation the caller cancelled before it started', async () => {
      const { capability } = harness({ openSequence: 'off' });
      const operation = vi.fn(async () => 'bytes');
      await expect(
        capability.runDocumentVerb('save', operation, { signal: aborted() }),
      ).rejects.toMatchObject({ code: 'operation-cancelled' });
      expect(operation).not.toHaveBeenCalled();
      await expect(capability.runDocumentVerb('save', operation)).resolves.toBe('bytes');
    });
  });

  it('onOpenSequenceCompleted fires once with the open result when the sequence runs', async () => {
    const { capability } = harness();
    const executor = vi.fn<ActionExecutor>(async () => ({ status: 'executed' }));
    capability.registerExecutor('named', executor);
    const completed: string[] = [];
    capability.onOpenSequenceCompleted(({ result }) => completed.push(result.status));
    capability.setUiAdapter({} as never);
    await capability.executeNamed('NextPage'); // queued behind the open sequence
    expect(completed).toEqual(['executed']);
    expect(executor.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ name: 'PrevPage' }));
  });
});
