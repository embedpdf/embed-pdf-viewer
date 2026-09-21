import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@embedpdf/core';
import { toPageRef, type PdfActionNode, type PdfActionTree } from '@embedpdf/engine-core/runtime';

import { createActionsCapability } from '../src/capability';
import type { ActionsAction, ActionsConfig, ActionsState } from '../src/types';

/**
 * The public-contract additions of the 3.0 migration: `executeNamed`,
 * `getActionTree`, `getPolicy` / `updatePolicy`, `isScriptingEnabled`,
 * `onExecuted`, `onOpenSequenceCompleted`. Fake-ctx like the dispatcher
 * suite — the capability only reads `doc` and dispatches.
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
const ANNOT = { kind: 'objectNumber' as const, annotObjectNumber: 41 };
const activate = tree(named('NextPage'));
const enter = tree(named('FirstPage'));
const validate = tree(uri('https://validate.test/'));
const pageOpen = tree(named('LastPage'));
const openAction = tree(named('PrevPage'));
const willSave = tree(uri('https://save.test/'));

function harness(config?: ActionsConfig) {
  const dispatch = vi.fn();
  const ctx = {
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
              ref: { kind: 'objectNumber', fieldObjectNumber: 7 },
              actions: { validate },
            },
          ],
        }),
      },
      actions: { read: async () => ({ nameTreeScripts: [], openAction, willSave }) },
    },
    document: () => ({ pages: [{ ref: PAGE, actions: { open: pageOpen } }] }),
    documentId: 'doc-1',
    dispatch,
    tryGet: () => null,
    cleanup: () => {},
  } as unknown as PluginContext<ActionsState, ActionsAction>;
  return { capability: createActionsCapability(ctx, config), dispatch };
}

describe('actions public contract', () => {
  it('executeNamed runs a Named verb as a user-origin api action and reports through onExecuted', async () => {
    const { capability } = harness({ openSequence: 'off' });
    const executor = vi.fn(async () => ({ status: 'executed' as const }));
    capability.registerExecutor('named', executor);
    const seen: string[] = [];
    capability.onExecuted(({ ctx, tree }) =>
      seen.push(`${ctx.origin}:${ctx.source.kind}:${tree.root?.type}`),
    );
    const result = await capability.executeNamed('NextPage');
    expect(result.status).toBe('executed');
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'named', name: 'NextPage' }),
      expect.objectContaining({ origin: 'user', source: { kind: 'api' } }),
    );
    expect(seen).toEqual(['user:api:named']);
  });

  it('getActionTree reads annotation, field, page and document trees raw from the document', async () => {
    const { capability } = harness({ openSequence: 'off' });
    await expect(
      capability.getActionTree({ kind: 'annotation', annotation: ANNOT, page: PAGE }),
    ).resolves.toBe(activate);
    await expect(
      capability.getActionTree({
        kind: 'annotation',
        annotation: ANNOT,
        page: PAGE,
        event: 'cursorEnter',
      }),
    ).resolves.toBe(enter);
    await expect(
      capability.getActionTree({
        kind: 'annotation',
        annotation: { kind: 'objectNumber', annotObjectNumber: 99 },
        page: PAGE,
      }),
    ).resolves.toBeNull();
    await expect(
      capability.getActionTree({
        kind: 'field',
        field: { kind: 'objectNumber', fieldObjectNumber: 7 },
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

  it('getPolicy is reference-stable and updatePolicy merges row-wise into later decisions', () => {
    const { capability, dispatch } = harness({
      openSequence: 'off',
      policy: { uri: { hover: 'allow' } },
    });
    const before = capability.getPolicy();
    expect(before).toBe(capability.getPolicy());
    expect(before.uri).toEqual({ user: 'adapter', hover: 'allow', lifecycle: 'report' });
    const context = {
      origin: 'user' as const,
      source: { kind: 'api' as const },
      event: { scope: 'activate' as const },
    };
    expect(capability.canExecute(tree(uri('https://a.test/')), context)).toBe(true);

    capability.updatePolicy({ uri: { user: 'block' } });
    const after = capability.getPolicy();
    expect(after).not.toBe(before);
    expect(after.uri).toEqual({ user: 'block', hover: 'allow', lifecycle: 'report' });
    expect(after.named).toBe(before.named); // untouched rows keep identity
    expect(capability.canExecute(tree(uri('https://a.test/')), context)).toBe(false);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ACTIONS_POLICY_CHANGED' });
  });

  it('isScriptingEnabled reflects the javascript switch', () => {
    expect(harness({ openSequence: 'off' }).capability.isScriptingEnabled()).toBe(false);
  });

  it('onOpenSequenceCompleted fires once with the open result when the sequence runs', async () => {
    const { capability } = harness();
    const executor = vi.fn(async () => ({ status: 'executed' as const }));
    capability.registerExecutor('named', executor);
    const completed: string[] = [];
    capability.onOpenSequenceCompleted(({ result }) => completed.push(result.status));
    capability.setUiAdapter({} as never);
    await capability.executeNamed('NextPage'); // queued behind the open sequence
    expect(completed).toEqual(['executed']);
    expect(executor.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ name: 'PrevPage' }));
  });
});
