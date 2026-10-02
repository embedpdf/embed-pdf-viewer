import { h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { toPageRef } from '@embedpdf/core';
import type { Engine } from '@embedpdf/core';
import { PageView } from '../src/page-view';
import { usePage } from '../src/runtime';
import { bytesInput, counterPlugin, probe, settle, viewerWith } from './counter-plugin';

/**
 * `<PageView>` takes its page as a ref or an index, shows `#fallback` until the
 * page exists, puts `class` on its outer box, hands its page to `#page-chrome`,
 * and sizes the page by its width upright: a page turned a quarter shows its
 * height across.
 */

/** A layer that records the page it is drawn on, each time that page changes. */
const pageProbe = (seen: unknown[]) =>
  probe(() => {
    const page = usePage();
    return () => {
      seen.push({ ref: page.value.ref.objectNumber, index: page.value.pageIndex });
      return null;
    };
  });

enableAutoUnmount(afterEach);

describe('PageView', () => {
  it('shows a page given by its index or its ref, and the fallback until it exists', async () => {
    const byIndex: unknown[] = [];
    const byRef: unknown[] = [];
    const ByIndex = pageProbe(byIndex);
    const ByRef = pageProbe(byRef);
    const { kernel } = await viewerWith([counterPlugin], () => [
      h(
        PageView,
        { page: 0, class: 'by-index' },
        { default: () => h(ByIndex), fallback: () => h('p', { class: 'waiting' }) },
      ),
      h(
        PageView,
        { page: toPageRef(1), pageFrame: { bottom: 20 } },
        {
          default: () => h(ByRef),
          'page-chrome': ({ page }: { page: { frame: { bottom: number } } }) =>
            h('span', { class: 'chrome' }, String(page.frame.bottom)),
        },
      ),
    ]);
    expect(document.querySelector('.waiting')).not.toBeNull(); // no document yet
    expect(document.querySelector('.by-index')).toBeNull();

    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(byIndex.at(-1)).toEqual({ ref: 1, index: 0 });
    expect(byRef.at(-1)).toEqual({ ref: 1, index: 0 });
    expect(document.querySelector('.waiting')).toBeNull();
    expect(document.querySelector('.by-index')).not.toBeNull();
    // The chrome reads the frame the page view reserved.
    expect(document.querySelector('.chrome')?.textContent).toBe('20');
  });

  it('a page turned a quarter is `width` pixels tall and shows its height across', async () => {
    // A portrait page (600 × 800 points) turned 90°: it shows 800 across, 600 down.
    const box = { x: 0, y: 0, width: 600, height: 800 };
    const turned = {
      index: 0,
      ref: toPageRef(1),
      label: null,
      size: { width: 600, height: 800 },
      rotation: 90,
      userUnit: 1,
      boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
      pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
    };
    const engine = {
      open: (input: { id?: string }) =>
        Promise.resolve({
          id: input.id ?? 'doc',
          events: { subscribe: () => () => {}, lastServerId: () => null },
          pages: { list: () => Promise.resolve({ pageCount: 1, pages: [turned] }) },
          security: { allows: () => true, allowsAnnotation: () => true },
          close: () => Promise.resolve(),
        }),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const { kernel } = await viewerWith(
      [counterPlugin],
      () =>
        h(PageView, { page: 0, width: 120, class: 'turned', style: { margin: '4px' } }, () =>
          h('span'),
        ),
      engine,
    );
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const outer = document.querySelector<HTMLElement>('.turned')!;
    expect(parseFloat(outer.style.width)).toBeCloseTo(160, 5); // 120 × 800 / 600
    expect(parseFloat(outer.style.height)).toBeCloseTo(120, 5);
    // Your style goes on the outer box, next to its own.
    expect(outer.style.margin).toBe('4px');
    expect(outer.style.position).toBe('relative');
  });
});
