import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@embedpdf/core';
import type {
  AnnotationRef,
  PdfActionNode,
  PdfActionTree,
  PdfAnnotationActions,
  PdfPageActions,
} from '@embedpdf/engine-core/runtime';

import { createActionsCapability } from '../src/capability';
import { originOf } from '../src/types';
import type {
  ActionDiagnostic,
  ActionDispatchEvent,
  ActionsAction,
  ActionsPluginConfig,
  ActionsState,
  ActionTrigger,
} from '../src/types';

const tree = (root: PdfActionNode | null, incomplete = false): PdfActionTree => ({
  root,
  incomplete,
  warningFlags: 0,
  warnings: [],
});
const named = (name: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'named',
  subtype: 'Named',
  name,
  next,
});
const js = (script: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script,
  next,
});
const goto = (pon: number, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'goto',
  subtype: 'GoTo',
  destination: { kind: 'fit', pageObjectNumber: pon },
  next,
});

const ref = (pon: number, objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  pageObjectNumber: pon,
  annotObjectNumber: objectNumber,
});

interface FakeAnnot {
  objectNumber: number;
  actions?: Partial<PdfAnnotationActions>;
}
interface FakePage {
  pon: number;
  actions?: PdfPageActions;
  annotations?: FakeAnnot[];
}

/** A trigger-grade harness: controllable read timing, injectable document
 *  events, recording seams. */
function harness(opts?: {
  config?: ActionsPluginConfig;
  pages?: FakePage[];
  docActions?: {
    openAction?: PdfActionTree | null;
    openDestination?: { kind: 'fit'; pageObjectNumber: number } | null;
  };
  /** Awaited inside each annotations.list — reversed-resolution tests. */
  listDelay?: (pon: number) => Promise<void>;
}) {
  const pages = opts?.pages ?? [];
  const listCalls: number[] = [];
  let docListener: ((event: { type: string }) => void) | null = null;
  const storeDispatch = vi.fn();
  const cleanups: Array<() => void> = [];

  const ctx = {
    doc: {
      page: (pon: number) => ({
        annotations: {
          list: async () => {
            listCalls.push(pon);
            await opts?.listDelay?.(pon);
            const page = pages.find((candidate) => candidate.pon === pon);
            return {
              annotations: (page?.annotations ?? []).map((a) => ({
                subtype: 'square',
                ref: ref(pon, a.objectNumber),
                actions: a.actions,
              })),
            };
          },
        },
      }),
      forms: { list: async () => ({ fields: [] }) },
      ...(opts?.docActions !== undefined
        ? {
            actions: {
              read: async () => ({
                openAction: opts.docActions?.openAction ?? null,
                openDestination: opts.docActions?.openDestination ?? null,
              }),
            },
          }
        : {}),
      events: {
        subscribe: (listener: (event: { type: string }) => void) => {
          docListener = listener;
          return () => {
            docListener = null;
          };
        },
      },
    },
    documentId: 'doc-1',
    document: () => ({
      pages: pages.map((page) => ({ pageObjectNumber: page.pon, actions: page.actions })),
    }),
    dispatch: storeDispatch,
    tryGet: () => null,
    cleanup: (fn: () => void) => cleanups.push(fn),
  } as unknown as PluginContext<ActionsState, ActionsAction>;

  const capability = createActionsCapability(ctx, opts?.config);

  const seam: string[] = [];
  capability.registerExecutor('named', (node) => {
    seam.push(`named:${node.type === 'named' ? node.name : '?'}`);
    return { status: 'executed' };
  });
  capability.registerExecutor('goto', (node) => {
    seam.push(
      `goto:${node.type === 'goto' && 'pageObjectNumber' in node.destination ? node.destination.pageObjectNumber : '?'}`,
    );
    return { status: 'executed' };
  });

  const events: ActionDispatchEvent[] = [];
  capability.onAction((event) => events.push(event));
  const diagnostics: ActionDiagnostic[] = [];
  capability.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));

  /** Await this to drain the serial queue behind every prior submission. */
  const drain = () =>
    capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter', // hover — never resets the cascade counter
      ref: ref(999_999, 1),
      pon: 999_999,
    });

  return { capability, seam, events, diagnostics, listCalls, drain, docEvent: (type: string) => docListener?.({ type }) };
}

