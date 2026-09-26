import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';

import { createStageController } from '../src/controller';
import { initialStageState } from '../src/model';
import type { StageConfig, StageHostCapability } from '../src/host-contract';

function harness(config: StageConfig = {}) {
  const ctx = createTestContext({
    id: 'stage',
    state: initialStageState({ viewUnitsPerPoint: 1, ...config }),
    pages: Array.from({ length: 5 }, (_, index) => ({
      ref: toPageRef(index + 1),
      size: { width: 600, height: 800 },
    })),
  });
  // Typed as the declared host lens: the composed slices' inferred signatures
  // make optional parameters (`options`) look required.
  const stage: StageHostCapability = ctx.connect(createStageController(ctx, config));
  const log: string[] = [];
  stage.onCameraChanged(() => log.push('camera'));
  stage.onZoomChanged((event) =>
    log.push(`zoom:${event.previousLevel}→${event.level}:${event.mode}`),
  );
  stage.onPageChanged((event) =>
    log.push(`page:${event.previousPageIndex}→${event.pageIndex}:${event.page?.index ?? '-'}`),
  );
  stage.onViewportChanged((event) => log.push(`viewport:${event.size.width}x${event.size.height}`));
  stage.onSettingsChanged((event) => log.push(`settings:${event.changed.join(',')}`));
  stage.onMotionEnded(() => log.push('motion-ended'));
  return { stage, log };
}

describe('stage events', () => {
  it('are derived from each committed state change', () => {
    const { stage, log } = harness({ responsive: [] });
    stage.setViewportSize({ width: 1000, height: 700 });
    expect(log[0]).toBe('viewport:1000x700');
    expect(log).toContain('camera');
    log.length = 0;

    stage.goToPageIndex(2, { behavior: 'instant' });
    expect(log).toEqual(['page:0→2:2', 'camera']);
    log.length = 0;

    stage.zoomTo({ level: 2 });
    expect(log[0]).toBe('settings:zoom');
    expect(log).toContain('camera');
    expect(log).toContain('zoom:1→2:custom');
    // A camera change announces the camera before its zoom.
    expect(log.indexOf('camera')).toBeLessThan(log.indexOf('zoom:1→2:custom'));
  });

  it('announce only what changed', () => {
    const { stage, log } = harness();
    stage.setViewportSize({ width: 1000, height: 700 });
    stage.goToPageIndex(1, { behavior: 'instant' });
    log.length = 0;
    stage.goToPageIndex(1, { behavior: 'instant' }); // the camera is written again
    expect(log).toEqual(['camera']);
    log.length = 0;
    stage.updateSettings({ layout: 'vertical' }); // already vertical
    expect(log).toEqual([]);
  });

  it('report the zoom mode of a fit intent', () => {
    const { stage, log } = harness();
    stage.setViewportSize({ width: 1000, height: 700 });
    log.length = 0;
    stage.fitWidth();
    expect(log).toContain('settings:zoom');
    expect(log.some((entry) => entry.startsWith('zoom:') && entry.endsWith(':fit-width'))).toBe(
      true,
    );
  });

  it('announce motionEnded where a tween ends or is stopped', () => {
    const frames: Array<(timestamp: number) => void> = [];
    const { stage, log } = harness({
      scheduler: {
        raf: (callback) => frames.push(callback),
        caf: () => {},
      },
    });
    stage.setViewportSize({ width: 1000, height: 700 });
    stage.goToPageIndex(3); // smooth
    const run = (timestamp: number) => frames.splice(0).forEach((callback) => callback(timestamp));
    run(0);
    run(240);
    expect(log.filter((entry) => entry === 'motion-ended')).toHaveLength(1);

    stage.goToPageIndex(0);
    run(0);
    stage.stopMotion();
    expect(log.filter((entry) => entry === 'motion-ended')).toHaveLength(2);
  });
});
