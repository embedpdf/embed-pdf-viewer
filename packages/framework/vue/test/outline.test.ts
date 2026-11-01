import { h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
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
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * The outline composables against a real kernel: the declared state as refs,
 * empty with no document and loaded by being read, and the API outside a
 * document.
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
      pages: { list: () => Promise.resolve({ pageCount: 1, labels: [], pages: [page] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      outline: { get: () => Promise.resolve({ items: ITEMS, incomplete: false }) },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const latest = <Value>(values: Value[]) => values[values.length - 1];

enableAutoUnmount(afterEach);

describe('useOutlineState', () => {
  it("has the page's State fields as refs: empty with no document, the document's once read", async () => {
    const states: unknown[] = [];
    const Probe = probe(() => {
      const { items, rows, current, selected, status, incomplete, canEdit } = useOutlineState();
      return () => {
        states.push({
          items: items.value,
          rows: rows.value,
          current: current.value,
          selected: selected.value,
          status: status.value,
          incomplete: incomplete.value,
          canEdit: canEdit.value,
        });
        return null;
      };
    });
    const { kernel } = await viewerWith([outlinePlugin()], () => h(Probe), engine);
    expect(latest(states)).toEqual(outlineState.empty);

    // Nothing reads the outline as the document opens: the composable's reading it loads it.
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await vi.waitFor(() => expect(kernel.capability(OutlineToken).getStatus()).toBe('ready'));
    await settle();
    const state = latest(states) as OutlineState;
    expect(state.rows.map((row) => [row.item.title, row.depth])).toEqual([
      ['Chapter', 0],
      ['Section', 1],
      ['Appendix', 0],
    ]);
    expect(state).toMatchObject({ current: null, status: 'ready', canEdit: true });
  });

  it('with a selector, is one ref that follows the value it picks', async () => {
    const counts: number[] = [];
    const Probe = probe(() => {
      const count = useOutlineState((state) => state.rows.length);
      return () => {
        counts.push(count.value);
        return null;
      };
    });
    const { kernel } = await viewerWith([outlinePlugin()], () => h(Probe), engine);
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await vi.waitFor(() => expect(kernel.capability(OutlineToken).getStatus()).toBe('ready'));
    await settle();
    expect(latest(counts)).toBe(3);
    kernel.capability(OutlineToken).collapseAll();
    await settle();
    expect(latest(counts)).toBe(2);
  });
});

describe('useOutline outside a document', () => {
  it('reads, and a verb called too early says no document is open', async () => {
    const found: { outline?: ReturnType<typeof useOutline> } = {};
    const Capture = probe(() => {
      found.outline = useOutline();
    });
    await viewerWith([outlinePlugin()], () => h(Capture), engine);
    expect(() => found.outline!.canEdit()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    await expect(found.outline!.create({ title: 'x' })).rejects.toMatchObject({
      code: 'not-ready',
    });
  });
});
