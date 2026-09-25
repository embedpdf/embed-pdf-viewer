import { describe, expect, it, vi } from 'vitest';

import { createTestContext } from '@embedpdf/core/testing';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type {
  AnnotationRef,
  DocumentEvent,
  DocumentHandle,
  PageRef,
  PdfActionNode,
  PdfActionTree,
  PdfAnnotationActions,
  PdfPageActions,
} from '@embedpdf/engine-core/runtime';

import { createActionsController } from '../src/controller';
import { triggerOriginOf } from '../src/host-contract';
import type {
  ActionDiagnostic,
  ActionDispatchEvent,
  ActionsConfig,
  ActionTrigger,
} from '../src/host-contract';

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
const script = (source: string, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'javascript',
  subtype: 'JavaScript',
  script: source,
  next,
});
const goto = (pageObjectNumber: number, next: PdfActionNode[] = []): PdfActionNode => ({
  type: 'goto',
  subtype: 'GoTo',
  destination: { kind: 'fit', page: toPageRef(pageObjectNumber) },
  next,
});

const ref = (pageObjectNumber: number, objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: toPageRef(pageObjectNumber),
  annotObjectNumber: objectNumber,
});

interface FakeAnnotation {
  objectNumber: number;
  actions?: Partial<PdfAnnotationActions>;
}
interface FakePage {
  pageObjectNumber: number;
  actions?: PdfPageActions;
  annotations?: FakeAnnotation[];
}

/** A trigger-grade harness: controllable read timing, injectable document
 *  events, recording seams. */
function harness(options?: {
  config?: ActionsConfig;
  pages?: FakePage[];
  docActions?: {
    openAction?: PdfActionTree | null;
    openDestination?: { kind: 'fit'; page: PageRef } | null;
  };
  /** Awaited inside each annotations.list, for reversed-resolution tests. */
  listDelay?: (pageObjectNumber: number) => Promise<void>;
}) {
  const pages = options?.pages ?? [];
  const listCalls: number[] = [];

  const ctx = createTestContext<void>({
    id: 'actions',
    pages: pages.map((page) => ({ ref: toPageRef(page.pageObjectNumber) })),
    doc: {
      page: ({ pageObjectNumber }: PageRef) => ({
        annotations: {
          list: async () => {
            listCalls.push(pageObjectNumber);
            await options?.listDelay?.(pageObjectNumber);
            const page = pages.find((candidate) => candidate.pageObjectNumber === pageObjectNumber);
            return {
              annotations: (page?.annotations ?? []).map((annotation) => ({
                subtype: 'square',
                ref: ref(pageObjectNumber, annotation.objectNumber),
                actions: annotation.actions,
              })),
            };
          },
        },
      }),
      forms: { list: async () => ({ fields: [] }) },
      ...(options?.docActions !== undefined
        ? {
            actions: {
              get: async () => ({
                openAction: options.docActions?.openAction ?? null,
                openDestination: options.docActions?.openDestination ?? null,
              }),
            },
          }
        : {}),
    } as unknown as Partial<DocumentHandle>,
  });
  // The pages' own /AA trees, as the kernel's page registry carries them.
  for (const layout of ctx.document()!.pages) {
    const page = pages.find(
      (candidate) => candidate.pageObjectNumber === layout.ref.pageObjectNumber,
    );
    if (page?.actions) Object.assign(layout, { actions: page.actions });
  }

  const capability = ctx.connect(createActionsController(ctx, options?.config));

  const seam: string[] = [];
  capability.registerExecutor('named', (node) => {
    seam.push(`named:${node.type === 'named' ? node.name : '?'}`);
    return { status: 'executed' };
  });
  capability.registerExecutor('goto', (node) => {
    seam.push(
      `goto:${node.type === 'goto' && 'page' in node.destination ? node.destination.page.pageObjectNumber : '?'}`,
    );
    return { status: 'executed' };
  });

  const events: ActionDispatchEvent[] = [];
  capability.onExecuted((event) => events.push(event));
  const diagnostics: ActionDiagnostic[] = [];
  capability.onDiagnostic((diagnostic) => diagnostics.push(diagnostic));

  /** Await this to drain the serial queue behind every prior submission. */
  const drain = () =>
    capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter', // hover: never resets the cascade counter
      ref: ref(999_999, 1),
      page: toPageRef(999_999),
    });

  return {
    capability,
    seam,
    events,
    diagnostics,
    listCalls,
    drain,
    documentEvent: (event: Partial<DocumentEvent>) => ctx.emitDocumentEvent(event as DocumentEvent),
  };
}

