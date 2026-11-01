/**
 * Page edits on a real engine, with the history: every edit is one step,
 * undo puts the pages back as they were (a deleted page under its old ref, at
 * its old place), redo does the edit again, quick turns add up, the
 * selection follows the pages, and a session without `doc.pages.assemble`
 * can't edit.
 */
import { createKernel, type Engine, type Kernel } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { historyPlugin, HistoryToken, type HistoryCapability } from '@embedpdf/plugin-history';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PageEditToken } from '../src/contract';
import { pageEditPlugin } from '../src/page-edit.plugin';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

// The fixture's two pages: 3 holds annotations and a field, 4 is empty.
const FIRST = toPageRef(3);
const SECOND = toPageRef(4);

async function boot(scope?: readonly string[]) {
  const kernel = createKernel({ engine, plugins: [pageEditPlugin(), historyPlugin()] });
  await kernel.documents.open(
    { kind: 'bytes', id: `page-edit-${Math.random()}`, bytes: CHANGE_FIXTURE_PDF.slice() },
    scope ? ({ scope } as never) : undefined,
  );
  return {
    kernel,
    pageEdit: kernel.capability(PageEditToken),
    history: kernel.capability(HistoryToken),
  };
}

/** The pages in display order, by object number. */
const orderOf = (kernel: Kernel) =>
  kernel.documents.listPages().map((page) => page.ref.objectNumber);
const rotationsOf = (kernel: Kernel) => kernel.documents.listPages().map((page) => page.rotation);

/** Undo (or redo) the last step and wait for the engine's answer. */
function step(history: HistoryCapability, redo = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = history.onUndone(() => {
      done();
      failed();
      resolve();
    });
    const failed = history.onUndoFailed((event) => {
      done();
      failed();
      reject(event.error);
    });
    if (redo) history.redo();
    else history.undo();
  });
}

describe('page edits are steps of the history', () => {
  it('two quick quarter turns are a half turn, and undo takes back one at a time', async () => {
    const { kernel, pageEdit, history } = await boot();
    await Promise.all([pageEdit.rotateBy([FIRST], 90), pageEdit.rotateBy([FIRST], 90)]);
    expect(rotationsOf(kernel)).toEqual([180, 0]);
    expect(history.getUndoLabel()).toEqual({ key: 'pages.rotate', count: 1 });
    await step(history);
    expect(rotationsOf(kernel)).toEqual([90, 0]);
    // A turn right after an undo starts from where the undo leaves the page.
    await pageEdit.rotateBy([FIRST, SECOND], -90);
    expect(rotationsOf(kernel)).toEqual([0, 270]);
    await step(history);
    expect(rotationsOf(kernel)).toEqual([90, 0]);
    await step(history, true);
    expect(rotationsOf(kernel)).toEqual([0, 270]);
    await kernel.destroy();
  });

  it('undo of a delete brings the page back under its ref, at its place, selected again', async () => {
    const { kernel, pageEdit, history } = await boot();
    pageEdit.select([FIRST]);
    await pageEdit.delete([FIRST]);
    expect(orderOf(kernel)).toEqual([4]);
    // A page that went leaves the selection.
    expect(pageEdit.getSelected()).toEqual([]);
    expect(history.getUndoLabel()).toEqual({ key: 'pages.delete', count: 1 });
    await step(history);
    expect(orderOf(kernel)).toEqual([3, 4]);
    expect(pageEdit.getSelected()).toEqual([FIRST]);
    await step(history, true);
    expect(orderOf(kernel)).toEqual([4]);
    await kernel.destroy();
  });

  it('undo of a move puts the pages back where they were', async () => {
    const { kernel, pageEdit, history } = await boot();
    await pageEdit.reorder([FIRST], 'end');
    expect(orderOf(kernel)).toEqual([4, 3]);
    expect(history.getUndoLabel()).toEqual({ key: 'pages.reorder', count: 1 });
    await step(history);
    expect(orderOf(kernel)).toEqual([3, 4]);
    await kernel.destroy();
  });

  it('undo of an insert or a duplicate removes the new pages; redo brings them back', async () => {
    const { kernel, pageEdit, history } = await boot();
    const { pages: blank } = await pageEdit.insertBlank({ position: { after: FIRST }, count: 2 });
    expect(orderOf(kernel)).toEqual([3, ...blank.map((page) => page.objectNumber), 4]);
    expect(kernel.documents.listPages()[1]!.size).toEqual({ width: 300, height: 300 });
    expect(history.getUndoLabel()).toEqual({ key: 'pages.insertBlank', count: 2 });
    await step(history);
    expect(orderOf(kernel)).toEqual([3, 4]);
    await step(history, true);
    expect(orderOf(kernel)).toEqual([3, ...blank.map((page) => page.objectNumber), 4]);
    await step(history);

    const { pages: copies } = await pageEdit.duplicate([SECOND]);
    expect(copies).toHaveLength(1);
    expect(orderOf(kernel)).toEqual([3, 4, copies[0]!.objectNumber]);
    expect(history.getUndoLabel()).toEqual({ key: 'pages.duplicate', count: 1 });
    await step(history);
    expect(orderOf(kernel)).toEqual([3, 4]);
    await kernel.destroy();
  });

  it('a session without doc.pages.assemble reads the pages but cannot edit them', async () => {
    const { kernel, pageEdit, history } = await boot(['doc.open', 'doc.render']);
    expect(pageEdit.canEdit()).toBe(false);
    await expect(pageEdit.rotateBy([FIRST], 90)).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'doc.pages.assemble',
    });
    expect(history.canUndo()).toBe(false);
    expect(orderOf(kernel)).toEqual([3, 4]);
    await kernel.destroy();
  });
});
