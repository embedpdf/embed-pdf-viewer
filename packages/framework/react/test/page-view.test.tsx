// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import type { Engine } from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction';
import { PageView } from '../src/page-view';
import { DocumentScope, toPageRef, usePage } from '../src/runtime';
import { bytesInput, counterPlugin, viewerWith } from './counter-plugin';

/** `<PageView>` takes its page as a ref or an index, puts `className` on its outer box, and
 *  sizes the page by its width before rotation: a page turned a quarter shows its height across. */

function PageProbe({ seen }: { seen: unknown[] }) {
  const page = usePage();
  seen.push({ ref: page.ref.objectNumber, index: page.pageIndex });
  return null;
}

afterEach(cleanup);

describe('PageView', () => {
  it('shows a page given by its index or its ref', async () => {
    const byIndex: unknown[] = [];
    const byRef: unknown[] = [];
    const { kernel } = await viewerWith(
      [counterPlugin],
      <>
        <PageView page={0} className="by-index" fallback={<p className="waiting" />}>
          <PageProbe seen={byIndex} />
        </PageView>
        <PageView page={toPageRef(1)} pageFrame={{ bottom: 20 }}>
          <PageProbe seen={byRef} />
        </PageView>
      </>,
    );
    expect(document.querySelector('.waiting')).not.toBeNull(); // no document yet
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(byIndex.at(-1)).toEqual({ ref: 1, index: 0 });
    expect(byRef.at(-1)).toEqual({ ref: 1, index: 0 });
    expect(document.querySelector('.by-index')).not.toBeNull();
  });

  it('shows the document a <DocumentScope> names, not the active one', async () => {
    const seen: string[] = [];
    function DocumentProbe() {
      seen.push(usePage().documentId);
      return null;
    }
    const { kernel } = await viewerWith(
      [counterPlugin],
      <DocumentScope id="a">
        <PageView page={0}>
          <DocumentProbe />
        </PageView>
      </DocumentScope>,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    await act(() => kernel.documents.open(bytesInput('b'))); // the active document now
    expect(kernel.documents.getActiveId?.() ?? 'b').toBe('b');
    expect(seen.at(-1)).toBe('a');
  });

  it('is the page’s pointer surface when the interaction plugin is registered, below the layers', async () => {
    const withTools = await viewerWith(
      [counterPlugin, interactionPlugin()],
      <PageView page={0} className="with-tools">
        <span className="layer" />
      </PageView>,
    );
    await act(() => withTools.kernel.documents.open(bytesInput('a')));
    const box = document.querySelector('.with-tools .layer')!.parentElement!;
    // The surface comes first, so the layers drawn after it sit on top of it.
    expect((box.firstElementChild as HTMLElement).style.touchAction).toBe('none');
    expect(box.lastElementChild!.className).toBe('layer');
    cleanup();

    const withoutTools = await viewerWith(
      [counterPlugin],
      <PageView page={0} className="without-tools">
        <span className="layer" />
      </PageView>,
    );
    await act(() => withoutTools.kernel.documents.open(bytesInput('a')));
    const plain = document.querySelector('.without-tools .layer')!.parentElement!;
    expect(plain.children).toHaveLength(1);
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
      <PageView page={0} width={120} className="turned">
        <span />
      </PageView>,
      engine,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const outer = document.querySelector<HTMLElement>('.turned')!;
    expect(parseFloat(outer.style.width)).toBeCloseTo(160, 5); // 120 × 800 / 600
    expect(parseFloat(outer.style.height)).toBeCloseTo(120, 5);
  });
});