describe('triggerOriginOf', () => {
  it('derives the one true mapping', () => {
    const at = (trigger: ActionTrigger) => triggerOriginOf(trigger);
    expect(at({ scope: 'activate', ref: ref(1, 1), page: toPageRef(1) })).toBe('user');
    for (const event of ['mouseDown', 'mouseUp', 'focus', 'blur'] as const) {
      expect(at({ scope: 'annotation', event, ref: ref(1, 1), page: toPageRef(1) })).toBe('user');
    }
    for (const event of ['cursorEnter', 'cursorExit'] as const) {
      expect(at({ scope: 'annotation', event, ref: ref(1, 1), page: toPageRef(1) })).toBe('hover');
    }
    expect(at({ scope: 'page', event: 'open', page: toPageRef(1) })).toBe('lifecycle');
    expect(at({ scope: 'document', event: 'open' })).toBe('lifecycle');
  });
});

describe('queued trigger resolution', () => {
  it('preserves submission order even when the first resolution is slower', async () => {
    // Close's lookup resolves after open's would have: the queue must still
    // run close → open.
    const gates = new Map<number, Promise<void>>();
    let releaseSlow!: () => void;
    gates.set(1, new Promise<void>((resolve) => (releaseSlow = resolve)));
    const fixture = harness({
      pages: [
        { pageObjectNumber: 1, actions: { close: tree(named('closeA')) } },
        { pageObjectNumber: 2, actions: { open: tree(named('openB')) } },
      ],
      config: { openSequence: 'off' },
      listDelay: (pageObjectNumber) => gates.get(pageObjectNumber) ?? Promise.resolve(),
    });
    const closing = fixture.capability.dispatch({
      scope: 'page',
      event: 'close',
      page: toPageRef(1),
    });
    const opening = fixture.capability.dispatch({
      scope: 'page',
      event: 'open',
      page: toPageRef(2),
    });
    // Give the (would-be) racing read every chance to finish first.
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseSlow();
    await Promise.all([closing, opening]);
    expect(fixture.seam).toEqual(['named:closeA', 'named:openB']);
  });

  it('never rejects: a throwing resolution becomes refused + trigger-failed', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      listDelay: () => Promise.reject(new Error('read exploded')),
    });
    const result = await fixture.capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: ref(1, 1),
      page: toPageRef(1),
    });
    expect(result.status).toBe('refused');
    expect(result.steps).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: 'trigger-failed' });
  });

  it('resolves annotation events to their /AA tree; absence is silently inert', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pageObjectNumber: 4,
          annotations: [{ objectNumber: 7, actions: { cursorEnter: tree(named('enter7')) } }],
        },
      ],
    });
    const hit = await fixture.capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: ref(4, 7),
      page: toPageRef(4),
    });
    expect(hit.status).toBe('executed');
    expect(hit.steps).toHaveLength(1);
    expect(hit.steps[0]?.source).toEqual({
      kind: 'annotation',
      annotation: ref(4, 7),
      page: toPageRef(4),
    });
    const miss = await fixture.capability.dispatch({
      scope: 'annotation',
      event: 'cursorExit',
      ref: ref(4, 7),
      page: toPageRef(4),
    });
    expect(miss.status).toBe('inert');
    expect(miss.steps).toEqual([]);
    expect(miss.diagnostics).toEqual([]);
    expect(fixture.seam).toEqual(['named:enter7']);
  });

  it('honours a first-party source hint without letting it change origin', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pageObjectNumber: 4,
          annotations: [{ objectNumber: 7, actions: { cursorEnter: tree(named('e')) } }],
        },
      ],
    });
    const result = await fixture.capability.dispatch({
      scope: 'annotation',
      event: 'cursorEnter',
      ref: ref(4, 7),
      page: toPageRef(4),
      source: { kind: 'link', annotation: ref(4, 7), page: toPageRef(4) },
    });
    expect(result.steps[0]?.source).toEqual({
      kind: 'link',
      annotation: ref(4, 7),
      page: toPageRef(4),
    });
    expect(fixture.events.at(-1)?.ctx.origin).toBe('hover'); // hint can't launder origin
  });
});