describe('originOf', () => {
  it('derives the one true mapping', () => {
    const at = (trigger: ActionTrigger) => originOf(trigger);
    expect(at({ scope: 'activate', ref: ref(1, 1), pon: 1 })).toBe('user');
    for (const event of ['mouseDown', 'mouseUp', 'focus', 'blur'] as const) {
      expect(at({ scope: 'annotation', event, ref: ref(1, 1), pon: 1 })).toBe('user');
    }
    for (const event of ['cursorEnter', 'cursorExit'] as const) {
      expect(at({ scope: 'annotation', event, ref: ref(1, 1), pon: 1 })).toBe('hover');
    }
    expect(at({ scope: 'page', event: 'open', pon: 1 })).toBe('lifecycle');
    expect(at({ scope: 'document', event: 'open' })).toBe('lifecycle');
  });
});

describe('queued trigger resolution', () => {
  it('preserves submission order even when the first resolution is slower', async () => {
    // The review's exact scenario: close's lookup resolves AFTER open's
    // would have — the queue must still run close → open.
    const gates = new Map<number, Promise<void>>();
    let releaseSlow!: () => void;
    gates.set(1, new Promise<void>((resolve) => (releaseSlow = resolve)));
    const h = harness({
      pages: [
        { pon: 1, actions: { close: tree(named('closeA')) } },
        { pon: 2, actions: { open: tree(named('openB')) } },
      ],
      config: { openSequence: 'off' },
      listDelay: (pon) => gates.get(pon) ?? Promise.resolve(),
    });
    const closing = h.capability.dispatch({ scope: 'page', event: 'close', pon: 1 });
    const opening = h.capability.dispatch({ scope: 'page', event: 'open', pon: 2 });
    // Give the (would-be) racing read every chance to finish first.
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseSlow();
    await Promise.all([closing, opening]);
    expect(h.seam).toEqual(['named:closeA', 'named:openB']);
  });

  it('never rejects: a throwing resolution becomes refused + trigger-failed', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      listDelay: () => Promise.reject(new Error('read exploded')),
    });
    const result = await h.capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: ref(1, 1),
      pon: 1,
    });
    expect(result.status).toBe('refused');
    expect(result.steps).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: 'trigger-failed' });
  });

  it('resolves annotation events to their /AA tree; absence is silently inert', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pon: 4,
          annotations: [{ objectNumber: 7, actions: { cursorEnter: tree(named('enter7')) } }],
        },
      ],
    });
    const hit = await h.capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: ref(4, 7),
      pon: 4,
    });
    expect(hit.status).toBe('executed');
    expect(hit.steps).toHaveLength(1);
    expect(hit.steps[0]?.source).toEqual({ kind: 'annotation', annotation: ref(4, 7), pon: 4 });
    const miss = await h.capability.dispatch({
      scope: 'annotation',
      event: 'cursorExit',
      ref: ref(4, 7),
      pon: 4,
    });
    expect(miss.status).toBe('inert');
    expect(miss.steps).toEqual([]);
    expect(miss.diagnostics).toEqual([]);
    expect(h.seam).toEqual(['named:enter7']);
  });

  it('honours a first-party source hint without letting it change origin', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        { pon: 4, annotations: [{ objectNumber: 7, actions: { cursorEnter: tree(named('e')) } }] },
      ],
    });
    const result = await h.capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: ref(4, 7),
      pon: 4,
      source: { kind: 'link', annotation: ref(4, 7), pon: 4 },
    });
    expect(result.steps[0]?.source).toEqual({ kind: 'link', annotation: ref(4, 7), pon: 4 });
    expect(h.events.at(-1)?.ctx.origin).toBe('hover'); // hint can't launder origin
  });
});

