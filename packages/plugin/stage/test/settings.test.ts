import { describe, expect, it } from 'vitest';

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