describe('page fan-out (ISO Table 197/198 order)', () => {
  const fanPages: FakePage[] = [
    {
      pageObjectNumber: 5,
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
    const fixture = harness({ pages: fanPages, config: { openSequence: 'off' } });
    const open = await fixture.capability.dispatch({
      scope: 'page',
      event: 'open',
      page: toPageRef(5),
    });
    expect(fixture.seam).toEqual(['named:pageO', 'named:PO-11', 'named:PO-12']);
    expect(open.status).toBe('executed');
    expect(open.steps.map((step) => step.source.kind)).toEqual([
      'page',
      'annotation',
      'annotation',
    ]);
    fixture.seam.length = 0;
    await fixture.capability.dispatch({ scope: 'page', event: 'close', page: toPageRef(5) });
    expect(fixture.seam).toEqual(['named:PC-11', 'named:pageC']);
  });

  it('visible/invisible fan only their sets; onExecuted fires per step with the true tree', async () => {
    const fixture = harness({ pages: fanPages, config: { openSequence: 'off' } });
    await fixture.capability.dispatch({ scope: 'page', event: 'visible', page: toPageRef(5) });
    await fixture.capability.dispatch({ scope: 'page', event: 'invisible', page: toPageRef(5) });
    expect(fixture.seam).toEqual(['named:PV-11', 'named:PI-11']);
    const emitted = fixture.events.map(
      (event) => (event.tree.root as { name?: string } | null)?.name,
    );
    expect(emitted).toEqual(['PV-11', 'PI-11']);
    expect(fixture.events.every((event) => event.ctx.origin === 'lifecycle')).toBe(true);
  });

  it('a failed step never skips its siblings', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pageObjectNumber: 6,
          actions: { close: tree(named('pageC')) },
          annotations: [{ objectNumber: 21, actions: { pageClose: tree(script('boom')) } }],
        },
      ],
    });
    fixture.capability.registerExecutor('javascript', () => ({ status: 'failed', error: 'boom' }));
    const result = await fixture.capability.dispatch({
      scope: 'page',
      event: 'close',
      page: toPageRef(6),
    });
    expect(fixture.seam).toEqual(['named:pageC']); // sibling /C still ran
    expect(result.status).toBe('partial');
    expect(result.steps.map((step) => step.result.status)).toEqual(['partial', 'executed']);
  });

  it('flushes deferred navigation per step, not per fan-out', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pageObjectNumber: 7,
          actions: { open: tree(goto(2)) }, // deferred inside its step
          annotations: [{ objectNumber: 31, actions: { pageOpen: tree(named('PO')) } }],
        },
      ],
    });
    await fixture.capability.dispatch({ scope: 'page', event: 'open', page: toPageRef(7) });
    // Batch-wide deferral would order `['named:PO', 'goto:2']`.
    expect(fixture.seam).toEqual(['goto:2', 'named:PO']);
  });

  const readsOfPage5 = (fixture: ReturnType<typeof harness>) =>
    fixture.listCalls.filter((pageObjectNumber) => pageObjectNumber === 5).length;
  const visible5 = { scope: 'page', event: 'visible', page: toPageRef(5) } as const;

  it('caches lifecycle trees per page; annotation events and desync invalidate', async () => {
    const fixture = harness({ pages: fanPages, config: { openSequence: 'off' } });
    await fixture.capability.dispatch(visible5);
    await fixture.capability.dispatch({ scope: 'page', event: 'invisible', page: toPageRef(5) });
    expect(readsOfPage5(fixture)).toBe(1); // cache hit
    fixture.documentEvent({ type: 'annotation.updated', page: toPageRef(5) });
    await fixture.capability.dispatch(visible5);
    expect(readsOfPage5(fixture)).toBe(2);
    fixture.documentEvent({ type: 'stream.desynced' });
    await fixture.capability.dispatch(visible5);
    expect(readsOfPage5(fixture)).toBe(3);
  });

  it('an annotation event on another page keeps the cached page', async () => {
    const fixture = harness({ pages: fanPages, config: { openSequence: 'off' } });
    await fixture.capability.dispatch(visible5);
    fixture.documentEvent({ type: 'annotation.updated', page: toPageRef(6) });
    await fixture.capability.dispatch(visible5);
    expect(readsOfPage5(fixture)).toBe(1);
  });

  it('flattening, redaction and a new document version invalidate the cache too', async () => {
    const fixture = harness({ pages: fanPages, config: { openSequence: 'off' } });
    const invalidating: Array<Partial<DocumentEvent>> = [
      { type: 'annotations.flattened', page: toPageRef(5) },
      { type: 'pages.flattened', pages: [toPageRef(5)] },
      { type: 'redaction.applied' },
      { type: 'document.versioned' },
    ];
    await fixture.capability.dispatch(visible5);
    for (const [index, event] of invalidating.entries()) {
      fixture.documentEvent(event);
      await fixture.capability.dispatch(visible5);
      expect(readsOfPage5(fixture)).toBe(index + 2);
    }
  });

  it('a read in flight when its page changes is not reused afterwards', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let delayed = true;
    const fixture = harness({
      pages: fanPages,
      config: { openSequence: 'off' },
      listDelay: () => (delayed ? gate : Promise.resolve()),
    });
    const first = fixture.capability.dispatch(visible5);
    await new Promise((resolve) => setTimeout(resolve, 0)); // the read is in flight
    fixture.documentEvent({ type: 'annotation.updated', page: toPageRef(5) });
    delayed = false;
    release();
    await first;
    await fixture.capability.dispatch(visible5);
    expect(readsOfPage5(fixture)).toBe(2); // the stale read was not cached
  });
});

