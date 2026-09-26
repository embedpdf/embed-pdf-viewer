/**
 * The stage's six events. Five of them are derived in one `ctx.state.onChange`
 * listener, from the state before and after each committed change, so a new
 * verb can never forget to announce a page, zoom, camera, settings or viewport
 * change. `motionEnded` is an occurrence: the camera animation emits it where a
 * tween or fling ends.
 */
import type { PluginContext } from '@embedpdf/core';

import type {
  StageCameraChangedEvent,
  StageMotionEndedEvent,
  StagePageChangedEvent,
  StageSettingsChangedEvent,
  StageViewportChangedEvent,
  StageZoomChangedEvent,
} from '../contract';
import type { StageState } from '../model';
import { eqSetting } from '../responsive';
import { pickSettings, SETTING_KEYS } from '../settings';

export function createEvents(ctx: PluginContext<StageState>) {
  const pageChanged = ctx.events.source<StagePageChangedEvent>();
  const zoomChanged = ctx.events.source<StageZoomChangedEvent>();
  const cameraChanged = ctx.events.source<StageCameraChangedEvent>();
  const motionEnded = ctx.events.source<StageMotionEndedEvent>();
  const settingsChanged = ctx.events.source<StageSettingsChangedEvent>();
  const viewportChanged = ctx.events.source<StageViewportChangedEvent>();

  ctx.state.onChange(({ previous, next }) => {
    if (previous.camera !== next.camera) {
      cameraChanged.emit({ camera: next.camera });
      if (previous.camera.zoom !== next.camera.zoom) {
        zoomChanged.emit({
          level: next.camera.zoom,
          previousLevel: previous.camera.zoom,
          mode: 'mode' in next.zoom ? next.zoom.mode : 'custom',
        });
      }
    }
    if (previous.cursor !== next.cursor) {
      pageChanged.emit({
        page: ctx.document()?.pages[next.cursor] ?? null,
        pageIndex: next.cursor,
        previousPageIndex: previous.cursor,
      });
    }
    if (previous.viewport !== next.viewport) viewportChanged.emit({ size: next.viewport });
    const changed = SETTING_KEYS.filter((key) => !eqSetting(previous[key], next[key]));
    if (changed.length) settingsChanged.emit({ settings: pickSettings(next), changed });
  });

  return { pageChanged, zoomChanged, cameraChanged, motionEnded, settingsChanged, viewportChanged };
}
export type StageEvents = ReturnType<typeof createEvents>;
