/**
 * The stage controller: the composition root. It builds the plugin's
 * services once (the diffing context, the timing seam, the scene model),
 * wires each area with the services it declares, and assembles the host
 * capability from the areas' API slices. No behavior lives here.
 *
 * Layering, stated honestly: stage-core is PURE spatial math; the areas are
 * the IMPURE platform shell — they dispatch, cache, and own the camera
 * motion. The one host dependency (frame timing) enters through the
 * Scheduler seam. See `docs/plans` for the camera model (every move is
 * defined by what it holds fixed).
 */
import { composeApi } from '@embedpdf/core';
import { createAnimation } from './camera/animation';
import { createGestures } from './camera/gestures';
import { createCameraWrite } from './camera/write';
import type { StageConfig } from './contract';
import type { StageHostCapability } from './host-contract';
import { createArrival } from './navigation/arrive';
import { createReveal } from './navigation/reveal';
import { createZoom } from './navigation/zoom';
import { createPageReads } from './read/pages';
import { createServices, type StageContext } from './services';
import { createSettings } from './settings/settings';
import { createViewLifecycle } from './view/lifecycle';

export function createStageController(
  rawCtx: StageContext,
  config: StageConfig = {},
): StageHostCapability {
  const services = createServices(rawCtx, config);
  const { ctx, events } = services;

  // Reads: pure projections of the scene and the camera.
  const reads = createPageReads(ctx, services);

  // The camera: the one write path, motion over the scheduler, gestures.
  const write = createCameraWrite(ctx, services);
  const animation = createAnimation(services, write);
  const gestures = createGestures(ctx, services, write, animation, reads);

  // Navigation, settings, zoom and the view lifecycle.
  const arrive = createArrival(ctx, services, write, animation);
  const reveal = createReveal(ctx, services, write, animation, arrive);
  const settings = createSettings(ctx, services, config, write, animation, arrive);
  const zoom = createZoom(ctx, services, write, animation, gestures.api, settings);
  const view = createViewLifecycle(ctx, services, animation, arrive, settings);

  const api = composeApi('stage', [
    reads.api,
    animation.api,
    gestures.api,
    arrive.api,
    reveal.api,
    settings.api,
    zoom.api,
    view.api,
    {
      // The change hooks are services, not areas.
      onPageChanged: events.pageChanged.on,
      onZoomChanged: events.zoomChanged.on,
      onCameraChanged: events.cameraChanged.on,
      onMotionEnded: events.motionEnded.on,
      onSettingsChanged: events.settingsChanged.on,
      onViewportChanged: events.viewportChanged.on,
    },
  ]) satisfies StageHostCapability;
  return api;
}
