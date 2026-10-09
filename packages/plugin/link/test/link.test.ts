import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import type { Behavior } from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import { createLinkController } from '../src/controller';
import { LinkToken } from '../src/host-contract';
import { linkPlugin } from '../src/link.plugin';
import { pageSpaceBoxesOf, type Annotation } from '@embedpdf/engine-core/runtime';

/** Links through the real kernel with the stand-alone source (no annotation plugin). */
const crop = { left: 0, bottom: 0, right: 600, top: 800 };
const pageLayout = (pageObjectNumber: number, index: number): PageLayout =>
  ({
    index,
    ref: toPageRef(pageObjectNumber),
    label: null,
    size: { width: 600, height: 800 },
    rotation: 0,
    userUnit: 1,
    boxes: pageSpaceBoxesOf({
      media: { ...crop },
      crop: { ...crop },
      bleed: { ...crop },
      trim: { ...crop },
      art: { ...crop },
    }),
    pdfCropBox: { ...crop },
  }) as PageLayout;

const linkDto = (
  annotObjectNumber: number,
  pageObjectNumber: number,
  rect: { x: number; y: number; width: number; height: number },
  target: unknown,
) => ({
  ref: { kind: 'objectNumber', page: toPageRef(pageObjectNumber), objectNumber: annotObjectNumber },
  page: toPageRef(pageObjectNumber),
  index: annotObjectNumber,
  subtype: 'link',
  rect,
  flags: { hidden: false, noView: false },
  target,
  replyType: null,
  inReplyTo: null,
});

const PAGE_ONE_LINKS = [
  linkDto(
    10,
    1,
    { x: 100, y: 40, width: 200, height: 60 },
    { kind: 'uri', uri: 'https://example.com' },
  ),
  linkDto(11, 1, { x: 120, y: 60, width: 40, height: 20 }, { kind: 'named', name: 'N' }),
  linkDto(
    12,
    1,
    { x: 400, y: 600, width: 100, height: 100 },
    { kind: 'goto', destination: { page: toPageRef(2), kind: 'fit' } },
  ),
];

const ORIGIN = { kind: 'local', sessionId: 'session', sub: null, ts: 0, serverId: null };

