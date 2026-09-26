import { describe, expect, it, vi } from 'vitest';

import { createTestContext } from '@embedpdf/core/testing';
import {
  toPageRef,
  type AnnotationRef,
  type DocumentHandle,
  type PdfActionNode,
  type PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import { createActionsController } from '../src/controller';
import type { ActionExecutor, ActionsConfig } from '../src/host-contract';

/**
 * The public reads and verbs beyond dispatch: `executeNamed`,
 * `getActionTree`, `getPolicy` / `updatePolicy`, `isScriptingEnabled`,
 * `onExecuted` and `onOpenSequenceCompleted`, against a test document.
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
const ANNOT: AnnotationRef = { kind: 'objectNumber', page: PAGE, annotObjectNumber: 41 };
const activate = tree(named('NextPage'));
const enter = tree(named('FirstPage'));
const validate = tree(uri('https://validate.test/'));
const pageOpen = tree(named('LastPage'));
const openAction = tree(named('PrevPage'));
const willSave = tree(uri('https://save.test/'));

function harness(config?: ActionsConfig) {
  const ctx = createTestContext<void>({
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
              ref: { kind: 'objectNumber', fieldObjectNumber: 7 },
              actions: { validate },
            },
          ],
        }),
      },
      actions: { get: async () => ({ nameTreeScripts: [], openAction, willSave }) },
    } as unknown as Partial<DocumentHandle>,
  });
  // The page's own /AA tree, as the kernel's page registry carries it.
  Object.assign(ctx.document()!.pages[0], { actions: { open: pageOpen } });
  return { ctx, capability: ctx.connect(createActionsController(ctx, config)) };
}

describe('actions public contract', () => {
  it('executeNamed runs a Named verb as a user-origin api action and reports through onExecuted', async () => {
    const { capability } = harness({ openSequence: 'off' });
    const executor = vi.fn<ActionExecutor>(async () => ({ status: 'executed' }));
    capability.registerExecutor('named', executor);
    const seen: string[] = [];
    capability.onExecuted((event) =>
      seen.push(`${event.ctx.origin}:${event.ctx.source.kind}:${event.tree.root?.type}`),
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
        annotation: { kind: 'objectNumber', page: PAGE, annotObjectNumber: 99 },
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
    const { ctx, capability } = harness({
      openSequence: 'off',
      policy: { uri: { hover: 'allow' } },
    });
    const woken = vi.fn();
    ctx.subscribe(woken);
    const before = capability.getPolicy();
    expect(before).toBe(capability.getPolicy());
    expect(before.uri).toEqual({ user: 'adapter', hover: 'allow', lifecycle: 'report' });
    const context = {
      origin: 'user' as const,
      source: { kind: 'api' as const },
      event: { scope: 'activate' as const },
    };
    expect(capability.canExecute(tree(uri('https://a.test/')), context)).toBe(true);
    expect(woken).not.toHaveBeenCalled();

    capability.updatePolicy({ uri: { user: 'block' } });
    const after = capability.getPolicy();
    expect(after).not.toBe(before);
    expect(after.uri).toEqual({ user: 'block', hover: 'allow', lifecycle: 'report' });
    expect(after.named).toBe(before.named); // untouched rows keep identity
    expect(capability.canExecute(tree(uri('https://a.test/')), context)).toBe(false);
    expect(woken).toHaveBeenCalled(); // readers of getPolicy() re-read
  });

  it('isScriptingEnabled reflects the javascript switch', () => {
    expect(harness({ openSequence: 'off' }).capability.isScriptingEnabled()).toBe(false);
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
