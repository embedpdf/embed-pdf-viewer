/**
 * Zoom verbs. Pointer-less zooms magnify around the zoomAlign focal point
 * (pinch and wheel pass their own pointer to `zoomAround` — physics beats
 * policy); fit modes are zoom INTENTS written through the settings; the
 * double-tap ladder ascends reading postures.
 */
import * as S from '@embedpdf/core-stage';
import { addRotations, type PageRotation } from '@embedpdf/core-geometry';

import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageGestures } from '../camera/gestures';
import type { StageHostCapability } from '../host-contract';
import type { StageContext, StageServices } from '../services';
import type { StageSettingsArea } from '../settings/settings';

export function createZoom(
  ctx: StageContext,
  { scene }: Pick<StageServices, 'scene'>,
  { syncCursorFromCamera }: Pick<StageCameraWrite, 'syncCursorFromCamera'>,
  { cancelAnim, animateZoomAnchored }: Pick<StageAnimation, 'cancelAnim' | 'animateZoomAnchored'>,
  gestures: StageGestures['api'],
  settings: Pick<StageSettingsArea, 'updateSettings'>,
) {
  const { cam, vp, pad, paged, itemIndexOfPage, buildScene, alignPoint, fitBox } = scene;

  const setViewRotation = (viewRotation: PageRotation): void =>
    settings.updateSettings({ viewRotation });

  return {
    api: {
      doubleTapZoom: (pt) => {
        cancelAnim();
        const sc0 = buildScene();
        if (!sc0.itemCount) return;
        const item = paged() ? sc0.items[0] : sc0.items[itemIndexOfPage(ctx.getState().cursor)];
        // The ladder (the platform convention): ascending READING POSTURES, each
        // derived from a zoom intent — see the page (automatic), read the text
        // (fit-width), inspect (2.5× the automatic fit). Stops within 10% of a
        // neighbor collapse — on phones automatic IS fit-width, so the ladder
        // degenerates to the familiar two-state toggle.
        //
        // The rule (iOS's): the ladder ascends only from ON a rung — a tap at a
        // posture moves to the next, wrapping past the top. A pinch to any
        // OTHER level is leaving the ladder, and double-tap there is a RESET to
        // the base fit ("take me back to reading"), never a further zoom-in.
        const fit = fitBox(item);
        const auto = S.resolveZoom({ mode: S.ZoomMode.Automatic }, fit, vp(), pad());
        const fitW = S.resolveZoom({ mode: S.ZoomMode.FitWidth }, fit, vp(), pad());
        const stops = [auto, fitW, Math.min(auto * 2.5, S.ZOOM_MAX)]
          .sort((a, b) => a - b)
          .filter((z, i, all) => i === 0 || z > all[i - 1] * 1.1);
        // the same ±10% band the dedupe uses: "at a posture" tolerates fit drift
        const near = (z: number, stop: number) => z > stop / 1.1 && z < stop * 1.1;
        const onRung = stops.findIndex((s) => near(cam().zoom, s));
        const target = onRung >= 0 ? stops[(onRung + 1) % stops.length] : stops[0];
        // The INTENT commits UP FRONT (the `reveal` precedent): a caught tween
        // must never leave the camera on some intermediate zoom while the stored
        // intent still says "fit" — the next refit would snap somewhere the user
        // didn't ask for. Interrupted or not, the record says where we were going.
        ctx.dispatch({ type: 'PATCH', patch: { zoom: { level: target } } });
        // Wrapped grids re-layout on the intent change — anchor the focal point
        // against the scene that will actually be on screen.
        const sc = buildScene();
        if (!sc.itemCount) return;
        const focal = S.anchorAtPoint(sc, S.toWorld(cam(), pt));
        // The focal-anchored tween: the tapped point holds still by construction
        // (linear coordinate lerps would swing it mid-flight — the "dip").
        animateZoomAnchored(focal, pt, target, 240, syncCursorFromCamera);
      },
      // Pointer-less zooms magnify around the zoomAlign focal point (pinch and
      // wheel pass their own pointer to zoomAround — physics beats policy).
      zoomIn: () => gestures.zoomAround(alignPoint(ctx.getState().zoomAlign, vp()), 1.2),
      zoomOut: () => gestures.zoomAround(alignPoint(ctx.getState().zoomAlign, vp()), 1 / 1.2),
      zoomTo: (zoom, options) => {
        if (typeof zoom === 'number') {
          if (options?.around) gestures.zoomAround(options.around, zoom / cam().zoom);
          else settings.updateSettings({ zoom: { level: zoom } });
          return;
        }
        settings.updateSettings({ zoom });
      },
      zoomBy: (factor, options) =>
        gestures.zoomAround(options?.around ?? alignPoint(ctx.getState().zoomAlign, vp()), factor),
      fitWidth: () => settings.updateSettings({ zoom: { mode: S.ZoomMode.FitWidth } }),
      fitPage: () => settings.updateSettings({ zoom: { mode: S.ZoomMode.FitPage } }),
      fitAll: () => settings.updateSettings({ zoom: { mode: S.ZoomMode.FitAll } }),
      fitAutomatic: () => settings.updateSettings({ zoom: { mode: S.ZoomMode.Automatic } }),
      setViewRotation,
      rotateViewBy: (delta) =>
        setViewRotation(addRotations(ctx.getState().viewRotation, delta === 90 ? 90 : 270)),
    } satisfies Partial<StageHostCapability>,
  };
}
