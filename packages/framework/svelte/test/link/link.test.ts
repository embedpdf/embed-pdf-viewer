import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/svelte';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { interactionPlugin } from '../../src/interaction';
import { LinkToken, linkPlugin } from '../../src/link';
import type { LinkActivation, LinkCapability } from '../../src/link';
import { toPageRef } from '../../src/runtime';
import { bytesInput } from '../fixtures/counter-plugin';
import LinkHarness from '../fixtures/LinkHarness.svelte';
import LinkProbe from '../fixtures/LinkProbe.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * The link layer against a real kernel: the `link` snippet gets the link and the layer's own
 * anchor, every click follows the link through the plugin, which opens a website through the
 * opener this binding registers, and a press on a link never reaches the Stage below.
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

const plugins = () => [interactionPlugin(), linkPlugin()];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LinkLayer', () => {
  it('hands the link snippet the link and the layer’s own anchor', async () => {
    const { kernel, view } = await viewerWith(plugins(), LinkHarness, { custom: true }, engine);
    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    await waitFor(() =>
      expect(view.container.querySelector('[data-testid="link-obj:1"] a')).not.toBeNull(),
    );
    expect(
      view.container.querySelector('[data-testid="link-obj:1"]')?.getAttribute('data-kind'),
    ).toBe('uri');
  });

  it('follows a click through the plugin, which opens an allowed website and reports the rest', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { kernel, view } = await viewerWith(plugins(), LinkHarness, {}, engine);
    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    const outcomes: LinkActivation['outcome'][] = [];
    kernel.capability(LinkToken).onActivated((event) => outcomes.push(event.activation.outcome));
    await waitFor(() => expect(view.container.querySelectorAll('a')).toHaveLength(2));
    const [website, script] = Array.from(view.container.querySelectorAll('a'));

    await fireEvent.click(website!);
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    await fireEvent.click(script!);
    expect(open).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['uri', 'reported']);
  });

  it('keeps a press on a link from the page below it', async () => {
    const stagePresses: Event[] = [];
    const { kernel, view } = await viewerWith(plugins(), LinkHarness, { stagePresses }, engine);
    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    await waitFor(() => expect(view.container.querySelectorAll('a')).toHaveLength(2));
    await fireEvent.pointerDown(view.container.querySelector('a')!);
    expect(stagePresses).toHaveLength(0);
  });

  it('opens a website from code while a component uses useLink()', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    let link: LinkCapability | null = null;
    const { kernel } = await viewerWith(
      plugins(),
      LinkProbe,
      { onLink: (api: LinkCapability) => (link = api) },
      engine,
    );
    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    expect(link!.activate({ kind: 'uri', uri: 'https://example.com/a' }).outcome).toBe('uri');
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });
});
