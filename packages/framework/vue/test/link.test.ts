import { h, onMounted, ref, shallowRef } from 'vue';
import type { VNodeChild } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { pageTransform } from '@embedpdf/core-geometry';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction';
import { LinkLayer, LinkToken, linkPlugin, useLink } from '../src/link';
import type { Link, LinkActivation } from '../src/link';
import { makePageContext, providePage, toPageRef } from '../src/runtime';
import { bytesInput, probe, settle, until, viewerWith } from './counter-plugin';

/**
 * The link layer against a real kernel: the `#link` slot gets the link and the
 * layer's own anchor, and every click follows the link through the plugin,
 * which opens a website through the opener this binding registers.
 */

const box = { x: 0, y: 0, width: 600, height: 800 };
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
};

const linkDto = (objectNumber: number, target: unknown) => ({
  ref: { kind: 'objectNumber', page: toPageRef(1), objectNumber },
  page: toPageRef(1),
  index: objectNumber,
  subtype: 'link',
  rect: { x: 100, y: 100 + objectNumber * 50, width: 200, height: 30 },
  target,
});

const engine = {
  open: () =>
    Promise.resolve({
      id: 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
      security: { allows: () => true },
      page: () => ({
        annotations: {
          list: () =>
            Promise.resolve({
              annotations: [
                linkDto(1, { kind: 'uri', uri: 'https://example.com/' }),
                linkDto(2, { kind: 'uri', uri: 'javascript:alert(1)' }),
              ],
            }),
        },
      }),
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const context = makePageContext(
  'doc',
  'test-view',
  toPageRef(1),
  0,
  { top: 0, right: 0, bottom: 0, left: 0 },
  pageTransform({
    pageSize: { width: 600, height: 800 },
    rotation: 0,
    scale: 1,
    baseScale: 1,
    dpr: 1,
  }),
  () => new DOMRect(0, 0, 600, 800),
);

/** The page, once the document is open: a layer renders inside a page. */
async function mountPage(content: () => VNodeChild) {
  const ready = ref(false);
  const Page = probe(() => {
    providePage(shallowRef(context));
    return () => (ready.value ? content() : null);
  });
  const viewer = await viewerWith([interactionPlugin(), linkPlugin()], () => h(Page), engine);
  await viewer.kernel.documents.open(bytesInput('doc'));
  ready.value = true;
  await settle();
  return viewer;
}

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

describe('LinkLayer', () => {
  it('hands the #link slot the link and the layer’s own anchor', async () => {
    await mountPage(() =>
      h(LinkLayer, null, {
        link: ({ link, native }: { link: Link; native: unknown }) =>
          h('span', { 'data-testid': `link-${link.id}`, 'data-kind': link.target.kind }, [
            h(native as never),
          ]),
      }),
    );
    await until(() => document.querySelector('[data-testid="link-obj:1"] a') !== null);
    expect(document.querySelector('[data-testid="link-obj:1"]')?.getAttribute('data-kind')).toBe(
      'uri',
    );
  });

  it('follows a click through the plugin, which opens an allowed website and reports the rest', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { kernel } = await mountPage(() => h(LinkLayer));
    const outcomes: LinkActivation['outcome'][] = [];
    kernel.capability(LinkToken).onActivated((event) => outcomes.push(event.activation.outcome));
    await until(() => document.querySelectorAll('a').length === 2);
    const [website, script] = Array.from(document.querySelectorAll('a'));

    website!.click();
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    script!.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['uri', 'reported']);
  });

  it('keeps a press on a link from the page below it', async () => {
    // The Stage listens natively on an element between the link and the app's root.
    const stagePresses: Event[] = [];
    const StageBelow = probe(() => {
      const element = ref<HTMLDivElement | null>(null);
      onMounted(() =>
        element.value!.addEventListener('pointerdown', (event) => stagePresses.push(event)),
      );
      return () => h('div', { ref: element }, h(LinkLayer));
    });
    await mountPage(() => h(StageBelow));
    await until(() => document.querySelectorAll('a').length === 2);
    document.querySelector('a')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(stagePresses).toHaveLength(0);
  });

  it('opens a website from code while a component uses useLink()', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    let link: ReturnType<typeof useLink> | null = null;
    const Probe = probe(() => {
      link = useLink();
    });
    const { kernel } = await viewerWith(
      [interactionPlugin(), linkPlugin()],
      () => h(Probe),
      engine,
    );
    await kernel.documents.open(bytesInput('doc'));
    await settle();
    expect(link!.activate({ kind: 'uri', uri: 'https://example.com/a' }).outcome).toBe('uri');
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });
});
