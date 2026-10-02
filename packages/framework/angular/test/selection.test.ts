/**
 * The selection binding against a real kernel: the service's State signals (empty without a
 * document, changing only with their field), its settings with and without a document, its
 * streams, `copySelection()` on the service; the layer painting through its CSS variable, over
 * the accent at 35% or the `color` setting; and the menu, shown once the selection settles.
 */
import { Component, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import {
  createPageContext,
  EPDF_PAGE,
  provideEmbedPdf,
  EpdfKernelHost,
} from '@embedpdf/angular/runtime';
import { EPDF_PROJECTOR, type EpdfProjectorBinding } from '@embedpdf/angular/anchored';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  copySelection,
  EpdfSelection,
  EpdfSelectionLayer,
  EpdfSelectionMenu,
  SELECTION_DEFAULTS,
  SelectionToken,
  selectionState,
  withSelection,
  type SelectionConfig,
} from '@embedpdf/angular/selection';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/contract/host';
import { bytesInput, kernelOf, mount, pageLayout, viewerHost } from './fixtures';

/** One line of 10 upright 8-point glyphs at the top of the page, in page space. */
const quadOf = (start: number, count: number) => ({
  upperLeft: { x: 10 + start * 8, y: 10 },
  upperRight: { x: 10 + (start + count) * 8, y: 10 },
  lowerLeft: { x: 10 + start * 8, y: 20 },
  lowerRight: { x: 10 + (start + count) * 8, y: 20 },
});
const textLayout = {
  charCount: 10,
  runs: [],
  charAt: () => null,
  wordAt: () => null,
  lineAt: () => null,
  charQuad: (index: number) => quadOf(index, 1),
  segments: ({ start, count }: { start: number; count: number }) => [
    {
      quad: quadOf(start, count),
      rect: { x: 10 + start * 8, y: 10, width: count * 8, height: 10 },
      advance: 1 as const,
    },
  ],
};

