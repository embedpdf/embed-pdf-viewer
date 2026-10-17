import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/svelte';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { interactionPlugin, InteractionToken, type ToolPointerEvent } from '../../src/interaction';
import { stagePlugin, StageToken } from '../../src/stage';
import { bytesInput, pagedEngine } from '../fixtures/counter-plugin';
import PointerHarness from '../fixtures/PointerHarness.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * The interaction binding: `<PagePointerSource>` hands a page's pointer input to the active tool
 * in page coordinates, and `useToolCursor()` gives a tool its cursors while the component lives,
 * following what its function reads.
 */

const host = StageToken as unknown as CapabilityToken<StageHostCapability>;

async function pointerStage(props: Record<string, unknown> = {}) {
  const downs: ToolPointerEvent[] = [];
  // The Stage doesn't route input itself here, so only the page's own source does.
  const viewer = await viewerWith(
    [stagePlugin({ interaction: false }), interactionPlugin()],
    PointerHarness,
    props,
    pagedEngine(1),
  );
  await viewer.kernel.documents.open(bytesInput('a'));
  flushSync();
  viewer.kernel.capability(host).setViewportSize({ width: 800, height: 1200 });
  const interaction = viewer.kernel.capability(InteractionToken);
  interaction.registerTool({
    id: 'pen',
    cursor: 'crosshair',
    onPointerDown: (event) => {
      downs.push(event);
      return true;
    },
  });
  interaction.activateTool('pen');
  flushSync();
  return { ...viewer, downs };
}

/** The pointer source of the first page: the element covering the page with `inset: 0`. */
const pageSurface = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('div[style*="inset: 0"]');

describe('PagePointerSource', () => {
  it('hands a press on the page to the active tool, on that page', async () => {
    const { view, downs } = await pointerStage();
    await waitFor(() => expect(pageSurface(view.container)).not.toBeNull());
    await fireEvent.pointerDown(pageSurface(view.container)!, {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    expect(downs).toHaveLength(1);
    expect(downs[0]!.page.objectNumber).toBe(1);
  });
});

describe('useToolCursor', () => {
  it('replaces the tool’s cursor while set, and gives the tool its own back', async () => {
    const { kernel, view } = await pointerStage({ cursor: 'copy' });
    const hub = kernel.capability(InteractionHostToken);
    // Over a page, the active tool's cursor shows.
    await waitFor(() => expect(pageSurface(view.container)).not.toBeNull());
    await fireEvent.pointerMove(pageSurface(view.container)!, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(hub.getCursor()).toBe('copy'));

    await view.rerender({ contentProps: { cursor: 'grab' } });
    flushSync();
    await waitFor(() => expect(hub.getCursor()).toBe('grab'));

    await view.rerender({ contentProps: {} });
    flushSync();
    await waitFor(() => expect(hub.getCursor()).toBe('crosshair'));
  });
});
