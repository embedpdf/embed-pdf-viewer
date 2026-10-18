import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import {
  OutlineToken,
  outlinePlugin,
  outlineState,
  useOutline,
  useOutlineState,
  type OutlineItem,
} from '../../src/outline';
import type { CurrentValue } from '../../src/runtime';
import { bytesInput, testPage } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The outline readers against a real kernel: the declared state as a reactive object (empty
 * without a document, loaded by being read), a selector, and the API before a document opens.
 */

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

const outlineEngine = {
  open: (input: { id?: string }) =>
    Promise.resolve({
      id: input.id ?? 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [testPage] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      outline: { get: () => Promise.resolve({ items: ITEMS, incomplete: false }) },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const plugins = [outlinePlugin()];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('useOutlineState', () => {
  it("has the page's State fields: empty with no document, the document's once read", async () => {
    const state = probe(
      () => useOutlineState(),
      (record) => ({ ...record }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [state] }, outlineEngine);
    expect(latest(state.seen)).toEqual(outlineState.empty);

    // Nothing reads the outline as the document opens: the reader's reading it loads it.
    await kernel.documents.open(bytesInput('doc'));
    await vi.waitFor(() => expect(kernel.capability(OutlineToken).getStatus()).toBe('ready'));
    flushSync();
    const seen = latest(state.seen) as ReturnType<typeof outlineState.read>;
    expect(seen.rows.map((row) => [row.item.title, row.depth])).toEqual([
      ['Chapter', 0],
      ['Section', 1],
      ['Appendix', 0],
    ]);
    expect(seen).toMatchObject({ current: null, status: 'ready', canEdit: true });
  });

  it('with a selector, gives { current } that follows the value it picks', async () => {
    const counts = probe(
      () => useOutlineState((state) => state.rows.length),
      (count: CurrentValue<number>) => count.current,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [counts] }, outlineEngine);
    await kernel.documents.open(bytesInput('doc'));
    await vi.waitFor(() => expect(kernel.capability(OutlineToken).getStatus()).toBe('ready'));
    flushSync();
    expect(latest(counts.seen)).toBe(3);
    kernel.capability(OutlineToken).collapseAll();
    flushSync();
    expect(latest(counts.seen)).toBe(2);
  });
});

describe('useOutline before a document opens', () => {
  it('a verb called too early says no document is open', async () => {
    const found: { outline?: ReturnType<typeof useOutline> } = {};
    const capture = probe(
      () => (found.outline = useOutline()),
      () => null,
    );
    await viewerWith(plugins, Probes, { probes: [capture] }, outlineEngine);
    expect(() => found.outline!.canEdit()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    await expect(found.outline!.create({ title: 'x' })).rejects.toMatchObject({
      code: 'not-ready',
    });
  });
});
