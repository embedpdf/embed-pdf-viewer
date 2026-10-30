/**
 * Zoom verbs. Pointer-less zooms magnify around the zoomAlign focal point
 * (pinch and wheel pass their own pointer to `zoomAround`: physics beats
 * policy); fit modes are zoom intents written through the settings; zoomIn
 * and zoomOut step through round levels; the double-tap ladder ascends
 * reading postures. Every zoom stays inside the minZoom/maxZoom limits.
 */
import {
  anchorAtPoint,
  clampZoom,
  resolveZoom,
  toWorld,
  ZoomMode,
  type ZoomLimits,
} from '@embedpdf/core-stage';
import { addRotations, type PageRotation } from '@embedpdf/core-geometry';
import type { PluginContext } from '@embedpdf/core';

import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageGestures } from '../camera/gestures';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, type StageModel } from '../model';
import type { StageServices } from '../services';
import type { StageSettingsArea } from '../settings/settings';

/**
 * The levels zoomIn and zoomOut land on, from ZOOM_MIN to ZOOM_MAX: round
 * percentages, as in Acrobat and the browsers' PDF viewers, about 1.25× to
 * 1.5× apart. From a level between two of them (a fit, a pinch), a step goes
 * to the next one, so 137% zooms in to 150%.
 */
const ZOOM_STEPS = [
  0.05,
  0.1,
  0.15,
  0.2,
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  0.75,
  1,
  1.25,
  1.5,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
];
const ZOOM_STEPS_DOWN = [...ZOOM_STEPS].reverse();
/** The smallest change a step makes: a level within 5% of a round level steps past it, so a
 *  press never moves too little to see (98% zooms in to 125%, not 100%). Below the closest
 *  two levels' ratio (2/3 → 3/4), so a step from a round level never skips the next. */
const MIN_STEP = 1.05;
/** Float slack for comparing a zoom with a limit it was clamped to. */
const EPSILON = 1e-9;

/** The next round level above `zoom`, or `limits.max` when that comes first. */
const stepIn = (zoom: number, limits: ZoomLimits): number =>
  clampZoom(ZOOM_STEPS.find((level) => level > zoom * MIN_STEP) ?? limits.max, limits);

/** The next round level below `zoom`, or `limits.min` when that comes first. */
const stepOut = (zoom: number, limits: ZoomLimits): number =>
  clampZoom(ZOOM_STEPS_DOWN.find((level) => level < zoom / MIN_STEP) ?? limits.min, limits);

export function createZoom(
  ctx: PluginContext<StageModel>,
  { scene }: Pick<StageServices, 'scene'>,
  { syncCursorFromCamera }: Pick<StageCameraWrite, 'syncCursorFromCamera'>,
  {
    cancelAnimation,
    animateZoomAnchored,
  }: Pick<StageAnimation, 'cancelAnimation' | 'animateZoomAnchored'>,
  gestures: StageGestures['api'],
  settings: Pick<StageSettingsArea, 'updateSettings'>,
) {
  const {
    camera,
    viewport,
    padding,
    zoomLimits,
    paged,
    itemIndexOfPage,
    buildScene,
    alignPoint,
    fitBox,
  } = scene;
  const state = () => ctx.state.get();
  const zoomAlignPoint = () => alignPoint(state().zoomAlign, viewport());
  // A step to `target`, around the zoomAlign point; none when the limit holds the zoom.
  const stepTo = (target: number, around = zoomAlignPoint()) => {
    if (target !== camera().zoom) gestures.zoomAround(around, target / camera().zoom);
  };

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
        const limits = zoomLimits();
        const automatic = resolveZoom(
          { mode: ZoomMode.Automatic },
          fit,
          viewport(),
          padding(),
          limits,
        );
        const fitWidth = resolveZoom(
          { mode: ZoomMode.FitWidth },
          fit,
          viewport(),
          padding(),
          limits,
        );
        const stops = [automatic, fitWidth, clampZoom(automatic * 2.5, limits)]
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
      zoomIn: (options) => stepTo(stepIn(camera().zoom, zoomLimits()), options?.around),
      zoomOut: (options) => stepTo(stepOut(camera().zoom, zoomLimits()), options?.around),
      canZoomIn: () => camera().zoom < zoomLimits().max * (1 - EPSILON),
      canZoomOut: () => camera().zoom > zoomLimits().min * (1 + EPSILON),
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