describe('page fan-out (ISO Table 197/198 order)', () => {
  const fanPages: FakePage[] = [
    {
      pon: 5,
      actions: { open: tree(named('pageO')), close: tree(named('pageC')) },
      annotations: [
        {
          objectNumber: 11,
          actions: {
            pageOpen: tree(named('PO-11')),
            pageClose: tree(named('PC-11')),
            pageVisible: tree(named('PV-11')),
            pageInvisible: tree(named('PI-11')),
          },
        },
        { objectNumber: 12, actions: { pageOpen: tree(named('PO-12')) } },
        { objectNumber: 13 }, // no lifecycle trees — never a step
      ],
    },
  ];

  it('open runs page /O first, then the /PO set; close runs /PC before /C', async () => {
    const h = harness({ pages: fanPages, config: { openSequence: 'off' } });
    const open = await h.capability.dispatch({ scope: 'page', event: 'open', pon: 5 });
    expect(h.seam).toEqual(['named:pageO', 'named:PO-11', 'named:PO-12']);
    expect(open.status).toBe('executed');
    expect(open.steps.map((s) => s.source.kind)).toEqual(['page', 'annotation', 'annotation']);
    h.seam.length = 0;
    await h.capability.dispatch({ scope: 'page', event: 'close', pon: 5 });
    expect(h.seam).toEqual(['named:PC-11', 'named:pageC']);
  });

  it('visible/invisible fan only their sets; onAction fires per step with the true tree', async () => {
    const h = harness({ pages: fanPages, config: { openSequence: 'off' } });
    await h.capability.dispatch({ scope: 'page', event: 'visible', pon: 5 });
    await h.capability.dispatch({ scope: 'page', event: 'invisible', pon: 5 });
    expect(h.seam).toEqual(['named:PV-11', 'named:PI-11']);
    const emitted = h.events.map((e) => (e.tree.root as { name?: string } | null)?.name);
    expect(emitted).toEqual(['PV-11', 'PI-11']);
    expect(h.events.every((e) => e.ctx.origin === 'lifecycle')).toBe(true);
  });

  it('a failed step never skips its siblings', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pon: 6,
          actions: { close: tree(named('pageC')) },
          annotations: [{ objectNumber: 21, actions: { pageClose: tree(js('boom')) } }],
        },
      ],
    });
    h.capability.registerExecutor('javascript', () => ({ status: 'failed', error: 'boom' }));
    const result = await h.capability.dispatch({ scope: 'page', event: 'close', pon: 6 });
    expect(h.seam).toEqual(['named:pageC']); // sibling /C still ran
    expect(result.status).toBe('partial');
    expect(result.steps.map((s) => s.result.status)).toEqual(['partial', 'executed']);
  });

  it('flushes deferred navigation per step, not per fan-out', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pon: 7,
          actions: { open: tree(goto(2)) }, // deferred inside ITS step
          annotations: [{ objectNumber: 31, actions: { pageOpen: tree(named('PO')) } }],
        },
      ],
    });
    await h.capability.dispatch({ scope: 'page', event: 'open', pon: 7 });
    // Batch-wide deferral would order ['named:PO', 'goto:2'].
    expect(h.seam).toEqual(['goto:2', 'named:PO']);
  });

  it('caches lifecycle trees per pon; annotation events and desync invalidate', async () => {
    const h = harness({ pages: fanPages, config: { openSequence: 'off' } });
    await h.capability.dispatch({ scope: 'page', event: 'visible', pon: 5 });
    await h.capability.dispatch({ scope: 'page', event: 'invisible', pon: 5 });
    expect(h.listCalls.filter((pon) => pon === 5)).toHaveLength(1); // cache hit
    h.docEvent('annotation.updated');
    await h.capability.dispatch({ scope: 'page', event: 'visible', pon: 5 });
    expect(h.listCalls.filter((pon) => pon === 5)).toHaveLength(2);
    h.docEvent('stream.desynced');
    await h.capability.dispatch({ scope: 'page', event: 'visible', pon: 5 });
    expect(h.listCalls.filter((pon) => pon === 5)).toHaveLength(3);
  });
});

