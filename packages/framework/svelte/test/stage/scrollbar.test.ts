import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { stagePlugin, StageToken } from '../../src/stage';
import { bytesInput, pagedEngine } from '../fixtures/counter-plugin';
import ScrollbarHarness from '../fixtures/ScrollbarHarness.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * `<Scrollbar>` and `useScrollMetrics()`: the bar shows while the view can scroll, with the
 * classes and data attributes your CSS styles, and the metrics follow the camera.
 */

const host = StageToken as unknown as CapabilityToken<StageHostCapability>;

describe('Scrollbar', () => {
  it('shows while the view can scroll, styled by its classes, and the metrics follow the camera', async () => {
    const { kernel, view } = await viewerWith(
      [stagePlugin()],
      ScrollbarHarness,
      {},
      pagedEngine(5),
    );
    expect(view.container.querySelector('[data-embedpdf-scrollbar]')).toBeNull();

    await kernel.documents.open(bytesInput('a'));
    flushSync();
    kernel.capability(host).setViewportSize({ width: 800, height: 600 });
    flushSync();
    const bar = await waitFor(() => {
      const element = view.container.querySelector<HTMLElement>('[data-embedpdf-scrollbar]');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(bar.classList.contains('bar')).toBe(true);
    expect(bar.dataset.axis).toBe('y');
    expect(bar.dataset.state).toBe('visible');
    expect(bar.querySelector('[data-embedpdf-scrollbar-thumb]')?.classList.contains('thumb')).toBe(
      true,
    );

    const metrics = () => view.container.querySelector<HTMLElement>('.metrics')!.dataset;
    expect(Number(metrics().height)).toBeGreaterThan(600);
    kernel.capability(host).scrollTo({ top: 300 });
    flushSync();
    await waitFor(() => expect(Number(metrics().top)).toBe(300));
  });
});
