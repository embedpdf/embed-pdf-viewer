import type { MeasurementAppearance, Subtype, Point } from '@embedpdf/core-annotation';
import { pageSpace, type PageRotation } from '@embedpdf/core-geometry';
import {
  isDimension,
  isReadout,
  measurementReadout,
  viewportForPoint,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { ActionsToken as PublicActionsToken } from '@embedpdf/plugin-actions/contract';

import type { ChromeReads } from '../read/chrome';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Measurement } from './measurement';
import { createAnnotationHoverFeed } from '../tools/hover-feed';

type Phase = 'down' | 'move' | 'up';

/**
 * Pointer intents: the gesture samples the interaction handlers forward
 * (edit, marquee, create, hover), each folded into the pure core with this
 * plugin's inputs filled in (page box, chrome geometry, engaged ids, view).
 */
export function createPointer(
  ctx: Pick<AnnotationContext, 'doc' | 'tryGet'>,
  {
    store,
    geometry,
    authority,
    tools,
    behaviors,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'authority' | 'tools' | 'behaviors'>,
  chrome: Pick<ChromeReads, 'chromeGeomAt' | 'grabBoost' | 'hitAt'>,
  measurement: Pick<Measurement, 'viewportsOf'>,
) {
  // The E/X trigger feed (actions plugin present): driven only from the
  // pointer-driven hoverAt diff below — see hover-feed.ts for the law.
  const actionsForHover = ctx.tryGet(PublicActionsToken);
  const hoverFeed = actionsForHover
    ? createAnnotationHoverFeed(actionsForHover, (id) => store.model().byId[id] ?? null)
    : null;

  const api = {
    editPointer: (
      phase: Phase,
      page: PageRef,
      point: Point,
      shift: boolean,
      scale?: number,
      rotation?: PageRotation,
      zoom?: number,
      touch?: boolean,
    ) => {
      store.commit({
        type: 'editPointer',
        phase,
        in: {
          page,
          point,
          shift,
          pageBox: geometry.pageBoxOf(page.pageObjectNumber),
          // Touch grabs with the same widened zones the claim used, so the
          // gesture picks up exactly what claimsTouchAt said it would.
          chrome: chrome.chromeGeomAt(scale, chrome.grabBoost(touch)),
          inert: behaviors.engagedIdsOn(page.pageObjectNumber),
          // the view env (screen-anchored bodies hit/clamp at their footprint)
          ...(zoom != null ? { zoom } : {}),
          ...(rotation != null ? { displayRotation: rotation } : {}),
        },
      });
    },
    marqueePointer: (
      phase: Phase,
      page: PageRef,
      point: Point,
      shift: boolean,
      _scale?: number,
      rotation?: PageRotation,
      zoom?: number,
    ) => {
      store.commit({
        type: 'marqueePointer',
        phase,
        in: {
          page,
          point,
          shift,
          pageBox: geometry.pageBoxOf(page.pageObjectNumber),
          inert: behaviors.engagedIdsOn(page.pageObjectNumber),
          ...(zoom != null ? { zoom } : {}),
          ...(rotation != null ? { displayRotation: rotation } : {}),
        },
      });
    },
    createPointer: (
      tool: string,
      phase: Phase,
      page: PageRef,
      point: Point,
      finish = false,
      displayRotation?: PageRotation,
    ) => {
      const pageObjectNumber = page.pageObjectNumber;
      // No create authority → creation gestures are inert: no ghost, no
      // draft, no doomed 403. The engine enforces; this keeps pixels honest.
      const resolvedTool = tools.get(tool);
      if (
        resolvedTool?.meta?.capture === true
          ? !ctx.doc?.security.allows('doc.annotate.modify')
          : !authority.canCreate()
      )
        return;
      // Resolve the authoring tool to its routing subtype + defaults key. Two
      // tools can share a subtype (line / arrow); `preset` keeps their defaults
      // apart. Unknown id → treat it as a bare subtype (headless/programmatic).
      // The tool's `upright` policy + the sample's display rotation ride the
      // input bag; the core captures them on the draft at down.
      const crop = geometry.cropOf(pageObjectNumber);
      const cache = measurement.viewportsOf(pageObjectNumber);
      const draft = store.model().draft;
      const continuingMeasurement =
        (draft?.kind === 'create-distance' || draft?.kind === 'create-poly') &&
        draft.page.pageObjectNumber === pageObjectNumber &&
        draft.preset === (resolvedTool?.preset ?? tool);
      const dimension = resolvedTool && isDimension(resolvedTool);
      if (dimension && phase === 'down' && !continuingMeasurement && (!crop || !cache?.viewports)) {
        return;
      }
      const viewport =
        crop && cache?.viewports
          ? viewportForPoint(cache.viewports, pageSpace(crop).pageToPdf(point))
          : undefined;
      const measure: MeasurementAppearance | undefined =
        dimension && crop && cache
          ? {
              intent: resolvedTool.intent as MeasurementAppearance['intent'],
              measure: viewport ? (viewport.measure ?? null) : cache.fallback,
              caption: resolvedTool.measurement?.caption ?? { enabled: true },
              ...(resolvedTool.intent === 'LineDimension'
                ? { leader: resolvedTool.measurement?.leader }
                : {}),
              crop,
              text: '',
            }
          : undefined;
      // Resolve the scale at the first point. Subsequent points retain the
      // draft's snapshot, even when the pointer crosses another viewport.
      if (
        measure &&
        phase === 'down' &&
        !continuingMeasurement &&
        !isReadout(
          measurementReadout({
            subtype: resolvedTool!.subtype,
            intent: measure.intent,
            measure: measure.measure,
            linePoints: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
            vertices: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
          }),
        )
      )
        return;
      store.commit({
        type: 'createPointer',
        measure,
        capture: resolvedTool?.meta?.capture === true ? tool : undefined,
        phase,
        subtype: resolvedTool?.subtype ?? (tool as Subtype),
        preset: resolvedTool?.preset ?? tool,
        intent: resolvedTool?.intent === 'ink-highlight' ? resolvedTool.intent : undefined,
        clickCreate: resolvedTool?.clickCreate,
        flags: resolvedTool?.flags,
        deferInkCommit: (resolvedTool?.ink?.groupStrokesMs ?? 0) > 0,
        straightenInk: resolvedTool?.ink?.straighten,
        in: {
          page,
          point,
          shift: false,
          finish,
          pageBox: geometry.pageBoxOf(pageObjectNumber),
          displayRotation,
          upright: resolvedTool?.upright,
        },
      });
    },
    hoverAt: (
      at: { page: PageRef; point: Point; scale?: number; rotation?: number; zoom?: number } | null,
    ) => {
      const model = store.model();
      let id: string | null = null;
      if (at) {
        const target = chrome.hitAt(at.page, at.point, {
          scale: at.scale,
          rotation: at.rotation,
          zoom: at.zoom,
        });
        if (target.kind === 'annot') id = target.id;
      }
      // Diff here so the reducer sees enter/leave transitions only. The E/X
      // feed hangs off this seam alone: reducer-side hover clears
      // (session-hide, remove, reload) bypass it, so effect-induced hover
      // loss never fires a cursor exit (the anti-cascade law).
      if (model.hovered !== id) {
        hoverFeed?.hover(id);
        store.commit({ type: 'hover', id });
      }
    },
  };

  return { api };
}
