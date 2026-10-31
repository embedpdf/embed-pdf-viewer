import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createKernel, definePlugin, toPageRef } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { createLocalEngine } from '@embedpdf/engine';

import { createStageController } from '../src/controller';
import { StageToken, type StageHostCapability } from '../src/host-contract';
import { initialStageModel } from '../src/model';
import { stagePlugin } from '../src/stage.plugin';
import { placedStage } from './harness';

const ONE_PAGE = { flow: 'paged', spread: 'none' } as const;

describe('a setting lock', () => {
  it('holds over updateSettings, a restored view and reset, and the base is back when it goes', () => {
    const { stage } = placedStage();
    const unlock = stage.lockSettings({ settings: ONE_PAGE, by: 'protected-display' });
    expect(stage.getSettings()).toMatchObject(ONE_PAGE);

    stage.updateSettings({ flow: 'continuous', spread: 'odd' });
    expect(stage.getSettings()).toMatchObject(ONE_PAGE);
    stage.resetSettings();
    // A saved view keeps what's under the lock, so restoring it never writes the lock's value.
    expect(stage.getViewState()).toMatchObject({ flow: 'continuous', spread: 'none' });
    stage.applyViewState({ ...stage.getViewState(), spread: 'even' });
    expect(stage.getSettings()).toMatchObject(ONE_PAGE);

    // The writes landed underneath: the last of them is what shows once the lock goes.
    unlock();
    expect(stage.getSettings()).toMatchObject({ flow: 'continuous', spread: 'even' });
  });

  it('holds over a responsive rule, which applies again once it goes', () => {
    const { stage } = placedStage();
    stage.setResponsiveRules([{ when: () => true, settings: { spread: 'odd' } }]);
    expect(stage.getSettings().spread).toBe('odd');
    const unlock = stage.lockSettings({ settings: { spread: 'none' }, by: 'kiosk' });
    expect(stage.getSettings().spread).toBe('none');
    stage.setResponsiveRules([{ when: () => true, settings: { spread: 'even' } }]);
    expect(stage.getSettings().spread).toBe('none');
    unlock();
    expect(stage.getSettings().spread).toBe('even');
  });

  it('says who holds a setting and why, in state, even when it changes no value', () => {
    const { ctx, stage } = placedStage();
    expect(stage.getSettings().spread).toBe('none');
    const unlock = stage.lockSettings({
      settings: { spread: 'none' },
      by: 'protected-display',
      reasonKey: 'protectedDisplay.onePageAtATime',
    });
    expect(stage.getLock('spread')).toEqual({
      by: 'protected-display',
      reasonKey: 'protectedDisplay.onePageAtATime',
    });
    expect(ctx.state.get().locks.spread?.by).toBe('protected-display');
    expect(stage.getLock('layout')).toBeNull();
    unlock();
    expect(stage.getLock('spread')).toBeNull();
    unlock(); // letting go twice is harmless
    expect(ctx.state.get().locks).toEqual({});
  });

  it('refuses a second lock at another value, and stacks one at the same value', () => {
    const { stage } = placedStage();
    const first = stage.lockSettings({ settings: { flow: 'paged' }, by: 'protected-display' });
    expect(() => stage.lockSettings({ settings: { flow: 'continuous' }, by: 'kiosk' })).toThrow(
      expect.objectContaining({
        code: 'conflict',
        message: expect.stringMatching(/protected-display/),
      }),
    );
    const second = stage.lockSettings({ settings: { flow: 'paged' }, by: 'kiosk' });
    first();
    // The second still holds it, and now it's the one named.
    expect(stage.getSettings().flow).toBe('paged');
    expect(stage.getLock('flow')?.by).toBe('kiosk');
    second();
    expect(stage.getSettings().flow).toBe('continuous');
  });

  it('refuses the zoom, which gestures set, and what is no setting', () => {
    const { stage } = placedStage();
    expect(() =>
      stage.lockSettings({ settings: { zoom: { level: 2 } } as never, by: 'kiosk' }),
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
    expect(() => stage.lockSettings({ settings: { pages: 2 } as never, by: 'kiosk' })).toThrow(
      expect.objectContaining({ code: 'invalid-input' }),
    );
  });

  it("holds in its own document's stage only", () => {
    const locked = placedStage().stage;
    const other = placedStage().stage;
    locked.lockSettings({ settings: ONE_PAGE, by: 'protected-display' });
    expect(locked.getSettings().flow).toBe('paged');
    expect(other.getSettings().flow).toBe('continuous');
    expect(other.getLock('flow')).toBeNull();
  });

  it('taken before the stage has its box, lays the pages out locked from the first layout', () => {
    const ctx = createTestContext({
      id: 'stage',
      state: initialStageModel({ viewUnitsPerPoint: 1 }),
      pages: Array.from({ length: 5 }, (_, index) => ({
        ref: toPageRef(index + 1),
        size: { width: 600, height: 800 },
      })),
    });
    const stage: StageHostCapability = ctx.connect(createStageController(ctx, {}));
    stage.lockSettings({ settings: ONE_PAGE, by: 'protected-display' });
    const flows: string[] = [];
    stage.onSettingsChanged(({ settings }) => flows.push(settings.flow));

    stage.setViewportSize({ width: 1000, height: 700 });
    expect(stage.getSettings().flow).toBe('paged');
    expect(stage.listVisiblePages().map((page) => page.ref.objectNumber)).toEqual([1]);
    expect(flows).not.toContain('continuous');
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'main',
  'test',
  'fixtures',
  'action_triggers.pdf',
);

describe('a lock taken in connect()', () => {
  it('holds the first time a view can reach the stage', async () => {
    const lockingPlugin = definePlugin({
      id: 'one-page',
      scope: 'document',
      requires: [StageToken],
      create: (ctx) => ({
        api: {},
        connect() {
          // For the document's whole life: the lock goes when the document closes.
          ctx.get(StageToken).lockSettings({ settings: ONE_PAGE, by: 'one-page' });
        },
      }),
    });
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const kernel = createKernel({ engine, plugins: [stagePlugin(), lockingPlugin] });
    // Every state the views are told of: the stage reachable means it's already locked.
    const seen: string[] = [];
    kernel.subscribe(() => {
      const stage = kernel.tryCapability(StageToken, 'locked-from-the-start');
      if (stage) seen.push(stage.getSettings().flow);
    });
    try {
      const bytes = new Uint8Array(await readFile(fixturePath));
      await kernel.documents.open({ kind: 'bytes', id: 'locked-from-the-start', bytes });
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((flow) => flow === 'paged')).toBe(true);
    } finally {
      await kernel.destroy();
    }
  });
});
