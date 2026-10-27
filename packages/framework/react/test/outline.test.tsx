// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { toPageRef } from '../src/runtime';
import {
  outlinePlugin,
  outlineState,
  type OutlineState,
  OutlineToken,
  useOutline,
  useOutlineState,
  type OutlineItem,
} from '../src/outline';
import { viewerWith } from './counter-plugin';

/**
 * The outline hooks against a real kernel: the declared state, empty with no
 * document and loaded by being read, and the capability outside a document.
 */

const box = { x: 0, y: 0, width: 600, height: 800 };
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  tabOrder: null,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
};

const item = (objectNumber: number, title: string, parent: number | null, open = false) =>
  ({
    ref: { kind: 'objectNumber', objectNumber },
    parent: parent === null ? null : { kind: 'objectNumber', objectNumber: parent },
    title,
    target: null,
    action: null,
    open,
    color: null,
    bold: false,
    italic: false,
  }) satisfies OutlineItem;

/** Chapter (open) with Section; Appendix. */
const ITEMS = [item(5, 'Chapter', null, true), item(6, 'Section', 5), item(7, 'Appendix', null)];

const engine = {
  open: () =>
    Promise.resolve({
      id: 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      outline: { get: () => Promise.resolve({ items: ITEMS, incomplete: false }) },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe({ read, renders }: { read: () => unknown; renders: unknown[] }) {
  renders.push(read());
  return null;
}

afterEach(cleanup);

describe('useOutlineState', () => {
  it("has the page's State fields: empty with no document, the document's once read", async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      [outlinePlugin()],
      <Probe read={() => useOutlineState()} renders={renders} />,
      engine,
    );
    expect(latest(renders)).toBe(outlineState.empty);

    // Nothing reads the outline as the document opens: the hook's reading it loads it.
    await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
    await waitFor(() => expect(kernel.capability(OutlineToken).getStatus()).toBe('ready'));
    const state = latest(renders) as OutlineState;
    expect(state.items.map((each) => each.title)).toEqual(['Chapter', 'Section', 'Appendix']);
    // The file opens Chapter, so its section's row shows.
    expect(state.rows.map((row) => [row.item.title, row.depth])).toEqual([
      ['Chapter', 0],
      ['Section', 1],
      ['Appendix', 0],
    ]);
    expect(state).toMatchObject({ current: null, selected: [], status: 'ready', canEdit: true });
  });

  it('picks one value with a selector', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      [outlinePlugin()],
      <Probe read={() => useOutlineState((state) => state.rows.length)} renders={renders} />,
      engine,
    );
    await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
    await waitFor(() => expect(latest(renders)).toBe(3));
    act(() => kernel.capability(OutlineToken).collapseAll());
    expect(latest(renders)).toBe(2);
  });
});

describe('useOutline outside a document', () => {
  it('renders, and a verb called too early says no document is open', async () => {
    const captured: { outline?: ReturnType<typeof useOutline> } = {};
    function Capture() {
      captured.outline = useOutline();
      return null;
    }
    await viewerWith([outlinePlugin()], <Capture />, engine);
    const outline = captured.outline!;
    expect(() => outline.canEdit()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    await expect(outline.create({ title: 'x' })).rejects.toMatchObject({ code: 'not-ready' });
  });
});
