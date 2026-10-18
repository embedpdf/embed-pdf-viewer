/**
 * The outline on a real engine, with the history: the outline is read when
 * asked for, every write shows at once and is one step of the history, its
 * answer is what it showed, an undo draws what it brings back before the
 * engine answers, a refused change leaves at once, and a session without
 * `doc.outline.modify` reads but can't write.
 */
import { createKernel, isPluginError, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { OUTLINE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import { toOutlineItemRef, toPageRef } from '@embedpdf/engine-core/runtime';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OutlineToken, type OutlineCapability, type OutlineChangedEvent } from '../src/contract';
import { outlinePlugin } from '../src/outline.plugin';
import { gate } from './helpers/gate';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

// The fixture: A (open) with A1; B; C (closed) with C1; D.
const A = toOutlineItemRef(6);
const B = toOutlineItemRef(7);
const C = toOutlineItemRef(8);
const D = toOutlineItemRef(9);
const A1 = toOutlineItemRef(10);
const C1 = toOutlineItemRef(11);
const ALL = ['A', 'A1', 'B', 'C', 'C1', 'D'];

async function boot(scope?: readonly string[]) {
  const gated = gate(engine);
  const kernel = createKernel({
    engine: gated.engine,
    plugins: [outlinePlugin(), historyPlugin()],
  });
  await kernel.documents.open(
    { kind: 'bytes', id: `outline-${Math.random()}`, bytes: OUTLINE_FIXTURE_PDF.slice() },
    scope ? ({ scope } as never) : undefined,
  );
  const outline = kernel.capability(OutlineToken);
  const history = kernel.capability(HistoryToken);
  await outline.ensureLoaded();
  return { kernel, gated, outline, history };
}

const titlesOf = (outline: OutlineCapability) => outline.list().map((item) => item.title);
const rowsOf = (outline: OutlineCapability) => outline.listRows().map((row) => row.item.title);

describe('reading', () => {
  it('reads when asked, and starts expanded where the file opens items', async () => {
    const gated = gate(engine);
    const kernel = createKernel({ engine: gated.engine, plugins: [outlinePlugin()] });
    await kernel.documents.open({
      kind: 'bytes',
      id: `outline-${Math.random()}`,
      bytes: OUTLINE_FIXTURE_PDF.slice(),
    });
    const outline = kernel.capability(OutlineToken);
    expect(outline.getStatus()).toBe('idle');
    expect(outline.list()).toEqual([]);
    await outline.ensureLoaded();
    expect(outline.getStatus()).toBe('ready');
    expect(titlesOf(outline)).toEqual(ALL);
    expect(rowsOf(outline)).toEqual(['A', 'A1', 'B', 'C', 'D']);
    outline.toggle(C);
    expect(rowsOf(outline)).toEqual(ALL);
    outline.collapseAll();
    expect(rowsOf(outline)).toEqual(['A', 'B', 'C', 'D']);
    expect(outline.getChildren(C).map((item) => item.title)).toEqual(['C1']);
    await kernel.destroy();
  });
});

describe('writes', () => {
  it('shows a create at once under the number it keeps, and answers what it showed', async () => {
    const { kernel, gated, outline, history } = await boot();
    gated.holding = true;
    const target = {
      kind: 'goto',
      destination: { kind: 'xyz', page: toPageRef(4), x: 10, y: 40, zoom: null },
    } as const;
    const pending = outline.create(
      { title: 'New', parent: C, position: 'start', target, color: '#00AAFF' },
      { select: true },
    );
    await vi.waitFor(() => expect(gated.held).toHaveLength(1));
    expect(titlesOf(outline)).toEqual(['A', 'A1', 'B', 'C', 'New', 'C1', 'D']);
    const [ref] = outline.getSelected();
    // Selecting it expanded what it sits under, so its row shows.
    expect(rowsOf(outline)).toContain('New');
    const shown = outline.get(ref!);
    await gated.release();
    const { item } = await pending;
    expect(item).toEqual(shown);
    expect(outline.get(ref!)).toEqual(shown);
    expect(history.getUndoLabel()).toEqual({ key: 'outline.create' });
    await kernel.destroy();
  });

  it('takes a refused change away at once', async () => {
    const { kernel, gated, outline } = await boot();
    gated.holding = true;
    const pending = outline.update(B, { title: 'Bee' });
    await vi.waitFor(() => expect(gated.held).toHaveLength(1));
    expect(outline.get(B)?.title).toBe('Bee');
    gated.refuse(new Error('refused'));
    await expect(pending).rejects.toSatisfy((error: unknown) => isPluginError(error));
    expect(outline.get(B)?.title).toBe('B');
    await kernel.destroy();
  });

  it('deletes the items under an item with it, as one step an undo draws back at once', async () => {
    const { kernel, gated, outline, history } = await boot();
    await outline.delete([C1, C]);
    expect(titlesOf(outline)).toEqual(['A', 'A1', 'B', 'D']);
    expect(history.getUndoLabel()).toEqual({ key: 'outline.delete', count: 1 });

    gated.holding = true;
    history.undo();
    expect(titlesOf(outline)).toEqual(ALL);
    await gated.release();
    expect(titlesOf(outline)).toEqual(ALL);
    expect(outline.get(C1)?.parent).toEqual(C);

    history.redo();
    expect(titlesOf(outline)).toEqual(['A', 'A1', 'B', 'D']);
    await gated.release();
    expect(titlesOf(outline)).toEqual(['A', 'A1', 'B', 'D']);
    await kernel.destroy();
  });

  it('shows a move at once, and its undo puts each item back before the answer', async () => {
    const { kernel, gated, outline, history } = await boot();
    await outline.move([C, D], A, { after: A1 });
    expect(titlesOf(outline)).toEqual(['A', 'A1', 'C', 'C1', 'D', 'B']);
    expect(outline.get(D)?.parent).toEqual(A);

    gated.holding = true;
    history.undo();
    expect(titlesOf(outline)).toEqual(ALL);
    expect(outline.get(D)?.parent).toBeNull();
    await gated.release();
    expect(titlesOf(outline)).toEqual(ALL);
    await kernel.destroy();
  });

  it('draws an undone update with every field as it was', async () => {
    const { kernel, gated, outline, history } = await boot();
    const before = outline.get(B);
    await outline.update(B, { title: 'Bee', target: null, color: null, italic: true });
    expect(outline.get(B)).toMatchObject({ title: 'Bee', target: null, action: null, color: null });
    gated.holding = true;
    history.undo();
    expect(outline.get(B)).toEqual(before);
    await gated.release();
    expect(outline.get(B)).toEqual(before);
    await kernel.destroy();
  });

  it('announces each confirmed change once, with its origin; a read announces a resync', async () => {
    const { kernel, outline } = await boot();
    const changes: OutlineChangedEvent[] = [];
    let resyncs = 0;
    outline.onChanged((event) => changes.push(event));
    outline.onResynced(() => (resyncs += 1));
    await outline.update(B, { bold: false });
    await outline.move([D], null, 'start');
    await outline.refresh();
    expect(changes.map((event) => [event.type, event.items, event.origin.kind])).toEqual([
      ['updated', [B], 'local'],
      ['moved', [D], 'local'],
    ]);
    expect(resyncs).toBe(1);
    await kernel.destroy();
  });
});

describe('permissions', () => {
  it('reads without doc.outline.modify, and refuses every write without changing anything', async () => {
    const { kernel, outline, history } = await boot(['doc.open', 'doc.render']);
    expect(titlesOf(outline)).toEqual(ALL);
    expect(outline.canEdit()).toBe(false);
    const refused = (error: unknown) => isPluginError(error, 'permission-denied');
    await expect(outline.create({ title: 'x' })).rejects.toSatisfy(refused);
    await expect(outline.update(B, { title: 'x' })).rejects.toSatisfy(refused);
    await expect(outline.move([B], null, 'start')).rejects.toSatisfy(refused);
    await expect(outline.delete([B])).rejects.toSatisfy(refused);
    expect(titlesOf(outline)).toEqual(ALL);
    expect(history.canUndo()).toBe(false);
    await kernel.destroy();
  });
});