/** Pages 5 and 7, each with one line of text. */
function selectionEngine(): Engine {
  const handle = {
    id: 'doc',
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: {
      list: () => Promise.resolve({ pageCount: 2, pages: [pageLayout(5, 0), pageLayout(7, 1)] }),
    },
    security: { allows: () => true },
    page: () => ({
      text: {
        layout: () => Promise.resolve(textLayout),
        get: () => Promise.resolve({ text: '0123456789', charCount: 10 }),
      },
    }),
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

const features = (config?: SelectionConfig) => [withInteraction(), withSelection(config)];

async function mountViewer(template = '', imports: unknown[] = [], config?: SelectionConfig) {
  const fixture = await mount(
    viewerHost({
      template,
      imports: imports as never,
      config: { engine: selectionEngine() },
      features: features(config),
    }),
  );
  return { fixture, selection: fixture.debugElement.injector.get(EpdfSelection) };
}

/** Let the page geometry the selection asked for arrive. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('EpdfSelection', () => {
  it("has exactly the page's State fields: empty with no document, the selection's once one is open", async () => {
    const { fixture, selection } = await mountViewer();
    const state = () => ({
      hasSelection: selection.hasSelection(),
      isSelecting: selection.isSelecting(),
      range: selection.range(),
      pages: selection.pages(),
    });
    expect(state()).toEqual(selectionState.empty);

    await kernelOf(fixture).documents.open(bytesInput('doc'));
    selection.select({ page: toPageRef(7), start: 2, count: 3 });
    await settle();
    expect(state()).toEqual({
      hasSelection: true,
      isSelecting: false,
      range: { start: { page: toPageRef(7), index: 2 }, end: { page: toPageRef(7), index: 5 } },
      pages: [toPageRef(7)],
    });
  });

  it('a signal changes only when its field does', async () => {
    const { fixture, selection } = await mountViewer();
    await kernelOf(fixture).documents.open(bytesInput('doc'));
    selection.select({ page: toPageRef(5), start: 0, count: 2 });
    await settle();
    let rangeReads = 0;
    let selectedReads = 0;
    const range = computed(() => (rangeReads++, selection.range()));
    const selected = computed(() => (selectedReads++, selection.hasSelection()));
    range();
    selected();

    selection.updateSettings({ color: 'red' }); // wakes readers, no field changes
    selection.select(selection.getRange()!); // the same range
    range();
    selected();
    expect([rangeReads, selectedReads]).toEqual([1, 1]);

    selection.select({ page: toPageRef(5), start: 0, count: 4 });
    range();
    selected();
    expect([rangeReads, selectedReads]).toEqual([2, 1]); // still something selected
  });

  it('reads the settings before any document opens, and follows a change made then', async () => {
    const { fixture, selection } = await mountViewer('', [], { handles: { color: '#e91e63' } });
    const kernel = kernelOf(fixture);
    expect(kernel.documents.list()).toEqual([]);
    expect(selection.settings()).toEqual({
      ...SELECTION_DEFAULTS,
      handles: { ...SELECTION_DEFAULTS.handles, color: '#e91e63' },
    });

    selection.updateSettings({ dragThreshold: 8 });
    expect(selection.settings()).toMatchObject({ dragThreshold: 8 });

    await kernel.documents.open(bytesInput('doc'));
    expect(kernel.capability(SelectionToken).getSettings()).toBe(selection.settings());
  });

  it('streams its events, and refuses not-ready without a document', async () => {
    const { fixture, selection } = await mountViewer();
    expect(() => selection.selectAll()).toThrow(/no document is open/);
    const changes: unknown[] = [];
    let cleared = 0;
    selection.changed$.subscribe(({ range }) => changes.push(range));
    selection.cleared$.subscribe(() => cleared++);

    await kernelOf(fixture).documents.open(bytesInput('doc'));
    selection.select({ page: toPageRef(5), start: 0, count: 2 });
    await settle();
    expect(changes.at(-1)).toEqual(selection.getRange());
    selection.clear();
    expect(cleared).toBe(1);
  });

  it('copySelection() copies the selected text through the service', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { fixture, selection } = await mountViewer();
    await kernelOf(fixture).documents.open(bytesInput('doc'));
    selection.select({ page: toPageRef(5), start: 2, count: 3 });
    await settle();
    await expect(copySelection(selection)).resolves.toBe('234');
    expect(writeText).toHaveBeenCalledWith('234');
  });
});

// ── the layer ──

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };
const pageContextOf = (objectNumber: number, index: number) =>
  createPageContext({
    documentId: () => 'doc',
    ref: () => toPageRef(objectNumber),
    view: () => 'test-view',
    pageIndex: signal(index),
    frame: signal(NO_FRAME),
    transform: signal(
      pageTransform({ pageSize: { width: 600, height: 800 }, rotation: 0, scale: 1, dpr: 1 }),
    ),
    getRect: () => new DOMRect(0, 0, 600, 800),
  });

@Component({
  selector: 'test-page',
  imports: [EpdfSelectionLayer],
  providers: [{ provide: EPDF_PAGE, useFactory: () => pageContextOf(5, 0) }],
  template: '<epdf-selection-layer />',
})
class Page {}

describe('<epdf-selection-layer>', () => {
  it('paints through its CSS variable, over the accent at 35% or the color setting', async () => {
    const { fixture, selection } = await mountViewer('<test-page />', [Page]);
    await kernelOf(fixture).documents.open(bytesInput('doc'));
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    await fixture.whenStable();
    const polygons = () => [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<SVGPolygonElement>('polygon'),
    ];
    expect(polygons()).toHaveLength(1);
    // The fill goes in `style`: an SVG attribute doesn't read var().
    expect(polygons()[0]!.getAttribute('fill')).toBeNull();
    expect(polygons()[0]!.style.fill).toBe(
      'var(--epdf-text-selection, color-mix(in srgb, var(--epdf-accent, #3858e9) 35%, transparent))',
    );
    // The line's four corners, in the page's pixels.
    expect(polygons()[0]!.getAttribute('points')).toBe('18,10 42,10 42,20 18,20');

    selection.updateSettings({ color: 'rgb(0 0 255 / 0.3)' });
    await fixture.whenStable();
    expect(polygons()[0]!.style.fill).toBe('var(--epdf-text-selection, rgb(0 0 255 / 0.3))');
  });
});

// ── the menu ──

/** A surface that places every box where its rect says, and shows every page. */
const surface: EpdfProjectorBinding = {
  projector: signal({
    space: 'overlay' as const,
    toScreen: (_page, rect) => rect,
    toScreenPoint: (_page, at) => at,
    viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
    view: () => ({ x: 0, y: 0, width: 800, height: 600 }),
  }),
  revision: signal(0),
  shownPages: signal(null),
};

describe('<epdf-selection-menu>', () => {
  it('shows its content next to a settled selection, and hides while a drag selects', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    @Component({
      selector: 'test-menu-host',
      imports: [EpdfSelectionMenu],
      providers: [
        provideEmbedPdf({ engine: selectionEngine() }, ...features()),
        { provide: EPDF_PROJECTOR, useValue: surface },
      ],
      template: `
        <epdf-selection-menu placement="bottom">
          <button class="copy">Copy</button>
        </epdf-selection-menu>
      `,
    })
    class MenuHost {}
    const fixture = TestBed.createComponent(MenuHost);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.copy')).toBeNull(); // nothing selected

    const kernel = fixture.debugElement.injector.get(EpdfKernelHost).kernel()!;
    await kernel.documents.open(bytesInput('doc'));
    const selection = fixture.debugElement.injector.get(EpdfSelection);
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    await fixture.whenStable();
    const copy = root.querySelector<HTMLElement>('.copy');
    expect(copy).not.toBeNull();
    // Under the selection's box (y 10 to 20), 8 pixels down.
    expect(copy!.parentElement!.style.top).toBe('28px');

    // A drag that starts selecting hides it until it settles.
    kernel.capability(SelectionHostToken).beginGesture();
    await fixture.whenStable();
    expect(root.querySelector('.copy')).toBeNull();
    kernel.capability(SelectionHostToken).endGesture();
    await fixture.whenStable();
    expect(root.querySelector('.copy')).not.toBeNull();
  });
});
