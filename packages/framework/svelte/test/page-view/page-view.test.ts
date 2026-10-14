import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import type { Engine } from '@embedpdf/core';
import { toPageRef } from '../../src/runtime';
import { bytesInput, counterPlugin } from '../fixtures/counter-plugin';
import PageViewHarness from '../fixtures/PageViewHarness.svelte';
import TurnedPageView from '../fixtures/TurnedPageView.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * `<PageView>` takes its page as a ref or an index, shows its fallback until the page exists,
 * puts `class` on its outer box, and sizes the page by its width upright: a page turned a
 * quarter shows its height across.
 */

describe('PageView', () => {
  it('shows a page given by its index or its ref', async () => {
    const { kernel, view } = await viewerWith([counterPlugin], PageViewHarness);
    const { container } = view;
    expect(container.querySelector('.waiting')).not.toBeNull(); // no document yet
    expect(container.querySelector('.by-index')).toBeNull();

    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(container.querySelector('.waiting')).toBeNull();
    const byIndex = container.querySelector<HTMLElement>('.by-index-probe')!;
    expect(byIndex.dataset.ref).toBe('1');
    expect(byIndex.dataset.index).toBe('0');
    expect(container.querySelector<HTMLElement>('.by-ref .layer')!.dataset.page).toBe('1');
    // The reserved band is part of the outer box: 240 wide, 320 tall plus 20.
    const byRef = container.querySelector<HTMLElement>('.by-ref')!;
    expect(parseFloat(byRef.style.width)).toBeCloseTo(240, 5);
    expect(parseFloat(byRef.style.height)).toBeCloseTo(340, 5);
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
    const { kernel, view } = await viewerWith([counterPlugin], TurnedPageView, {}, engine);
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const outer = view.container.querySelector<HTMLElement>('.turned')!;
    expect(parseFloat(outer.style.width)).toBeCloseTo(160, 5); // 120 × 800 / 600
    expect(parseFloat(outer.style.height)).toBeCloseTo(120, 5);
  });
});
