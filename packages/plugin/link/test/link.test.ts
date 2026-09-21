import { describe, expect, it } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { linkPlugin } from '../src/link.plugin';
import { LinkToken } from '../src/host-contract';

/** Links through the real kernel with the stand-alone source (no annotation plugin). */
const crop = { left: 0, bottom: 0, right: 600, top: 800 };
const page = (pon: number, index: number): PageLayout =>
  ({
    index,
    ref: toPageRef(pon),
    label: null,
    size: { width: 600, height: 800 },
    rotation: 0,
    userUnit: 1,
    boxes: { media: { ...crop }, crop: { ...crop } },
  }) as PageLayout;

const linkDto = (
  n: number,
  rect: { left: number; bottom: number; right: number; top: number },
  target: unknown,
) => ({
  ref: { kind: 'objectNumber', page: toPageRef(1), annotObjectNumber: n },
  page: toPageRef(1),
  index: n,
  subtype: 'link',
  rect,
  flags: { hidden: false, noView: false },
  target,
  replyType: null,
  inReplyTo: null,
});

async function boot() {
  const listeners = new Set<(e: unknown) => void>();
  let reads = 0;
  const handle = {
    id: 'd',
    events: {
      subscribe: (l: (e: unknown) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: 2, pages: [page(1, 0), page(2, 1)] }) },
    security: { allows: () => true },
    page: (ref: { pageObjectNumber: number }) => ({
      annotations: {
        list: () => {
          reads++;
          return Promise.resolve({
            annotations:
              ref.pageObjectNumber === 1
                ? [
                    linkDto(
                      10,
                      { left: 100, bottom: 700, right: 300, top: 760 },
                      { kind: 'uri', uri: 'https://example.com' },
                    ),
                    linkDto(
                      11,
                      { left: 120, bottom: 720, right: 160, top: 740 },
                      { kind: 'named', name: 'NextPage' },
                    ),
                    linkDto(
                      12,
                      { left: 400, bottom: 100, right: 500, top: 200 },
                      { kind: 'goto', destination: { page: toPageRef(2), kind: 'fit' } },
                    ),
                  ]
                : [],
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
    reads: () => reads,
    emit: (e: unknown) => listeners.forEach((l) => l(e)),
  };
}

describe('link plugin', () => {
  it('loads a page once, announces it, and lists page-space links', async () => {
    const h = await boot();
    const loaded: number[] = [];
    h.link.onLoaded((e) => loaded.push(e.page.pageObjectNumber));
    expect(h.link.isLoaded(toPageRef(1))).toBe(false);
    await h.link.ensureLoaded(toPageRef(1));
    await h.link.ensureLoaded(toPageRef(1));
    expect(h.reads()).toBe(1);
    expect(loaded).toEqual([1]);
    const links = h.link.listLinks(toPageRef(1));
    expect(links.map((l) => l.id)).toEqual(['obj:10', 'obj:11', 'obj:12']);
    // PDF (100,700)-(300,760) on an 800pt page → page space y = 800 - 760 = 40
    expect(links[0]!.bounds).toEqual({ x: 100, y: 40, width: 200, height: 60 });
    expect(h.link.listLinks(toPageRef(1))).toBe(links); // reference-stable
    expect(h.link.getLink(toPageRef(1), 'obj:11')?.target).toEqual({
      kind: 'named',
      name: 'NextPage',
    });
    await h.kernel.destroy();
  });

  it('hit-tests to the smallest link under the point; listAllLinks loads every page', async () => {
    const h = await boot();
    await h.link.ensureLoaded(toPageRef(1));
    // Both obj:10 and the nested obj:11 contain (130, 70); the smaller wins.
    expect(h.link.getLinkAt(toPageRef(1), { x: 130, y: 70 })?.id).toBe('obj:11');
    expect(h.link.getLinkAt(toPageRef(1), { x: 250, y: 50 })?.id).toBe('obj:10');
    expect(h.link.getLinkAt(toPageRef(1), { x: 10, y: 10 })).toBeNull();
    const all = await h.link.listAllLinks();
    expect(all).toHaveLength(3);
    expect(h.link.isLoaded(toPageRef(2))).toBe(true);
    await h.kernel.destroy();
  });

  it('resolves without side effects and reports what the host must perform', async () => {
    const h = await boot();
    await h.link.ensureLoaded(toPageRef(1));
    const log: string[] = [];
    h.link.onActivated((e) =>
      log.push(`${e.target.kind}:${e.activation.outcome}:${e.origin.trigger}`),
    );
    expect(h.link.resolve({ kind: 'uri', uri: 'https://x' })).toEqual({
      kind: 'uri',
      uri: 'https://x',
    });
    expect(
      h.link.resolve({ kind: 'goto', destination: { page: toPageRef(2), kind: 'fit' } as never })
        .kind,
    ).toBe('reveal');
    expect(
      h.link.resolve({ kind: 'goto', destination: { page: toPageRef(99), kind: 'fit' } as never })
        .kind,
    ).toBe('destination');
    expect(h.link.activate({ kind: 'uri', uri: 'https://x' })).toEqual({
      outcome: 'uri',
      uri: 'https://x',
    });
    // No stage installed: a goto is reported as a destination for the host.
    expect(h.link.activateAt(toPageRef(1), { x: 450, y: 650 })?.outcome).toBe('destination');
    expect(h.link.activateAt(toPageRef(1), { x: 10, y: 10 })).toBeNull();
    expect(h.link.getLabel(h.link.getLink(toPageRef(1), 'obj:10')!)).toBe('https://example.com');
    expect(h.link.getLabel({ kind: 'named', name: 'N' })).toBe('N');
    expect(log).toEqual(['uri:uri:user', 'goto:destination:user']);
    await h.kernel.destroy();
  });

  it('re-reads a loaded page when an annotation on it changes', async () => {
    const h = await boot();
    await h.link.ensureLoaded(toPageRef(1));
    h.emit({ type: 'annotation.deleted', page: toPageRef(1), origin: { kind: 'local' } });
    await new Promise((r) => setTimeout(r));
    expect(h.reads()).toBe(2);
    h.emit({ type: 'annotation.deleted', page: toPageRef(2), origin: { kind: 'local' } }); // not loaded: nothing
    await new Promise((r) => setTimeout(r));
    expect(h.reads()).toBe(2);
    await h.kernel.destroy();
  });
});
