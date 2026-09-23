/**
 * The stage controller: the composition root. It builds the plugin's services
 * once (the events, the timing seam, the scene model), wires each area with
 * the services it declares, and assembles the host capability from the areas'
 * API slices. stage-core is the pure spatial math; the areas are the impure
 * shell that writes state, caches and drives motion, and frame timing enters
 * only through the scheduler.
 *
 * The camera model: every camera move is defined by what it holds fixed.
 * Gestures (pan, pinch, wheel) hold the page-point under the pointer;
 * navigation lands its target at the arrivalAlign point; positioned reveals
 * and restored viewpoints hold what the call specifies; pointer-less zooms
 * hold the zoomAlign point; reframes (resize, rotation, layout changes) hold
 * the anchorAlign point; and an axis the camera cannot travel rests at fitAlign.
 */
import { composeApi, type PluginContext } from '@embedpdf/core';

import { createAnimation } from './camera/animation';
import { createGestures } from './camera/gestures';
import { createCameraWrite } from './camera/write';
import { connectStage } from './connect';
import type { StageConfig } from './contract';
import type { StageHostCapability } from './host-contract';
import type { StageState } from './model';
import { createArrival } from './navigation/arrive';
import { createReveal } from './navigation/reveal';
import { createZoom } from './navigation/zoom';
import { createPageReads } from './read/pages';
import { createServices } from './services';
import { createSettings } from './settings/settings';
import { createViewLifecycle } from './view/lifecycle';

export function createStageController(
  ctx: PluginContext<StageState>,
  config: StageConfig = {},
) {
  const services = createServices(ctx, config);
  const { events } = services;

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

  const api: StageHostCapability = composeApi('stage', [
    reads.api,
    animation.api,
    gestures.api,
    arrive.api,
    reveal.api,
    settings.api,
    zoom.api,
    view.api,
    {
      onPageChanged: events.pageChanged.on,
      onZoomChanged: events.zoomChanged.on,
      onCameraChanged: events.cameraChanged.on,
      onMotionEnded: events.motionEnded.on,
      onSettingsChanged: events.settingsChanged.on,
      onViewportChanged: events.viewportChanged.on,
    },
  ]);

  return {
    api,
    connect: () => connectStage(ctx, api),
  };
}