describe('/A precedence over /AA U (ISO Table 197)', () => {
  it('shadows mouseUp when an activate tree exists; runs it otherwise', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pon: 3,
          annotations: [
            {
              objectNumber: 1,
              actions: { activate: tree(named('A-1')), mouseUp: tree(named('U-1')) },
            },
            { objectNumber: 2, actions: { mouseUp: tree(named('U-2')) } },
          ],
        },
      ],
    });
    const shadowed = await h.capability.dispatch({
      scope: 'annotation',
      event: 'mouseUp',
      ref: ref(3, 1),
      pon: 3,
    });
    expect(shadowed.status).toBe('inert');
    expect(shadowed.steps).toEqual([]);
    const bare = await h.capability.dispatch({
      scope: 'annotation',
      event: 'mouseUp',
      ref: ref(3, 2),
      pon: 3,
    });
    expect(bare.status).toBe('executed');
    expect(h.seam).toEqual(['named:U-2']);
  });
});

describe('trigger config gates', () => {
  it('gates families to inert + trigger-disabled; activate is never gated', async () => {
    const h = harness({
      config: {
        openSequence: 'off',
        triggers: { page: false, annotation: false, document: false },
      },
      pages: [{ pon: 1, actions: { open: tree(named('O')) } }],
    });
    for (const trigger of [
      { scope: 'page', event: 'open', pon: 1 },
      { scope: 'annotation', event: 'cursorEnter', ref: ref(1, 1), pon: 1 },
      { scope: 'document', event: 'open' },
    ] as ActionTrigger[]) {
      const result = await h.capability.dispatch(trigger);
      expect(result.status).toBe('inert');
      expect(result.diagnostics[0]).toMatchObject({ code: 'trigger-disabled' });
      expect(h.capability.canDispatch(trigger)).toBe(false);
    }
    expect(h.seam).toEqual([]);
    expect(h.capability.canDispatch({ scope: 'activate', ref: ref(1, 1), pon: 1 })).toBe(true);
  });
});