describe('/A precedence over /AA U (ISO Table 197)', () => {
  it('shadows mouseUp when an activate tree exists; runs it otherwise', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pageObjectNumber: 3,
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
    const shadowed = await fixture.capability.dispatch({
      scope: 'annotation',
      event: 'mouseUp',
      ref: ref(3, 1),
      page: toPageRef(3),
    });
    expect(shadowed.status).toBe('inert');
    expect(shadowed.steps).toEqual([]);
    const bare = await fixture.capability.dispatch({
      scope: 'annotation',
      event: 'mouseUp',
      ref: ref(3, 2),
      page: toPageRef(3),
    });
    expect(bare.status).toBe('executed');
    expect(fixture.seam).toEqual(['named:U-2']);
  });
});

describe('trigger config gates', () => {
  it('gates families to inert + trigger-disabled; activate is never gated', async () => {
    const fixture = harness({
      config: {
        openSequence: 'off',
        triggers: { page: false, annotation: false, document: false },
      },
      pages: [{ pageObjectNumber: 1, actions: { open: tree(named('O')) } }],
    });
    for (const trigger of [
      { scope: 'page', event: 'open', page: toPageRef(1) },
      { scope: 'annotation', event: 'cursorEnter', ref: ref(1, 1), page: toPageRef(1) },
      { scope: 'document', event: 'open' },
    ] as ActionTrigger[]) {
      const result = await fixture.capability.dispatch(trigger);
      expect(result.status).toBe('inert');
      expect(result.diagnostics[0]).toMatchObject({ code: 'trigger-disabled' });
      expect(fixture.capability.canDispatch(trigger)).toBe(false);
    }
    expect(fixture.seam).toEqual([]);
    expect(
      fixture.capability.canDispatch({ scope: 'activate', ref: ref(1, 1), page: toPageRef(1) }),
    ).toBe(true);
  });
});

