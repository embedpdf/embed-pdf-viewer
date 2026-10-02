// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { pageTransform } from '@embedpdf/core-geometry';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction';
import { makePageContext, PageProvider, toPageRef } from '../src/runtime';
import {
  SELECTION_DEFAULTS,
  SelectionLayer,
  SelectionToken,
  selectionPlugin,
  selectionState,
  useSelectionSettings,
  useSelectionState,
} from '../src/selection';
import type { SelectionConfig } from '../src/selection';
import { viewerWith } from './counter-plugin';

/**
 * The selection hooks and layer against a real kernel: the declared state, the
 * settings with and without a document, and the highlight painted through its
 * CSS variable, over the `color` setting or the accent when it's unset.
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

async function mount(children: React.ReactNode, config?: SelectionConfig) {
  return viewerWith([interactionPlugin(), selectionPlugin(config)], children, selectionEngine());
}

async function open(kernel: Awaited<ReturnType<typeof mount>>['kernel']) {
  await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
  return kernel.capability(SelectionToken);
}

/** Let the page geometry the selection asked for arrive. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe({ read, renders }: { read: () => unknown; renders: unknown[] }) {
  renders.push(read());
  return null;
}

afterEach(cleanup);

describe('useSelectionState', () => {
  it("has exactly the page's State fields: empty with no document, the selection's once one is open", async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(<Probe read={() => useSelectionState()} renders={renders} />);
    expect(latest(renders)).toBe(selectionState.empty);

    const selection = await open(kernel);
    act(() => selection.select({ page: toPageRef(7), start: 2, count: 3 }));
    await settle();
    expect(latest(renders)).toEqual({
      hasSelection: true,
      isSelecting: false,
      range: { start: { page: toPageRef(7), index: 2 }, end: { page: toPageRef(7), index: 5 } },
      pages: [toPageRef(7)],
    });
  });

  it('re-renders only when a field changes, and with a selector only when its value does', async () => {
    const all: unknown[] = [];
    const selected: unknown[] = [];
    const { kernel } = await mount(
      <>
        <Probe read={() => useSelectionState()} renders={all} />
        <Probe read={() => useSelectionState((state) => state.hasSelection)} renders={selected} />
      </>,
    );
    const selection = await open(kernel);
    act(() => selection.select({ page: toPageRef(5), start: 0, count: 2 }));
    await settle();
    const [allRenders, selectedRenders] = [all.length, selected.length];

    act(() => selection.updateSettings({ color: 'red' })); // wakes readers, no field changes
    act(() => selection.select(selection.getRange()!)); // the same range
    expect(all).toHaveLength(allRenders);

    act(() => selection.select({ page: toPageRef(5), start: 0, count: 4 }));
    expect(all).toHaveLength(allRenders + 1);
    expect(selected).toHaveLength(selectedRenders); // still something selected
  });
});

describe('useSelectionSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(
      <Probe read={() => useSelectionSettings()} renders={renders} />,
      {
        handles: { color: '#e91e63' },
      },
    );
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(renders)).toEqual({
      ...SELECTION_DEFAULTS,
      handles: { ...SELECTION_DEFAULTS.handles, color: '#e91e63' },
    });

    act(() => kernel.settingsOf(SelectionToken).updateSettings({ dragThreshold: 8 }));
    expect(latest(renders)).toMatchObject({ dragThreshold: 8 });

    const selection = await open(kernel);
    expect(selection.getSettings()).toBe(latest(renders));
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

function PageWithLayer({ page }: { page: ReturnType<typeof pageContext> }) {
  return (
    <PageProvider value={page}>
      <div data-testid={`page-${page.ref.objectNumber}`}>
        <SelectionLayer />
      </div>
    </PageProvider>
  );
}

describe('<SelectionLayer>', () => {
  it('paints through its CSS variable, over the accent at 35% or the color setting', async () => {
    const { kernel, rerender } = await mount(null);
    const selection = await open(kernel);
    // A layer renders inside a page, so only once the document is open.
    rerender(<PageWithLayer page={pageContext(5, 0)} />);
    act(() => selection.select({ page: toPageRef(5), start: 1, count: 3 }));
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

    act(() => selection.updateSettings({ color: 'rgb(0 0 255 / 0.3)' }));
    expect(polygons()[0].style.fill).toBe('var(--epdf-text-selection, rgb(0 0 255 / 0.3))');
  });
});