describe('the document-open barrier + lifecycle coordinator', () => {
  const openDocs = {
    openAction: tree(named('OpenAction')),
    openDestination: { kind: 'fit' as const, pageObjectNumber: 3 },
  };

  it('auto: fires once on adapter install — openDestination goto, then OpenAction, then the ACTUAL page open', async () => {
    const h = harness({
      docActions: openDocs,
      pages: [
        { pon: 1, actions: { open: tree(named('O-1')) } },
        { pon: 3, actions: { open: tree(named('O-3')) } },
      ],
    });
    // Pre-open motion: placed at 1, then the reveal moves to 3 — buffered,
    // coalesced; page 1 was never "opened" and gets NO events.
    h.capability.reportPageState({
      currentPon: 1,
      visiblePons: [1],
      placed: true,
      cause: 'programmatic',
    });
    h.capability.reportPageState({
      currentPon: 3,
      visiblePons: [3],
      placed: true,
      cause: 'programmatic',
    });
    expect(h.seam).toEqual([]); // nothing before the latch
    h.capability.setUiAdapter({ openUri: () => {}, print: () => {} });
    // The flushed page-open enqueues at the END of the barrier op — one more
    // queue round makes it observable.
    await h.drain();
    await h.drain();
    expect(h.seam).toEqual(['goto:3', 'named:OpenAction', 'named:O-3']);
    // Installing another adapter never replays the sequence.
    h.capability.setUiAdapter({ openUri: () => {}, print: () => {} });
    await h.drain();
    expect(h.seam).toEqual(['goto:3', 'named:OpenAction', 'named:O-3']);
  });

  it('auto: the first user-origin dispatch fires the sequence AHEAD of itself', async () => {
    const h = harness({
      docActions: { openAction: tree(named('OpenAction')), openDestination: null },
      pages: [{ pon: 2, annotations: [{ objectNumber: 9, actions: { activate: tree(named('click')) } }] }],
    });
    await h.capability.dispatch({ scope: 'activate', ref: ref(2, 9), pon: 2 });
    await h.drain();
    expect(h.seam[0]).toBe('named:OpenAction');
    expect(h.seam).toContain('named:click');
    expect(h.seam.indexOf('named:OpenAction')).toBeLessThan(h.seam.indexOf('named:click'));
  });

  it('headless: fires at creation and falls back to the first pon with no stage reports', async () => {
    const h = harness({
      config: { openSequence: 'headless' },
      docActions: { openAction: null, openDestination: null },
      pages: [{ pon: 8, actions: { open: tree(named('O-8')) } }],
    });
    await h.drain();
    await h.drain();
    expect(h.seam).toEqual(['named:O-8']);
  });

  it("off: never runs the sequence but RELEASES the barrier (feeds don't buffer forever)", async () => {
    const h = harness({
      config: { openSequence: 'off' },
      docActions: openDocs,
      pages: [{ pon: 1, actions: { open: tree(named('O-1')) } }],
    });
    h.capability.reportPageState({
      currentPon: 1,
      visiblePons: [1],
      placed: true,
      cause: 'user',
    });
    await h.drain();
    expect(h.seam).toEqual(['named:O-1']); // no goto, no OpenAction
  });

  it('a replayed document-open trigger reports open-sequence-replayed', async () => {
    const h = harness({ config: { openSequence: 'headless' }, docActions: {} });
    await h.drain();
    const result = await h.capability.dispatch({ scope: 'document', event: 'open' });
    expect(result.status).toBe('inert');
    expect(result.diagnostics[0]).toMatchObject({ code: 'open-sequence-replayed' });
  });

  it('unplaced reports are ignored; post-barrier reports diff close→invisible→visible→open', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pon: 1,
          actions: { close: tree(named('C-1')) },
          annotations: [{ objectNumber: 41, actions: { pageInvisible: tree(named('PI-1')) } }],
        },
        {
          pon: 2,
          actions: { open: tree(named('O-2')) },
          annotations: [{ objectNumber: 42, actions: { pageVisible: tree(named('PV-2')) } }],
        },
      ],
    });
    h.capability.reportPageState({ currentPon: 1, visiblePons: [1], placed: false, cause: 'user' });
    await h.drain();
    expect(h.seam).toEqual([]); // unplaced → ignored entirely
    h.capability.reportPageState({ currentPon: 1, visiblePons: [1], placed: true, cause: 'user' });
    await h.drain();
    h.seam.length = 0;
    h.capability.reportPageState({ currentPon: 2, visiblePons: [2], placed: true, cause: 'user' });
    await h.drain();
    expect(h.seam).toEqual(['named:C-1', 'named:PI-1', 'named:PV-2', 'named:O-2']);
  });

  it('caps consecutive programmatic rounds and resets on a user-caused report', async () => {
    const h = harness({
      config: { openSequence: 'off' },
      pages: [
        { pon: 1, actions: { open: tree(named('O-1')) } },
        { pon: 2, actions: { open: tree(named('O-2')) } },
      ],
    });
    // Seed emitted state.
    h.capability.reportPageState({ currentPon: 1, visiblePons: [], placed: true, cause: 'user' });
    await h.drain();
    h.seam.length = 0;
    // The /O→GoTo loop shape: programmatic flips 1↔2 forever.
    for (let round = 0; round < 12; round++) {
      h.capability.reportPageState({
        currentPon: round % 2 === 0 ? 2 : 1,
        visiblePons: [],
        placed: true,
        cause: 'programmatic',
      });
    }
    await h.drain();
    const opens = h.seam.filter((s) => s.startsWith('named:O')).length;
    expect(opens).toBeLessThanOrEqual(8); // bounded, not unlimited
    expect(h.diagnostics.some((d) => d.code === 'cascade-budget')).toBe(true);
    // A user-caused round resumes emission.
    h.seam.length = 0;
    h.capability.reportPageState({ currentPon: 2, visiblePons: [], placed: true, cause: 'user' });
    await h.drain();
    expect(h.seam).toContain('named:O-2');
  });
});
