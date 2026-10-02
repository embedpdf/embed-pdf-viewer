import { h, shallowRef } from 'vue';
import type { Component } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { pageTransform } from '@embedpdf/core-geometry';
import type { CapabilityToken, DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/contract/host';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { resetDevWarnings } from '../src/dev';
import { interactionPlugin } from '../src/interaction';
import { PageView } from '../src/page-view';
import { DocumentGate, makePageContext, providePage, toPageRef } from '../src/runtime';
import {
  SELECTION_DEFAULTS,
  SelectionHandles,
  SelectionLayer,
  SelectionMenu,
  SelectionToken,
  selectionPlugin,
  selectionState,
  useSelectionSettings,
  useSelectionState,
} from '../src/selection';
import type { SelectionConfig } from '../src/selection';
import { Stage, StageToken, stagePlugin } from '../src/stage';
import { probe, settle as flush, viewerWith } from './counter-plugin';

/**
 * The selection composables and components against a real kernel: the
 * declared state, the settings with and without a document, the highlight
 * painted through its CSS variable (over the `color` setting, or the accent
 * when it's unset), the menu on a page view, and the grips on a Stage.
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

async function mount(
  content: () => ReturnType<typeof h> | ReturnType<typeof h>[] | null,
  config?: SelectionConfig,
) {
  return viewerWith([interactionPlugin(), selectionPlugin(config)], content, selectionEngine());
}

async function open(kernel: Awaited<ReturnType<typeof mount>>['kernel']) {
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  await flush();
  return kernel.capability(SelectionToken);
}

/** Let the page geometry the selection asked for arrive, then let Vue render. */
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flush();
};

const latest = (renders: unknown[]) => renders[renders.length - 1];

/** A component that records what `read` gives each time it renders. */
const recorder = (read: () => () => unknown, renders: unknown[]): Component =>
  probe(() => {
    const value = read();
    return () => {
      renders.push(value());
      return null;
    };
  });

/** Every field of a state or settings composable's refs, read in one render. */
const allFields = (fields: Record<string, { value: unknown }>) => () =>
  Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

describe('useSelectionState', () => {
  it("has exactly the page's State fields: empty with no document, the selection's once one is open", async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(() =>
      h(recorder(() => allFields(useSelectionState()), renders)),
    );
    expect(latest(renders)).toEqual(selectionState.empty);

    const selection = await open(kernel);
    selection.select({ page: toPageRef(7), start: 2, count: 3 });
    await settle();
    expect(latest(renders)).toEqual({
      hasSelection: true,
      isSelecting: false,
      range: { start: { page: toPageRef(7), index: 2 }, end: { page: toPageRef(7), index: 5 } },
      pages: [toPageRef(7)],
    });
  });

  it('updates only when a field changes, and with a selector only when its value does', async () => {
    const all: unknown[] = [];
    const selected: unknown[] = [];
    const { kernel } = await mount(() => [
      h(recorder(() => allFields(useSelectionState()), all)),
      h(
        recorder(() => {
          const hasSelection = useSelectionState((state) => state.hasSelection);
          return () => hasSelection.value;
        }, selected),
      ),
    ]);
    const selection = await open(kernel);
    selection.select({ page: toPageRef(5), start: 0, count: 2 });
    await settle();
    const [allRenders, selectedRenders] = [all.length, selected.length];

    selection.updateSettings({ color: 'red' }); // wakes readers, no field changes
    selection.select(selection.getRange()!); // the same range
    await settle();
    expect(all).toHaveLength(allRenders);

    selection.select({ page: toPageRef(5), start: 0, count: 4 });
    await settle();
    expect(all).toHaveLength(allRenders + 1);
    expect(selected).toHaveLength(selectedRenders); // still something selected
  });
});

describe('useSelectionSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(
      () => h(recorder(() => allFields(useSelectionSettings()), renders)),
      { handles: { color: '#e91e63' } },
    );
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(renders)).toEqual({
      ...SELECTION_DEFAULTS,
      handles: { ...SELECTION_DEFAULTS.handles, color: '#e91e63' },
    });

    kernel.settingsOf(SelectionToken).updateSettings({ dragThreshold: 8 });
    await flush();
    expect(latest(renders)).toMatchObject({ dragThreshold: 8 });

    const selection = await open(kernel);
    expect(selection.getSettings()).toEqual(latest(renders));
  });
});