describe('the document-open barrier + lifecycle coordinator', () => {
  const openDocs = {
    openAction: tree(named('OpenAction')),
    openDestination: { kind: 'fit' as const, page: toPageRef(3) },
  };

  it('auto: fires once on adapter install — openDestination goto, then OpenAction, then the ACTUAL page open', async () => {
    const fixture = harness({
      docActions: openDocs,
      pages: [
        { pageObjectNumber: 1, actions: { open: tree(named('O-1')) } },
        { pageObjectNumber: 3, actions: { open: tree(named('O-3')) } },
      ],
    });
    // Pre-open motion: placed at 1, then the reveal moves to 3 — buffered,
    // coalesced; page 1 was never "opened" and gets no events.
    fixture.capability.reportPageState({
      currentPage: toPageRef(1),
      visiblePages: [toPageRef(1)],
      placed: true,
      cause: 'programmatic',
    });
    fixture.capability.reportPageState({
      currentPage: toPageRef(3),
      visiblePages: [toPageRef(3)],
      placed: true,
      cause: 'programmatic',
    });
    expect(fixture.seam).toEqual([]); // nothing before the latch
    fixture.capability.setUiAdapter({ openUri: () => {}, print: () => {} });
    // The flushed page-open enqueues at the end of the barrier op — one more
    // queue round makes it observable.
    await fixture.drain();
    await fixture.drain();
    expect(fixture.seam).toEqual(['goto:3', 'named:OpenAction', 'named:O-3']);
    // Installing another adapter never replays the sequence.
    fixture.capability.setUiAdapter({ openUri: () => {}, print: () => {} });
    await fixture.drain();
    expect(fixture.seam).toEqual(['goto:3', 'named:OpenAction', 'named:O-3']);
  });

  it('auto: the first user-origin dispatch fires the sequence AHEAD of itself', async () => {
    const fixture = harness({
      docActions: { openAction: tree(named('OpenAction')), openDestination: null },
      pages: [
        {
          pageObjectNumber: 2,
          annotations: [{ objectNumber: 9, actions: { activate: tree(named('click')) } }],
        },
      ],
    });
    await fixture.capability.dispatch({ scope: 'activate', ref: ref(2, 9), page: toPageRef(2) });
    await fixture.drain();
    expect(fixture.seam[0]).toBe('named:OpenAction');
    expect(fixture.seam).toContain('named:click');
    expect(fixture.seam.indexOf('named:OpenAction')).toBeLessThan(
      fixture.seam.indexOf('named:click'),
    );
  });

  it('headless: fires at creation and falls back to the first page with no stage reports', async () => {
    const fixture = harness({
      config: { openSequence: 'headless' },
      docActions: { openAction: null, openDestination: null },
      pages: [{ pageObjectNumber: 8, actions: { open: tree(named('O-8')) } }],
    });
    await fixture.drain();
    await fixture.drain();
    expect(fixture.seam).toEqual(['named:O-8']);
  });

  it("off: never runs the sequence but RELEASES the barrier (feeds don't buffer forever)", async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      docActions: openDocs,
      pages: [{ pageObjectNumber: 1, actions: { open: tree(named('O-1')) } }],
    });
    fixture.capability.reportPageState({
      currentPage: toPageRef(1),
      visiblePages: [toPageRef(1)],
      placed: true,
      cause: 'user',
    });
    await fixture.drain();
    expect(fixture.seam).toEqual(['named:O-1']); // no goto, no OpenAction
  });

  it('a replayed document-open trigger reports open-sequence-replayed', async () => {
    const fixture = harness({ config: { openSequence: 'headless' }, docActions: {} });
    await fixture.drain();
    const result = await fixture.capability.dispatch({ scope: 'document', event: 'open' });
    expect(result.status).toBe('inert');
    expect(result.diagnostics[0]).toMatchObject({ code: 'open-sequence-replayed' });
  });

  it('unplaced reports are ignored; post-barrier reports diff close→invisible→visible→open', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        {
          pageObjectNumber: 1,
          actions: { close: tree(named('C-1')) },
          annotations: [{ objectNumber: 41, actions: { pageInvisible: tree(named('PI-1')) } }],
        },
        {
          pageObjectNumber: 2,
          actions: { open: tree(named('O-2')) },
          annotations: [{ objectNumber: 42, actions: { pageVisible: tree(named('PV-2')) } }],
        },
      ],
    });
    fixture.capability.reportPageState({
      currentPage: toPageRef(1),
      visiblePages: [toPageRef(1)],
      placed: false,
      cause: 'user',
    });
    await fixture.drain();
    expect(fixture.seam).toEqual([]); // unplaced → ignored entirely
    fixture.capability.reportPageState({
      currentPage: toPageRef(1),
      visiblePages: [toPageRef(1)],
      placed: true,
      cause: 'user',
    });
    await fixture.drain();
    fixture.seam.length = 0;
    fixture.capability.reportPageState({
      currentPage: toPageRef(2),
      visiblePages: [toPageRef(2)],
      placed: true,
      cause: 'user',
    });
    await fixture.drain();
    expect(fixture.seam).toEqual(['named:C-1', 'named:PI-1', 'named:PV-2', 'named:O-2']);
  });

  it('caps consecutive programmatic rounds and resets on a user-caused report', async () => {
    const fixture = harness({
      config: { openSequence: 'off' },
      pages: [
        { pageObjectNumber: 1, actions: { open: tree(named('O-1')) } },
        { pageObjectNumber: 2, actions: { open: tree(named('O-2')) } },
      ],
    });
    // Seed emitted state.
    fixture.capability.reportPageState({
      currentPage: toPageRef(1),
      visiblePages: [],
      placed: true,
      cause: 'user',
    });
    await fixture.drain();
    fixture.seam.length = 0;
    // The /O→GoTo loop shape: programmatic flips 1↔2 forever.
    for (let round = 0; round < 12; round++) {
      fixture.capability.reportPageState({
        currentPage: toPageRef(round % 2 === 0 ? 2 : 1),
        visiblePages: [],
        placed: true,
        cause: 'programmatic',
      });
    }
    await fixture.drain();
    const opens = fixture.seam.filter((entry) => entry.startsWith('named:O')).length;
    expect(opens).toBeLessThanOrEqual(8); // bounded, not unlimited
    expect(fixture.diagnostics.some((diagnostic) => diagnostic.code === 'cascade-budget')).toBe(
      true,
    );
    // A user-caused round resumes emission.
    fixture.seam.length = 0;
    fixture.capability.reportPageState({
      currentPage: toPageRef(2),
      visiblePages: [],
      placed: true,
      cause: 'user',
    });
    await fixture.drain();
    expect(fixture.seam).toContain('named:O-2');
  });
});
