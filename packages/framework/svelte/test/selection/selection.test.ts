import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import type { CapabilityToken, DocumentHandle, Engine, Kernel, PageLayout } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { interactionPlugin } from '../../src/interaction';
import { StageToken, stagePlugin } from '../../src/stage';
import { toPageRef } from '../../src/runtime';
import type { CurrentValue } from '../../src/runtime';
import {
  SELECTION_DEFAULTS,
  SelectionLayer,
  SelectionToken,
  selectionPlugin,
  selectionState,
  useSelectionSettings,
  useSelectionState,
} from '../../src/selection';
import type { SelectionConfig } from '../../src/selection';
import LayerPages from '../fixtures/LayerPages.svelte';
import { pageContext } from '../fixtures/page-context';
import Probes from '../fixtures/Probes.svelte';
import SelectionPageView from '../fixtures/SelectionPageView.svelte';
import SelectionStage from '../fixtures/SelectionStage.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The selection readers and components against a real kernel: the declared state, the settings
 * with and without a document, the highlight painted through its CSS variable (over the `color`
 * setting, or the accent when it's unset), the menu over a settled selection in a `<PageView>`,
 * and the handles in a Stage's overlay, whose press never reaches the Stage.
 */

const box = { x: 0, y: 0, width: 600, height: 800 };
const pageLayout = (objectNumber: number, index: number): PageLayout => ({
  index,
  ref: toPageRef(objectNumber),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
});

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

const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => ({
  read,
  pick: pick as (result: unknown) => unknown,
  seen: [] as unknown[],
});
const whole = <T extends object>(record: T) => ({ ...record });
const current = <T>(value: CurrentValue<T>) => value.current;

function mountProbes(probes: ReturnType<typeof probe>[], config?: SelectionConfig) {
  return viewerWith(
    [interactionPlugin(), selectionPlugin(config)],
    Probes,
    { probes },
    selectionEngine(),
  );
}

async function open(kernel: Kernel) {
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  flushSync();
  return kernel.capability(SelectionToken);
}

/** Let the page geometry the selection asked for arrive. */
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
};

describe('useSelectionState', () => {
  it("has exactly the page's State fields: empty with no document, the selection's once one is open", async () => {
    const state = probe(() => useSelectionState(), whole);
    const { kernel } = await mountProbes([state]);
    expect(latest(state.seen)).toEqual(selectionState.empty);

    const selection = await open(kernel);
    selection.select({ page: toPageRef(7), start: 2, count: 3 });
    await settle();
    expect(latest(state.seen)).toEqual({
      hasSelection: true,
      isSelecting: false,
      range: { start: { page: toPageRef(7), index: 2 }, end: { page: toPageRef(7), index: 5 } },
      pages: [toPageRef(7)],
    });
  });

  it('wakes a reaction only when a field changes, and with a selector only when its value does', async () => {
    const all = probe(() => useSelectionState(), whole);
    const selected = probe(
      () => useSelectionState((selectionState) => selectionState.hasSelection),
      current,
    );
    const { kernel } = await mountProbes([all, selected]);
    const selection = await open(kernel);
    selection.select({ page: toPageRef(5), start: 0, count: 2 });
    await settle();
    const [allRuns, selectedRuns] = [all.seen.length, selected.seen.length];

    selection.updateSettings({ color: 'red' }); // wakes readers, no field changes
    selection.select(selection.getRange()!); // the same range
    flushSync();
    expect(all.seen).toHaveLength(allRuns);

    selection.select({ page: toPageRef(5), start: 0, count: 4 });
    flushSync();
    expect(all.seen).toHaveLength(allRuns + 1);
    expect(selected.seen).toHaveLength(selectedRuns); // still something selected
  });
});

describe('useSelectionSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const settings = probe(() => useSelectionSettings(), whole);
    const { kernel } = await mountProbes([settings], { handles: { color: '#e91e63' } });
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(settings.seen)).toEqual({
      ...SELECTION_DEFAULTS,
      handles: { ...SELECTION_DEFAULTS.handles, color: '#e91e63' },
    });

    kernel.settingsOf(SelectionToken).updateSettings({ dragThreshold: 8 });
    flushSync();
    expect(latest(settings.seen)).toMatchObject({ dragThreshold: 8 });

    const selection = await open(kernel);
    expect(selection.getSettings()).toEqual(latest(settings.seen));
  });
});

describe('<SelectionLayer>', () => {
  it('paints through its CSS variable, over the accent at 35% or the color setting', async () => {
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), selectionPlugin()],
      LayerPages,
      { pages: [pageContext(5, 0)], layer: SelectionLayer },
      selectionEngine(),
    );
    const selection = await open(kernel);
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    const polygons = () => [
      ...view.container.querySelectorAll<SVGPolygonElement>('[data-testid="page-5"] polygon'),
    ];
    expect(polygons()).toHaveLength(1);
    // The fill goes in `style`: an SVG attribute doesn't read var().
    expect(polygons()[0]!.getAttribute('fill')).toBeNull();
    expect(polygons()[0]!.style.fill).toBe(
      'var(--epdf-text-selection, color-mix(in srgb, var(--epdf-accent, #3858e9) 35%, transparent))',
    );

    selection.updateSettings({ color: 'rgb(0 0 255 / 0.3)' });
    flushSync();
    expect(polygons()[0]!.style.fill).toBe('var(--epdf-text-selection, rgb(0 0 255 / 0.3))');
  });
});

describe('<SelectionMenu>', () => {
  // happy-dom lays nothing out: give the window a size, so the page is in view.
  beforeEach(() => {
    const root = document.documentElement;
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 1024 });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 768 });
  });
  afterEach(() => {
    const root = document.documentElement as unknown as Record<string, unknown>;
    delete root.clientWidth;
    delete root.clientHeight;
  });

  it('shows over a settled selection in a <PageView>, on the body, where nothing clips it', async () => {
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), selectionPlugin()],
      SelectionPageView,
      {},
      selectionEngine(),
    );
    const selection = await open(kernel);
    const menu = () => document.body.querySelector<HTMLElement>('.menu');
    expect(menu()).toBeNull();

    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    expect(menu()).not.toBeNull();
    // Portalled out of the page view, and placed in client space.
    expect(view.container.contains(menu())).toBe(false);
    expect(menu()!.parentElement!.style.position).toBe('fixed');

    selection.clear();
    flushSync();
    expect(menu()).toBeNull();
  });
});

describe('<SelectionHandles>', () => {
  it('draws a handle at each end of the selection, and a press on one never reaches the Stage', async () => {
    const { kernel, view } = await viewerWith(
      [stagePlugin(), interactionPlugin(), selectionPlugin()],
      SelectionStage,
      {},
      selectionEngine(),
    );
    const selection = await open(kernel);
    kernel
      .capability(StageToken as unknown as CapabilityToken<StageHostCapability>)
      .setViewportSize({ width: 800, height: 600 });
    flushSync();
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    const handles = () => [
      ...view.container.querySelectorAll<HTMLElement>('.stage [style*="cursor: grab"]'),
    ];
    expect(handles()).toHaveLength(2);

    const stagePresses: Event[] = [];
    view.container
      .querySelector('.stage')!
      .addEventListener('pointerdown', (event) => stagePresses.push(event));
    await fireEvent.pointerDown(handles()[0]!, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(stagePresses).toHaveLength(0);
  });
});
