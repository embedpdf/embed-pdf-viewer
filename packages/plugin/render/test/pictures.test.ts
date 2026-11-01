import { describe, expect, it } from 'vitest';
import {
  createKernel,
  PluginError,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { manualClock } from '@embedpdf/core/testing';
import type { PictureStateChangedEvent, RenderConfig } from '../src/contract';
import { RenderToken } from '../src/host-contract';
import { renderPlugin } from '../src/render.plugin';

/** Whether a page's picture is on screen: the layers' reports, folded into a state per view. */

const PAGE = toPageRef(11);
const OTHER_PAGE = toPageRef(22);

async function boot(config?: RenderConfig) {
  const time = manualClock();
  const box = { x: 0, y: 0, width: 612, height: 792 };
  const pages = [PAGE, OTHER_PAGE].map(
    (ref, index) =>
      ({
        index,
        ref,
        label: null,
        size: { width: 612, height: 792 },
        rotation: 0,
        userUnit: 1,
        boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
        pdfCropBox: { left: 0, bottom: 0, right: 612, top: 792 },
      }) as PageLayout,
  );
  const handle = {
    id: 'd',
    with: () => handle,
    setWorkingSet: () => {},
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: pages.length, pages }) },
    security: { allows: () => true },
    render: { getPolicy: () => Promise.resolve({ kind: 'continuous' }) },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [renderPlugin(config)], clock: time.clock });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  const render = kernel.capability(RenderToken, 'd');
  const events: PictureStateChangedEvent[] = [];
  render.onPictureStateChanged((event) => events.push(event));
  return { kernel, render, time, events };
}

describe('a page picture state', () => {
  it('is idle until a layer paints the page, loading until it shows, idle once the layer goes', async () => {
    const { render, events } = await boot();
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'idle', slow: false });

    const report = render.reportPicture('main', PAGE);
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'loading', slow: false });
    report.shown();
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'ready', slow: false });
    report.close();
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'idle', slow: false });

    expect(events.map((event) => [event.page.objectNumber, event.view, event.status])).toEqual([
      [11, 'main', 'loading'],
      [11, 'main', 'ready'],
      [11, 'main', 'idle'],
    ]);
  });

  it('turns slow after slowAfterMs on the clock, and not when the picture shows first', async () => {
    const { render, time } = await boot();
    const slowOne = render.reportPicture('main', PAGE);
    const quickOne = render.reportPicture('main', OTHER_PAGE);
    time.advance(399);
    expect(render.getPictureState(PAGE, 'main').slow).toBe(false);
    quickOne.shown();
    time.advance(1);
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'loading', slow: true });
    expect(render.getPictureState(OTHER_PAGE, 'main')).toEqual({ status: 'ready', slow: false });
    slowOne.shown();
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'ready', slow: false });
    expect(time.pending.timers).toBe(0);
  });

  it('takes its wait from the settings, and 0 is slow at once', async () => {
    const { render, time } = await boot({ slowAfterMs: 0 });
    render.reportPicture('main', PAGE);
    expect(render.getPictureState(PAGE, 'main').slow).toBe(true);

    render.updateSettings({ slowAfterMs: 1000 });
    render.reportPicture('main', OTHER_PAGE);
    time.advance(999);
    expect(render.getPictureState(OTHER_PAGE, 'main').slow).toBe(false);
    time.advance(1);
    expect(render.getPictureState(OTHER_PAGE, 'main').slow).toBe(true);
  });

  it('is forbidden on a refusal, an error on any other failure, and ready once a picture shows', async () => {
    const { render } = await boot();
    const refused = render.reportPicture('main', PAGE);
    refused.failed(new PluginError('permission-denied', 'render', 'no doc.render'));
    expect(render.getPictureState(PAGE, 'main')).toEqual({ status: 'forbidden', slow: false });

    const failing = render.reportPicture('main', OTHER_PAGE);
    failing.failed(new Error('network'));
    expect(render.getPictureState(OTHER_PAGE, 'main').status).toBe('error');
    failing.shown();
    expect(render.getPictureState(OTHER_PAGE, 'main').status).toBe('ready');
    failing.failed(new Error('a later picture failed'));
    expect(render.getPictureState(OTHER_PAGE, 'main').status).toBe('ready');
  });

  it('counts a plain permission-denied info as a refusal, the way a painter may pass it', async () => {
    const { render } = await boot();
    render.reportPicture('main', PAGE).failed({ code: 'permission-denied', message: 'no' });
    expect(render.getPictureState(PAGE, 'main').status).toBe('forbidden');
  });

  it('keeps one state per view', async () => {
    const { render } = await boot();
    render.reportPicture('main', PAGE).shown();
    render.reportPicture('thumbnails', PAGE);
    expect(render.getPictureState(PAGE, 'main').status).toBe('ready');
    expect(render.getPictureState(PAGE, 'thumbnails').status).toBe('loading');
  });

  it('is ready once either of two layers on a page showed it, and idle once both went', async () => {
    const { render } = await boot();
    const first = render.reportPicture('main', PAGE);
    const second = render.reportPicture('main', PAGE);
    second.shown();
    expect(render.getPictureState(PAGE, 'main').status).toBe('ready');
    second.close();
    expect(render.getPictureState(PAGE, 'main').status).toBe('loading');
    first.close();
    expect(render.getPictureState(PAGE, 'main').status).toBe('idle');
  });

  it('reads the same object while the state is the same, by ref or index', async () => {
    const { render } = await boot();
    render.reportPicture('main', PAGE);
    const read = render.getPictureState(PAGE, 'main');
    expect(render.getPictureState(0, 'main')).toBe(read);
    expect(render.getPictureState(toPageRef(99), 'main')).toEqual({ status: 'idle', slow: false });
  });

  it('ignores reports after the document closed', async () => {
    const { kernel, render, events, time } = await boot();
    const report = render.reportPicture('main', PAGE);
    await kernel.documents.close('d');
    const before = events.length;
    report.shown();
    report.close();
    time.advance(1000);
    expect(events.length).toBe(before);
    expect(time.pending.timers).toBe(0);
  });
});
