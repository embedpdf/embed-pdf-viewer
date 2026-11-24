import { h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { DocumentGate } from '../src/runtime';
import { Scrollbar, Stage, StageToken, stagePlugin } from '../src/stage';
import { bytesInput, settle, until, viewerWith } from './counter-plugin';

/**
 * The scrollbar in a real Stage: a press on the bar is the bar's own, so the Stage, which
 * listens on an ancestor of it, never begins a pan with it.
 */

const host = StageToken as unknown as CapabilityToken<StageHostCapability>;

enableAutoUnmount(afterEach);

/** A Stage shorter than its page, the bar in its overlay, and the presses that reach below it. */
async function scrollableStage() {
  const { kernel, wrapper } = await viewerWith([stagePlugin({ scrollBehavior: 'instant' })], () =>
    h(DocumentGate, null, () =>
      h('div', { class: 'below' }, [
        h(Stage, null, { overlay: () => h(Scrollbar, { axis: 'y', autoHide: false }) }),
      ]),
    ),
  );
  await kernel.documents.open(bytesInput('a'));
  await settle();
  const stage = kernel.capability(host);
  stage.setViewportSize({ width: 800, height: 200 });
  await until(() => wrapper.find('[data-embedpdf-scrollbar-thumb]').exists());
  const pressesBelow: Event[] = [];
  wrapper.find('.below').element.addEventListener('pointerdown', (event) => {
    pressesBelow.push(event);
  });
  return {
    stage,
    pressesBelow,
    bar: wrapper.find('[data-embedpdf-scrollbar]'),
    thumb: wrapper.find('[data-embedpdf-scrollbar-thumb]'),
  };
}

describe('<Scrollbar>', () => {
  it('keeps a press on the thumb from the page below it, and starts a drag', async () => {
    const { bar, thumb, pressesBelow } = await scrollableStage();

    await thumb.trigger('pointerdown', { button: 0 });

    expect(pressesBelow).toHaveLength(0);
    expect(bar.attributes('data-dragging')).toBe('');
    await bar.trigger('pointerup');
    expect(bar.attributes('data-dragging')).toBeUndefined();
  });

  it('keeps a press on the track from the page below it, and pages toward the pointer', async () => {
    const { stage, bar, pressesBelow } = await scrollableStage();
    expect(stage.getScrollMetrics().scrollTop).toBe(0);

    await bar.trigger('pointerdown', { button: 0, clientY: 150 });
    await bar.trigger('pointerup');

    expect(pressesBelow).toHaveLength(0);
    expect(stage.getScrollMetrics().scrollTop).toBeGreaterThan(0);
  });
});