async function boot() {
  const listeners = new Set<(event: unknown) => void>();
  const reads: number[] = [];
  let failing = false;
  const handle = {
    id: 'd',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerId: () => null,
    },
    pages: {
      list: () => Promise.resolve({ pageCount: 2, pages: [pageLayout(1, 0), pageLayout(2, 1)] }),
    },
    security: { allows: () => true },
    page: (ref: { objectNumber: number }) => ({
      annotations: {
        list: () => {
          reads.push(ref.objectNumber);
          if (failing) return Promise.reject(new Error('read failed'));
          return Promise.resolve({
            annotations: ref.objectNumber === 1 ? PAGE_ONE_LINKS : [],
          });
        },
      },
    }),
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [interactionPlugin(), linkPlugin()] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return {
    kernel,
    link: kernel.capability(LinkToken, 'd'),
    reads,
    failReads: (fail: boolean) => {
      failing = fail;
    },
    emit: (event: unknown) => listeners.forEach((listener) => listener(event)),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('link plugin', () => {
  it('loads a page once, announces it, and lists page-space links', async () => {
    const harness = await boot();
    const loaded: number[] = [];
    harness.link.onLoaded((event) => loaded.push(event.page.objectNumber));
    expect(harness.link.isLoaded(toPageRef(1))).toBe(false);
    expect(harness.link.getStatus(toPageRef(1))).toBe('idle');
    await Promise.all([
      harness.link.ensureLoaded(toPageRef(1)),
      harness.link.ensureLoaded(toPageRef(1)),
    ]);
    await harness.link.ensureLoaded(toPageRef(1));
    expect(harness.reads).toEqual([1]);
    expect(loaded).toEqual([1]);
    expect(harness.link.getStatus(toPageRef(1))).toBe('ready');
    const links = harness.link.listLinks(toPageRef(1));
    expect(links.map((link) => link.id)).toEqual(['obj:10', 'obj:11', 'obj:12']);
    expect(links[0]!.bounds).toEqual({ x: 100, y: 40, width: 200, height: 60 });
    expect(harness.link.listLinks(toPageRef(1))).toBe(links);
    expect(harness.link.getLink(toPageRef(1), 'obj:11')?.target).toEqual({
      kind: 'named',
      name: 'N',
    });
    await harness.kernel.destroy();
  });

  it('hit-tests to the smallest link under the point; listAllLinks loads every page', async () => {
    const harness = await boot();
    await harness.link.ensureLoaded(toPageRef(1));
    // Both obj:10 and the nested obj:11 contain (130, 70); the smaller wins.
    expect(harness.link.getLinkAt(toPageRef(1), { x: 130, y: 70 })?.id).toBe('obj:11');
    expect(harness.link.getLinkAt(toPageRef(1), { x: 250, y: 50 })?.id).toBe('obj:10');
    expect(harness.link.getLinkAt(toPageRef(1), { x: 10, y: 10 })).toBeNull();
    const all = await harness.link.listAllLinks();
    expect(all).toHaveLength(3);
    expect(harness.link.isLoaded(toPageRef(2))).toBe(true);
    await harness.kernel.destroy();
  });

  it('resolves without side effects and reports what the host must perform', async () => {
    const harness = await boot();
    await harness.link.ensureLoaded(toPageRef(1));
    const log: string[] = [];
    harness.link.onActivated((event) =>
      log.push(`${event.target.kind}:${event.activation.outcome}`),
    );
    expect(harness.link.resolve({ kind: 'uri', uri: 'https://x' })).toEqual({
      kind: 'uri',
      uri: 'https://x',
    });
    expect(
      harness.link.resolve({
        kind: 'goto',
        destination: { kind: 'xyz', page: toPageRef(2), x: 100, y: 50 },
      }),
    ).toEqual({
      kind: 'destination',
      destination: { kind: 'xyz', page: toPageRef(2), x: 100, y: 50 },
    });
    // A page the document doesn't have can't be gone to: the target is reported.
    expect(
      harness.link.resolve({ kind: 'goto', destination: { kind: 'fit', page: toPageRef(99) } })
        .kind,
    ).toBe('reported');
    expect(harness.link.activate({ kind: 'uri', uri: 'https://x' })).toEqual({
      outcome: 'uri',
      uri: 'https://x',
    });
    // No stage installed: a goto is reported as a destination for the host.
    expect(harness.link.activateAt(toPageRef(1), { x: 450, y: 650 })?.outcome).toBe('destination');
    expect(harness.link.activateAt(toPageRef(1), { x: 10, y: 10 })).toBeNull();
    expect(harness.link.getLabel(harness.link.getLink(toPageRef(1), 'obj:10')!)).toBe(
      'https://example.com',
    );
    expect(harness.link.getLabel({ kind: 'named', name: 'N' })).toBe('N');
    expect(log).toEqual(['uri:uri', 'goto:destination']);
    await harness.kernel.destroy();
  });

  it('re-reads a loaded page when an annotation on it changes', async () => {
    const harness = await boot();
    await harness.link.ensureLoaded(toPageRef(1));
    harness.emit({ type: 'annotations.deleted', page: toPageRef(1), origin: ORIGIN });
    await settle();
    expect(harness.reads).toEqual([1, 1]);
    // Page 2 is not loaded: nothing to re-read.
    harness.emit({ type: 'annotations.deleted', page: toPageRef(2), origin: ORIGIN });
    await settle();
    expect(harness.reads).toEqual([1, 1]);
    await harness.kernel.destroy();
  });

  it('re-reads the page whose annotations were reordered', async () => {
    const harness = await boot();
    await harness.link.listAllLinks();
    expect(harness.reads).toEqual([1, 2]);
    harness.emit({
      type: 'annotations.reordered',
      page: toPageRef(1),
      order: [PAGE_ONE_LINKS[1]!.ref, PAGE_ONE_LINKS[0]!.ref],
      meta: { changed: [PAGE_ONE_LINKS[1]!.ref] },
      origin: ORIGIN,
    });
    await settle();
    expect(harness.reads.slice(2)).toEqual([1]);
    await harness.kernel.destroy();
  });

  it('re-reads the loaded pages a redaction or a flatten applied to', async () => {
    const harness = await boot();
    await harness.link.listAllLinks();
    expect(harness.reads).toEqual([1, 2]);
    harness.emit({
      type: 'redaction.applied',
      results: [
        { status: 'applied', page: toPageRef(1) },
        { status: 'skipped', page: toPageRef(2) },
      ],
      origin: ORIGIN,
    });
    await settle();
    expect(harness.reads).toEqual([1, 2, 1]);
    harness.emit({
      type: 'annotations.flattened',
      page: toPageRef(2),
      results: [{ status: 'applied' }],
      origin: ORIGIN,
    });
    await settle();
    expect(harness.reads).toEqual([1, 2, 1, 2]);
    await harness.kernel.destroy();
  });

  it('re-reads loaded pages when the event stream desyncs', async () => {
    const harness = await boot();
    await harness.link.ensureLoaded(toPageRef(1));
    harness.emit({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 });
    await settle();
    expect(harness.reads).toEqual([1, 1]);
    await harness.kernel.destroy();
  });

  it('reports a failed first read as an error, never as an empty loaded page', async () => {
    const harness = await boot();
    const loaded: number[] = [];
    harness.link.onLoaded((event) => loaded.push(event.page.objectNumber));
    harness.failReads(true);
    await expect(harness.link.ensureLoaded(toPageRef(1))).rejects.toBeDefined();
    expect(harness.link.getStatus(toPageRef(1))).toBe('error');
    expect(harness.link.isLoaded(toPageRef(1))).toBe(false);
    expect(loaded).toEqual([]);
    await expect(harness.link.listAllLinks()).rejects.toBeDefined();

    // The next attempt reads again and announces the page once it succeeds.
    harness.failReads(false);
    await harness.link.ensureLoaded(toPageRef(1));
    expect(harness.link.getStatus(toPageRef(1))).toBe('ready');
    expect(loaded).toEqual([1]);
    await harness.kernel.destroy();
  });

  it('does not announce a failed re-read after an annotation change', async () => {
    const harness = await boot();
    const loaded: number[] = [];
    harness.link.onLoaded((event) => loaded.push(event.page.objectNumber));
    await harness.link.ensureLoaded(toPageRef(1));
    const links = harness.link.listLinks(toPageRef(1));
    expect(loaded).toEqual([1]);

    harness.failReads(true);
    harness.emit({ type: 'annotations.deleted', page: toPageRef(1), origin: ORIGIN });
    await settle();
    expect(harness.reads).toEqual([1, 1]);
    expect(loaded).toEqual([1]);
    expect(harness.link.getStatus(toPageRef(1))).toBe('error');
    // The last confirmed links stay until a read succeeds.
    expect(harness.link.listLinks(toPageRef(1))).toBe(links);
    await harness.kernel.destroy();
  });
});

describe('following a link', () => {
  it('opens a website through the framework’s opener, and reports one it won’t open', async () => {
    const harness = await boot();
    const opened: string[] = [];
    const stop = harness.link.registerUriOpener((uri) => {
      if (uri.startsWith('javascript:')) return false;
      opened.push(uri);
      return true;
    });
    const log: string[] = [];
    harness.link.onActivated((event) => log.push(event.activation.outcome));

    expect(harness.link.activate({ kind: 'uri', uri: 'https://x' })).toEqual({
      outcome: 'uri',
      uri: 'https://x',
    });
    expect(harness.link.activate({ kind: 'uri', uri: 'javascript:alert(1)' }).outcome).toBe(
      'reported',
    );
    expect(opened).toEqual(['https://x']);
    expect(log).toEqual(['uri', 'reported']);

    // Without an opener the address is handed back to open.
    stop();
    harness.link.activate({ kind: 'uri', uri: 'https://y' });
    expect(opened).toEqual(['https://x']);
    await harness.kernel.destroy();
  });

  it('moves the view it was followed in, by that view’s scroll behavior', async () => {
    const harness = await boot();
    await harness.link.ensureLoaded(0);
    const calls: unknown[][] = [];
    const view = { goToDestination: (...args: unknown[]) => calls.push(args) };
    const activation = harness.link.activateAt(0, { x: 450, y: 650 }, { stage: view as never });
    expect(activation?.outcome).toBe('revealed');
    expect(calls).toEqual([[{ page: toPageRef(2), kind: 'fit' }]]);
    await harness.kernel.destroy();
  });

  it('takes a page as its ref or its index, and reads a missing page as empty', async () => {
    const harness = await boot();
    await harness.link.ensureLoaded(0);
    expect(harness.link.listLinks(0)).toBe(harness.link.listLinks(toPageRef(1)));
    expect(harness.link.getLinkAt(0, { x: 130, y: 70 })?.id).toBe('obj:11');
    expect(harness.link.isLoaded(0)).toBe(true);
    expect(harness.link.getStatus(1)).toBe('idle');
    expect(harness.link.listLinks(5)).toEqual([]);
    expect(harness.link.getLink(5, 'obj:10')).toBeNull();
    await expect(harness.link.ensureLoaded(5)).rejects.toMatchObject({ code: 'not-found' });
    let refusal: unknown = null;
    try {
      harness.link.activateAt(5, { x: 0, y: 0 });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({ code: 'not-found' });
    await harness.kernel.destroy();
  });

  it('cancels a read when the signal fires', async () => {
    const harness = await boot();
    const controller = new AbortController();
    const all = harness.link.listAllLinks({ signal: controller.signal });
    controller.abort();
    await expect(all).rejects.toMatchObject({ code: 'operation-cancelled' });
    await harness.kernel.destroy();
  });
});

describe('link plugin with the annotation plugin', () => {
  function withAnnotation() {
    const unregister = vi.fn();
    const annotation = {
      listLinkItems: vi.fn(() => []),
      registerBehavior: vi.fn((_behavior: Behavior) => unregister),
    };
    const interaction = { activeToolEnables: (behavior: string) => behavior === 'link-nav' };
    const read = vi.fn();
    const ctx = createTestContext<void>({
      id: 'link',
      pages: [{ ref: toPageRef(1) }],
      capabilities: [
        [AnnotationToken, annotation],
        [InteractionToken, interaction],
      ],
      doc: { page: () => ({ annotations: { list: read } }) } as never,
    });
    const link = ctx.connect(createLinkController(ctx));
    return { ctx, link, annotation, unregister, read };
  }

  it('reads links from the annotation model and never from the engine', async () => {
    const { link, annotation, read } = withAnnotation();
    await link.ensureLoaded(toPageRef(1));
    expect(link.isLoaded(toPageRef(1))).toBe(true);
    expect(link.getStatus(toPageRef(1))).toBe('ready');
    link.listLinks(toPageRef(1));
    expect(annotation.listLinkItems).toHaveBeenCalledWith(toPageRef(1));
    expect(read).not.toHaveBeenCalled();
  });

  it('registers the link behavior on connect and removes it with the instance', async () => {
    const { ctx, annotation, unregister } = withAnnotation();
    expect(annotation.registerBehavior).toHaveBeenCalledOnce();
    const behavior = annotation.registerBehavior.mock.calls[0]![0];
    expect(behavior.id).toBe('link-nav');
    const link = { subtype: 'link' } as unknown as Annotation;
    expect(behavior.matches(link)).toBe(true);
    expect(behavior.matches({ subtype: 'square' } as unknown as Annotation)).toBe(false);
    expect(behavior.engaged(link)).toBe(true);
    await ctx.dispose();
    expect(unregister).toHaveBeenCalledOnce();
  });
});
