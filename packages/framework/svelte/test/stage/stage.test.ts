import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import { createCapabilityToken } from '@embedpdf/core';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import {
  DEFAULT_SETTINGS,
  stagePlugin,
  stageState,
  StageToken,
  useStageSettings,
  useStageState,
  useStageToken,
} from '../../src/stage';
import type { StageCapability } from '../../src/stage';
import type { CurrentValue } from '../../src/runtime';
import { bytesInput, pagedEngine } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import StageHarness from '../fixtures/StageHarness.svelte';
import StageScopeProbe from '../fixtures/StageScopeProbe.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The Stage's readers (the declared state with and without a document, each view through its own
 * token, the view's settings) and the `<Stage>` itself: one page surface per visible page with
 * its page content, its chrome and its overlay, and the two-way page and zoom.
 */

const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
const plugins = [
  stagePlugin(),
  stagePlugin({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', interaction: false }),
];
const asHost = (token: CapabilityToken<StageCapability>) =>
  token as unknown as CapabilityToken<StageHostCapability>;
const current = <T>(value: CurrentValue<T>) => value.current;
const probe = (read: () => unknown, pick: (result: never) => unknown) => ({
  read,
  pick: pick as (result: unknown) => unknown,
  seen: [] as unknown[],
});

describe('useStageState', () => {
  it('reads empty with no document, and the view’s state once one is open', async () => {
    const state = probe(
      () => useStageState(),
      (record: object) => ({ ...record }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [state] });
    expect(latest(state.seen)).toEqual(stageState.empty);

    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(latest(state.seen)).toMatchObject({
      currentPageIndex: 0,
      pageCount: 1,
      viewRotation: 0,
    });

    kernel.capability(StageToken).setViewRotation(90);
    flushSync();
    expect(latest(state.seen)).toMatchObject({ viewRotation: 90 });
  });

  it('reads the view a token names, after a selector or alone, or the nearest scope', async () => {
    const main = probe(() => useStageState((state) => state.viewRotation), current);
    const named = probe(() => useStageState((state) => state.viewRotation, ThumbsToken), current);
    const tokenOnly = probe(
      () => useStageState(ThumbsToken),
      (state: { viewRotation: number }) => state.viewRotation,
    );
    const scoped: unknown[] = [];
    const { kernel } = await viewerWith(plugins, StageScopeProbe, {
      probes: [main, named, tokenOnly],
      token: ThumbsToken,
      scoped,
    });
    await kernel.documents.open(bytesInput('a'));
    kernel.capability(asHost(ThumbsToken)).setViewRotation(180);
    flushSync();
    expect(latest(main.seen)).toBe(0);
    expect(latest(named.seen)).toBe(180);
    expect(latest(tokenOnly.seen)).toBe(180);
    expect(latest(scoped)).toBe(180);
  });
});

describe('useStageSettings', () => {
  it('reads the defaults with no document, then the view’s settings as they change', async () => {
    const layouts = probe(() => useStageSettings((settings) => settings.layout), current);
    const whole = probe(
      () => useStageSettings(),
      (settings: { layout: string }) => settings.layout,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [layouts, whole] });
    expect(latest(layouts.seen)).toBe(DEFAULT_SETTINGS.layout);

    await kernel.documents.open(bytesInput('a'));
    kernel.capability(StageToken).updateSettings({ layout: 'horizontal' });
    flushSync();
    expect(latest(layouts.seen)).toBe('horizontal');
    expect(latest(whole.seen)).toBe('horizontal');
  });
});

describe('<Stage>', () => {
  /** A Stage on a three-page document, given a 800 × 600 viewport (happy-dom has no layout). */
  async function stageOn(props: Record<string, unknown> = {}) {
    const seen = { pageIndex: [] as unknown[], zoom: [] as unknown[] };
    const viewer = await viewerWith(
      [stagePlugin()],
      StageHarness,
      { seen, ...props },
      pagedEngine(3),
    );
    await viewer.kernel.documents.open(bytesInput('a'));
    flushSync();
    viewer.kernel.capability(asHost(StageToken)).setViewportSize({ width: 800, height: 600 });
    flushSync();
    return { ...viewer, seen };
  }

  it('draws its content and the chrome on each visible page, with the page context', async () => {
    const { view } = await stageOn();
    await waitFor(() => expect(view.container.querySelectorAll('.page').length).toBeGreaterThan(0));
    const first = view.container.querySelector('.page')!;
    expect(first.getAttribute('data-index')).toBe('0');
    expect(view.container.querySelector('.chrome')?.textContent).toBe('Page 1');
    // A layer inside the snippet reads the same page through `usePage()`.
    const layer = view.container.querySelector('.layer')!;
    expect(layer.getAttribute('data-page')).toBe('1');
    expect(Number(layer.getAttribute('data-scale'))).toBeGreaterThan(0);
  });

  it('binds its overlay to its own lens, with the projection for anchored UI', async () => {
    const { view } = await stageOn();
    await waitFor(() =>
      expect(view.container.querySelector('.overlay')?.getAttribute('data-pages')).toBe('3'),
    );
    await waitFor(() => expect(view.container.querySelector('.badge')).not.toBeNull());
  });

  it('writes the page and the zoom as they change (bind:page, bind:zoom), and goes where the owner sets them', async () => {
    const { kernel, view, seen } = await stageOn();
    const stage = kernel.capability(StageToken);
    await waitFor(() => expect(latest(seen.zoom)).toBe(stage.getZoomLevel()));

    stage.goToPage(2, { behavior: 'instant' });
    flushSync();
    await waitFor(() => expect(latest(seen.pageIndex)).toBe(2));

    await view.rerender({ contentProps: { seen, pageIndex: 0 } });
    flushSync();
    await waitFor(() => expect(stage.getCurrentPageIndex()).toBe(0));

    await view.rerender({ contentProps: { seen, pageIndex: 0, zoom: 2 } });
    flushSync();
    await waitFor(() => expect(stage.getZoomLevel()).toBe(2));
  });
});

describe('useStageToken', () => {
  it('is the explicit token, else the nearest scope, else the main lens', async () => {
    const OtherToken = createCapabilityToken<StageCapability>('stage-other');
    const main = probe(() => useStageToken(), current);
    const explicit = probe(() => useStageToken(OtherToken), current);
    const scoped: unknown[] = [];
    await viewerWith(plugins, StageScopeProbe, {
      probes: [main, explicit],
      token: ThumbsToken,
      scoped,
      tokens: true,
    });
    expect(latest(main.seen)).toBe(StageToken);
    expect(latest(explicit.seen)).toBe(OtherToken);
    expect(latest(scoped)).toBe(ThumbsToken);
  });
});
