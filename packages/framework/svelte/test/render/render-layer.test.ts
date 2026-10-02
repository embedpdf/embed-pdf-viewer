import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { RenderToken, renderPlugin } from '../../src/render';
import { stagePlugin, StageToken } from '../../src/stage';
import { bytesInput } from '../fixtures/counter-plugin';
import { renderEngine } from '../fixtures/render-engine';
import RenderHarness from '../fixtures/RenderHarness.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * `<RenderLayer>` on Stage pages: each visible page shows the picture the render plugin gives
 * for it, and an invalidation (a new epoch, so a new source key) fetches and shows a new one,
 * releasing the old URL.
 */

const host = StageToken as unknown as CapabilityToken<StageHostCapability>;

async function renderedStage(annotations = true) {
  const fake = renderEngine(2);
  const viewer = await viewerWith(
    [stagePlugin(), renderPlugin()],
    RenderHarness,
    { annotations },
    fake.engine,
  );
  await viewer.kernel.documents.open(bytesInput('a'));
  flushSync();
  viewer.kernel.capability(host).setViewportSize({ width: 800, height: 1200 });
  flushSync();
  const sources = () =>
    [...viewer.view.container.querySelectorAll('img')].map((image) => image.getAttribute('src'));
  return { ...viewer, ...fake, sources };
}

describe('RenderLayer', () => {
  it('shows each visible page’s picture', async () => {
    const { sources, renders } = await renderedStage();
    await waitFor(() => expect(sources().filter(Boolean).length).toBeGreaterThan(0));
    expect(sources()[0]).toMatch(/^blob:page-1-call-\d+$/);
    expect(renders[0]!.options.includeAnnotations).toBe(true);
  });

  it('leaves annotations out of the picture when asked', async () => {
    const { sources, renders } = await renderedStage(false);
    await waitFor(() => expect(sources().filter(Boolean).length).toBeGreaterThan(0));
    expect(renders.every((call) => call.options.includeAnnotations === false)).toBe(true);
  });

  it('fetches again after an invalidation, and releases the old picture', async () => {
    const { kernel, sources, revoked } = await renderedStage();
    await waitFor(() => expect(sources()[0]).toBeTruthy());
    const before = sources()[0];
    kernel.capability(RenderToken).invalidate({ pages: [0] });
    flushSync();
    await waitFor(() => expect(sources()[0]).not.toBe(before));
    expect(revoked).toContain(before);
  });
});