// ── the layer ──

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };
const pageContext = (objectNumber: number, index: number) =>
  makePageContext(
    'doc',
    'test-view',
    toPageRef(objectNumber),
    index,
    NO_FRAME,
    pageTransform({ pageSize: { width: 600, height: 800 }, rotation: 0, scale: 1, dpr: 1 }),
    () => ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 }) as DOMRect,
  );

const pageWithLayer = (objectNumber: number, index: number) =>
  h(
    probe(() => {
      providePage(shallowRef(pageContext(objectNumber, index)));
      return () => h('div', { 'data-testid': `page-${objectNumber}` }, h(SelectionLayer));
    }),
  );

describe('<SelectionLayer>', () => {
  it('paints through its CSS variable, over the accent at 35% or the color setting', async () => {
    const { kernel } = await mount(() => pageWithLayer(5, 0));
    const selection = await open(kernel);
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    const polygons = () => [
      ...document.querySelectorAll<SVGPolygonElement>('[data-testid="page-5"] polygon'),
    ];
    expect(polygons()).toHaveLength(1);
    // The fill goes in `style`: an SVG attribute doesn't read var().
    expect(polygons()[0].getAttribute('fill')).toBeNull();
    expect(polygons()[0].style.fill).toBe(
      'var(--epdf-text-selection, color-mix(in srgb, var(--epdf-accent, #3858e9) 35%, transparent))',
    );

    selection.updateSettings({ color: 'rgb(0 0 255 / 0.3)' });
    await flush();
    expect(polygons()[0].style.fill).toBe('var(--epdf-text-selection, rgb(0 0 255 / 0.3))');
  });
});

describe('<SelectionMenu>', () => {
  it('floats over the selection on a <PageView>, out of its box, and hides while someone selects', async () => {
    // The window a page view places menus in: happy-dom lays nothing out, so it has no size.
    const root = document.documentElement;
    vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(1024);
    vi.spyOn(root, 'clientHeight', 'get').mockReturnValue(768);
    const { kernel } = await mount(() =>
      h(PageView, { page: 0, width: 300 }, () => [
        h(SelectionLayer),
        h(SelectionMenu, null, () => h('button', { class: 'copy' }, 'Copy')),
      ]),
    );
    const selection = await open(kernel);
    const menu = () => document.querySelector<HTMLElement>('.copy');
    expect(menu()).toBeNull(); // nothing selected

    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    await flush(); // the page view's projection measures once its page is in the document
    // A page view has no camera: the menu is placed on the window, out of reach of the
    // page view's own box.
    expect(menu()?.parentElement?.parentElement).toBe(document.body);
    expect(menu()?.parentElement?.style.position).toBe('fixed');

    kernel.capability(SelectionHostToken).beginGesture(); // a drag begins
    await flush();
    expect(menu()).toBeNull();
  });
});

describe('<SelectionHandles>', () => {
  it("in a Stage's overlay, draws a grip at each end and hides them while someone drags", async () => {
    const { kernel } = await viewerWith(
      [stagePlugin(), interactionPlugin(), selectionPlugin()],
      () =>
        h(DocumentGate, null, () =>
          h(Stage, null, { page: () => h(SelectionLayer), overlay: () => h(SelectionHandles) }),
        ),
      selectionEngine(),
    );
    const selection = await open(kernel);
    kernel
      .capability(StageToken as unknown as CapabilityToken<StageHostCapability>)
      .setViewportSize({ width: 800, height: 600 });
    await settle();
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    const grips = () =>
      [...document.querySelectorAll<HTMLElement>('div')].filter(
        (element) => element.style.cursor === 'grab',
      );
    expect(grips()).toHaveLength(2);
    // Upright text: the grip carries no transform.
    expect(grips()[0].style.transform).toBe('');

    kernel.capability(SelectionHostToken).beginGesture(); // a pointer drag selects
    await flush();
    expect(grips()).toHaveLength(0);
  });

  it('outside a Stage says so once, and draws nothing', async () => {
    resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { kernel } = await mount(() =>
      h(PageView, { page: 0 }, () => [h(SelectionLayer), h(SelectionHandles)]),
    );
    const selection = await open(kernel);
    selection.select({ page: toPageRef(5), start: 1, count: 3 });
    await settle();
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('<SelectionHandles> renders nothing here'),
    ]);
    expect(document.querySelector('[style*="grab"]')).toBeNull();
  });
});
