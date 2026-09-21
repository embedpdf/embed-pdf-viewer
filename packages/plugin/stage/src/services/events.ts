/**
 * The six change hooks and the ONE place they fire: every state write goes
 * through the diffing `ctx.dispatch` built here, so page, zoom, camera,
 * settings and viewport changes are observed before/after each write and an
 * event can never be forgotten by a new verb.
 */
import { createEventHook } from '@embedpdf/core';

import type {
  StageCameraChangedEvent,
  StageMotionEndedEvent,
  StagePageChangedEvent,
  StageSettingsChangedEvent,
  StageViewportChangedEvent,
  StageZoomChangedEvent,
} from '../contract';
import type { StageState } from '../model';
import { pickSettings, SETTING_KEYS } from '../settings';
import { eqSetting } from '../responsive';
import type { StageContext } from './context';

export function createEvents(rawCtx: StageContext) {
  const pageChanged = createEventHook<StagePageChangedEvent>();
  const zoomChanged = createEventHook<StageZoomChangedEvent>();
  const cameraChanged = createEventHook<StageCameraChangedEvent>();
  const motionEnded = createEventHook<StageMotionEndedEvent>();
  const settingsChanged = createEventHook<StageSettingsChangedEvent>();
  const viewportChanged = createEventHook<StageViewportChangedEvent>();
  rawCtx.cleanup?.(() => {
    for (const hook of [
      pageChanged,
      zoomChanged,
      cameraChanged,
      motionEnded,
      settingsChanged,
      viewportChanged,
    ]) {
      hook.dispose();
    }
  });
  const emitDiffs = (before: StageState, after: StageState): void => {
    if (before === after) return;
    if (before.camera !== after.camera) {
      cameraChanged.emit({ camera: after.camera });
      if (before.camera.zoom !== after.camera.zoom) {
        zoomChanged.emit({
          level: after.camera.zoom,
          previousLevel: before.camera.zoom,
          mode: 'mode' in after.zoom ? after.zoom.mode : 'custom',
        });
      }
    }
    if (before.cursor !== after.cursor) {
      pageChanged.emit({
        page: rawCtx.document()?.pages[after.cursor] ?? null,
        pageIndex: after.cursor,
        previousPageIndex: before.cursor,
      });
    }
    if (before.vp !== after.vp) viewportChanged.emit({ size: after.vp });
    const changed = SETTING_KEYS.filter((key) => !eqSetting(before[key], after[key]));
    if (changed.length) settingsChanged.emit({ settings: pickSettings(after), changed });
  };
  const ctx: StageContext = {
    ...rawCtx,
    dispatch: (action) => {
      const before = rawCtx.getState();
      rawCtx.dispatch(action);
      emitDiffs(before, rawCtx.getState());
    },
  };
  return {
    /** The diffing context — the one every area writes through. */
    ctx,
    pageChanged,
    zoomChanged,
    cameraChanged,
    motionEnded,
    settingsChanged,
    viewportChanged,
  };
}
export type StageEvents = ReturnType<typeof createEvents>;
