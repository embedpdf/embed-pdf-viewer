/**
 * Zoom verbs. Pointer-less zooms magnify around the zoomAlign focal point
 * (pinch and wheel pass their own pointer to `zoomAround`: physics beats
 * policy); fit modes are zoom intents written through the settings; the
 * double-tap ladder ascends reading postures.
 */
import { anchorAtPoint, resolveZoom, toWorld, ZOOM_MAX, ZoomMode } from '@embedpdf/core-stage';
import { addRotations, type PageRotation } from '@embedpdf/core-geometry';
import type { PluginContext } from '@embedpdf/core';

import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageGestures } from '../camera/gestures';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, type StageState } from '../model';
import type { StageServices } from '../services';
import type { StageSettingsArea } from '../settings/settings';

/** The zoom factor of one zoomIn or zoomOut step. */
const ZOOM_STEP = 1.2;

export function createZoom(
  ctx: PluginContext<StageState>,
  { scene }: Pick<StageServices, 'scene'>,
  { syncCursorFromCamera }: Pick<StageCameraWrite, 'syncCursorFromCamera'>,
  {
    cancelAnimation,
    animateZoomAnchored,
  }: Pick<StageAnimation, 'cancelAnimation' | 'animateZoomAnchored'>,
  gestures: StageGestures['api'],
  settings: Pick<StageSettingsArea, 'updateSettings'>,
) {
  const { camera, viewport, padding, paged, itemIndexOfPage, buildScene, alignPoint, fitBox } =
    scene;
  const state = () => ctx.state.get();
  const zoomAlignPoint = () => alignPoint(state().zoomAlign, viewport());

  const setViewRotation = (viewRotation: PageRotation): void =>
    settings.updateSettings({ viewRotation });

  return {
    api: {
      doubleTapZoom: (point) => {
        cancelAnimation();
        const before = buildScene();
        if (!before.itemCount) return;
        const item = paged() ? before.items[0] : before.items[itemIndexOfPage(state().cursor)];
        // The ladder (the platform convention) ascends reading postures, each
        // derived from a zoom intent: see the page (automatic), read the text
        // (fit-width), inspect (2.5× the automatic fit). Stops within 10% of
        // a neighbor collapse, so on phones, where automatic is fit-width,
        // the ladder is the familiar two-state toggle.
        //
        // As on iOS, the ladder ascends only from a rung: a tap at a posture
        // moves to the next, wrapping past the top. A pinch to any other
        // level leaves the ladder, and a double-tap there resets to the base
        // fit ("take me back to reading"), never a further zoom-in.
        const fit = fitBox(item);
        const automatic = resolveZoom({ mode: ZoomMode.Automatic }, fit, viewport(), padding());
        const fitWidth = resolveZoom({ mode: ZoomMode.FitWidth }, fit, viewport(), padding());
        const stops = [automatic, fitWidth, Math.min(automatic * 2.5, ZOOM_MAX)]
          .sort((left, right) => left - right)
          .filter((zoom, index, all) => index === 0 || zoom > all[index - 1] * 1.1);
        // The same ±10% band the dedupe uses: "at a posture" tolerates fit drift.
        const near = (zoom: number, stop: number) => zoom > stop / 1.1 && zoom < stop * 1.1;
        const onRung = stops.findIndex((stop) => near(camera().zoom, stop));
        const target = onRung >= 0 ? stops[(onRung + 1) % stops.length] : stops[0];
        // The intent commits up front, as in `reveal`: a caught tween must
        // never leave the camera at an intermediate zoom while the stored
        // intent still says "fit", or the next refit would snap somewhere the
        // user did not ask for.
        ctx.state.update(patchSettings, { zoom: { level: target } });
        // Wrapped grids re-layout on the intent change: anchor the focal
        // point against the scene that will actually be on screen.
        const after = buildScene();
        if (!after.itemCount) return;
        const focal = anchorAtPoint(after, toWorld(camera(), point));
        // The focal-anchored tween keeps the tapped point still.
        animateZoomAnchored(focal, point, target, undefined, syncCursorFromCamera);
      },
      zoomIn: () => gestures.zoomAround(zoomAlignPoint(), ZOOM_STEP),
      zoomOut: () => gestures.zoomAround(zoomAlignPoint(), 1 / ZOOM_STEP),
      zoomTo: (zoom, options) => {
        if (typeof zoom === 'number') {
          if (options?.around) gestures.zoomAround(options.around, zoom / camera().zoom);
          else settings.updateSettings({ zoom: { level: zoom } });
          return;
        }
        settings.updateSettings({ zoom });
      },
      zoomBy: (factor, options) => gestures.zoomAround(options?.around ?? zoomAlignPoint(), factor),
      fitWidth: () => settings.updateSettings({ zoom: { mode: ZoomMode.FitWidth } }),
      fitPage: () => settings.updateSettings({ zoom: { mode: ZoomMode.FitPage } }),
      fitAll: () => settings.updateSettings({ zoom: { mode: ZoomMode.FitAll } }),
      fitAutomatic: () => settings.updateSettings({ zoom: { mode: ZoomMode.Automatic } }),
      setViewRotation,
      rotateViewBy: (delta) =>
        setViewRotation(addRotations(state().viewRotation, delta === 90 ? 90 : 270)),
    } satisfies Partial<StageHostCapability>,
  };
}
