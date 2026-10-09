// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { pageTransform } from '@embedpdf/core-geometry';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { interactionPlugin } from '../src/interaction';
import { LinkLayer, LinkToken, linkPlugin, useLink } from '../src/link';
import type { LinkActivation } from '../src/link';
import { makePageContext, PageProvider, toPageRef } from '../src/runtime';
import { bytesInput, viewerWith } from './counter-plugin';

/**
 * The link layer against a real kernel: `renderLink` gets the link and the
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LinkLayer', () => {
  it('hands renderLink the link and the layer’s own anchor', async () => {
    const { kernel, rerender } = await viewerWith(
      [interactionPlugin(), linkPlugin()],
      null,
      engine,
    );
    await act(() => kernel.documents.open(bytesInput('doc')));
    rerender(
      <PageProvider value={context}>
        <LinkLayer
          renderLink={({ link, native }) => (
            <span data-testid={`link-${link.id}`} data-kind={link.target.kind}>
              {native}
            </span>
          )}
        />
      </PageProvider>,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-testid="link-obj:1"] a')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="link-obj:1"]')?.getAttribute('data-kind')).toBe(
      'uri',
    );
  });

  it('follows a click through the plugin, which opens an allowed website and reports the rest', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { kernel, rerender } = await viewerWith(
      [interactionPlugin(), linkPlugin()],
      null,
      engine,
    );
    await act(() => kernel.documents.open(bytesInput('doc')));
    const outcomes: LinkActivation['outcome'][] = [];
    kernel.capability(LinkToken).onActivated((event) => outcomes.push(event.activation.outcome));
    rerender(
      <PageProvider value={context}>
        <LinkLayer />
      </PageProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll('a')).toHaveLength(2));
    const [website, script] = Array.from(document.querySelectorAll('a'));

    fireEvent.click(website!);
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    fireEvent.click(script!);
    expect(open).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['uri', 'reported']);
  });

  it('keeps a press on a link from the page below it', async () => {
    const { kernel, rerender } = await viewerWith(
      [interactionPlugin(), linkPlugin()],
      null,
      engine,
    );
    await act(() => kernel.documents.open(bytesInput('doc')));
    // The Stage listens natively on an element between the link and React's root.
    const stagePresses: Event[] = [];
    function StageBelow({ children }: { children: React.ReactNode }) {
      const ref = React.useRef<HTMLDivElement>(null);
      React.useEffect(() => {
        const element = ref.current!;
        const onPress = (event: Event) => stagePresses.push(event);
        element.addEventListener('pointerdown', onPress);
        return () => element.removeEventListener('pointerdown', onPress);
      }, []);
      return <div ref={ref}>{children}</div>;
    }
    rerender(
      <PageProvider value={context}>
        <StageBelow>
          <LinkLayer />
        </StageBelow>
      </PageProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll('a')).toHaveLength(2));
    fireEvent.pointerDown(document.querySelector('a')!);
    expect(stagePresses).toHaveLength(0);
  });

  it('opens a website from code while a component uses useLink()', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    let link: ReturnType<typeof useLink> | null = null;
    function Probe() {
      link = useLink();
      return null;
    }
    const { kernel } = await viewerWith([interactionPlugin(), linkPlugin()], <Probe />, engine);
    await act(() => kernel.documents.open(bytesInput('doc')));
    expect(link!.activate({ kind: 'uri', uri: 'https://example.com/a' }).outcome).toBe('uri');
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });
});
