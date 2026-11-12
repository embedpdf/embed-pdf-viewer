/**
 * The controller against the real local engine, with no DOM: a document opens, its pages,
 * search, outline, zoom, undo and download all reach the snapshot through the plugins' own
 * capabilities, and the snapshot keeps its identity while nothing in it changes.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import { OutlineToken } from '@embedpdf/plugin-outline';
import { stagePlugin } from '@embedpdf/plugin-stage';
import { createViewer, type OwnedViewerController, type ViewerState } from '../src/controller';

const fixture = fileURLToPath(
  new URL('../../../engine/main/test/fixtures/hello_world.pdf', import.meta.url),
);

let viewer: OwnedViewerController | null = null;
afterEach(async () => {
  await viewer?.destroy();
  viewer = null;
});

async function until(predicate: (state: ViewerState) => boolean, what: string) {
  const deadline = Date.now() + 10_000;
  while (!predicate(viewer!.getState())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return viewer!.getState();
}

async function open(plugins?: Parameters<typeof createViewer>[0]['plugins']) {
  const bytes = new Uint8Array(await readFile(fixture));
  viewer = createViewer({
    engine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
    src: { kind: 'bytes', id: 'hello', bytes },
    plugins,
  });
  await viewer.ready;
  return until((state) => state.status === 'ready', 'the document');
}

describe('createViewer (local engine, headless)', { timeout: 30_000 }, () => {
  it('opens a document and reads its pages', async () => {
    const state = await open();
    expect(state).toMatchObject({
      documentId: 'hello',
      pageCount: 1,
      pageIndex: 0,
      canGoNext: false,
      canGoPrevious: false,
      dirty: false,
      error: null,
    });
    expect(viewer!.getState()).toBe(viewer!.getState());
  });

  it('searches, and steps through the hits', async () => {
    await open();
    const events: number[] = [];
    viewer!.on('searchcomplete', (event) => events.push(event.hitCount));
    await viewer!.search('Hello');
    const state = await until((s) => s.search.status === 'complete', 'the search');
    expect(state.search.query).toBe('Hello');
    expect(state.search.hitCount).toBeGreaterThan(0);
    expect(events).toEqual([state.search.hitCount]);
    viewer!.clearSearch();
    expect(viewer!.getState().search.hitCount).toBe(0);
  });

  it('zooms', async () => {
    const before = (await open()).zoom;
    viewer!.setZoom(2);
    const state = await until((s) => s.zoom !== before, 'the zoom');
    expect(state.zoom).toBe(2);
    expect(state.zoomMode).toBe('custom');
  });

  it('shows an outline edit, undoes it, and downloads the change', async () => {
    await open();
    const outline = viewer!.get(OutlineToken)!;
    await outline.ensureLoaded();
    await outline.create({ title: 'Start', target: null });
    const edited = await until((s) => s.outline.length === 1, 'the new item');
    expect(edited.outline[0]!.item.title).toBe('Start');
    expect(edited.dirty).toBe(true);
    expect(edited.canUndo).toBe(true);

    const bytes = await viewer!.download();
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect((await until((s) => !s.dirty, 'the save')).dirty).toBe(false);

    viewer!.undo();
    await until((s) => s.outline.length === 0, 'the undo');
  });

  it('reads a plugin that is not installed as its empty value', async () => {
    const state = await open([stagePlugin()]);
    expect(state.outline).toEqual([]);
    expect(state.search.status).toBe('idle');
    expect(state.canUndo).toBe(false);
    viewer!.undo();
    viewer!.nextHit();
    await expect(viewer!.search('Hello')).rejects.toMatchObject({ code: 'unsupported' });
  });
});
