import { describe, expect, it } from 'vitest';

import type { StageHostCapability } from '../src/host-contract';
import { DEFAULT_SETTINGS } from '../src/settings';
import { placedStage } from './harness';

describe('stage settings', () => {
  it('include how the view takes pointer input, on by default', () => {
    const { stage } = placedStage();
    const { interaction, panFallback, zoomGestures } = stage.getSettings();
    expect({ interaction, panFallback, zoomGestures }).toEqual({
      interaction: true,
      panFallback: true,
      zoomGestures: true,
    });
  });

  it('change only through updateSettings, which announces what changed', () => {
    const { stage } = placedStage(5, { interaction: false });
    const changed: string[][] = [];
    stage.onSettingsChanged((event) => changed.push([...event.changed]));
    expect(stage.getSettings().interaction).toBe(false);

    stage.updateSettings({ zoomGestures: false, layout: 'horizontal' });
    expect(stage.getSettings()).toMatchObject({ zoomGestures: false, layout: 'horizontal' });
    expect(changed).toEqual([['layout', 'zoomGestures']]);
    expect('setLayout' in stage).toBe(false);

    stage.resetSettings();
    expect(stage.getSettings()).toMatchObject({
      interaction: false, // what the plugin was registered with
      zoomGestures: true,
      layout: 'vertical',
    });
  });

  it('are the same object until a setting changes', () => {
    const { stage } = placedStage();
    const settings = stage.getSettings();
    stage.panBy(0, 120); // the camera moves, no setting does
    expect(stage.getSettings()).toBe(settings);
    stage.updateSettings({ gap: 4 });
    expect(stage.getSettings()).not.toBe(settings);
  });

  it('reserve only the sides a page frame names', () => {
    const { stage } = placedStage(5, { pageFrame: { bottom: 20 } });
    expect(stage.getSettings().pageFrame).toEqual({ top: 0, right: 0, bottom: 20, left: 0 });
    stage.updateSettings({ pageFrame: { top: 8 } });
    expect(stage.getSettings().pageFrame).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
  });

  it('have a default for every setting', () => {
    expect(Object.keys(DEFAULT_SETTINGS)).toEqual(
      expect.arrayContaining(['interaction', 'panFallback', 'zoomGestures']),
    );
  });
});

// Each of these records its level straight into the state, as a gesture does.
const ZOOMS: ReadonlyArray<readonly [string, (stage: StageHostCapability) => void]> = [
  ['a zoom step', (stage) => stage.zoomIn()],
  ['a pinch', (stage) => stage.zoomAround({ x: 500, y: 300 }, 2)],
  ['a double-tap', (stage) => stage.doubleTapZoom({ x: 500, y: 300 })],
  [
    'a reveal with a zoom',
    (stage) => stage.reveal(0, { rect: { x: 100, y: 100, width: 200, height: 100 }, zoom: 'fit' }),
  ],
  [
    'a zoom box',
    (stage) => {
      stage.beginZoomDrag({ x: 300, y: 200 });
      stage.moveZoomDrag({ x: 500, y: 350 });
      stage.endZoomDrag();
    },
  ],
];

describe('a setting asked for again after a zoom', () => {
  it.each(ZOOMS)('applies the fit mode again after %s', (_name, zoom) => {
    const { stage } = placedStage(5, { scrollBehavior: 'instant' });
    const automatic = stage.getZoomLevel();
    zoom(stage);
    expect(stage.getZoomMode()).toBe('custom');
    expect(stage.getZoomLevel()).not.toBeCloseTo(automatic, 3);

    stage.fitAutomatic();
    expect(stage.getZoomMode()).toBe('automatic');
    expect(stage.getZoomLevel()).toBeCloseTo(automatic, 6);
  });

  it('zooms back to the level asked for before', () => {
    const { stage } = placedStage(5, { scrollBehavior: 'instant' });
    stage.zoomTo(1.5);
    stage.zoomAround({ x: 500, y: 300 }, 2);
    expect(stage.getZoomLevel()).toBeCloseTo(3, 6);
    stage.zoomTo(1.5);
    expect(stage.getZoomLevel()).toBeCloseTo(1.5, 6);
  });

  it('goes back to the registered zoom on reset', () => {
    const { stage } = placedStage(5, { scrollBehavior: 'instant' });
    const automatic = stage.getZoomLevel();
    stage.zoomAround({ x: 500, y: 300 }, 2);
    stage.resetSettings();
    expect(stage.getZoomMode()).toBe('automatic');
    expect(stage.getZoomLevel()).toBeCloseTo(automatic, 6);
  });

  it('leaves the zoom alone when another setting changes', () => {
    const { stage } = placedStage(5, { scrollBehavior: 'instant' });
    stage.zoomAround({ x: 500, y: 300 }, 2);
    stage.updateSettings({ gap: 4 });
    expect(stage.getZoomMode()).toBe('custom');
    expect(stage.getZoomLevel()).toBeCloseTo(2, 6);
  });
});
