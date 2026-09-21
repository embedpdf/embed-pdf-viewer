import type { MeasurementAppearance, Subtype, Vec } from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
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
  // The E/X trigger feed (actions plugin present): driven ONLY from the
  // pointer-driven hoverAt diff below — see hover-feed.ts for the law.
  const actionsForHover = ctx.tryGet(PublicActionsToken);
  const hoverFeed = actionsForHover
    ? createAnnotationHoverFeed(actionsForHover, (id) => store.model().byId[id] ?? null)
    : null;

  const api = {
    editPointer: (
      phase: Phase,
      page: PageRef,
      point: Vec,
      shift: boolean,
      scale?: number,
      rotation?: PageRotation,
      zoom?: number,
      touch?: boolean,
    ) => {
      store.commit({
        t: 'editPointer',
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
      point: Vec,
      shift: boolean,
      _scale?: number,
      rotation?: PageRotation,
      zoom?: number,
    ) => {
      store.commit({
        t: 'marqueePointer',
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
      point: Vec,
      finish = false,
      displayRotation?: PageRotation,
    ) => {
      const pon = page.pageObjectNumber;
      // No create authority → creation gestures are inert: no ghost, no
      // draft, no doomed 403. The engine enforces; this keeps pixels honest.
      const t = tools.get(tool);
      if (
        t?.meta?.capture === true
          ? !ctx.doc?.security.allows('doc.annotate.modify')
          : !authority.canCreate()
      )
        return;
      // Resolve the authoring TOOL to its routing subtype + defaults key. Two
      // tools can share a subtype (line / arrow); `preset` keeps their defaults
      // apart. Unknown id → treat it as a bare subtype (headless/programmatic).
      // The tool's `upright` policy + the sample's display rotation ride the
      // input bag; the core captures them on the draft at DOWN.
      const crop = geometry.cropOf(pon);
      const cache = measurement.viewportsOf(pon);
      const draft = store.model().draft;
      const continuingMeasurement =
        (draft?.g === 'create-distance' || draft?.g === 'create-poly') &&
        draft.page.pageObjectNumber === pon &&
        draft.preset === (t?.preset ?? tool);
      const dimension = t && isDimension(t);
      if (dimension && phase === 'down' && !continuingMeasurement && (!crop || !cache?.viewports)) {
        return;
      }
      const viewport =
        crop && cache?.viewports
          ? viewportForPoint(cache.viewports, { x: point.x + crop.left, y: crop.top - point.y })
          : undefined;
      const measure: MeasurementAppearance | undefined =
        dimension && crop && cache
          ? {
              intent: t.intent as MeasurementAppearance['intent'],
              measure: viewport ? (viewport.measure ?? null) : cache.fallback,
              caption: t.measurement?.caption ?? { enabled: true },
              ...(t.intent === 'LineDimension' ? { leader: t.measurement?.leader } : {}),
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
            subtype: t!.subtype,
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
        t: 'createPointer',
        measure,
        capture: t?.meta?.capture === true ? tool : undefined,
        phase,
        subtype: t?.subtype ?? (tool as Subtype),
        preset: t?.preset ?? tool,
        intent: t?.intent === 'ink-highlight' ? t.intent : undefined,
        clickCreate: t?.clickCreate,
        flags: t?.flags,
        deferInkCommit: (t?.ink?.groupStrokesMs ?? 0) > 0,
        straightenInk: t?.ink?.straighten,
        in: {
          page,
          point,
          shift: false,
          finish,
          pageBox: geometry.pageBoxOf(pon),
          displayRotation,
          upright: t?.upright,
        },
      });
    },
    hoverAt: (
      at: { page: PageRef; point: Vec; scale?: number; rotation?: number; zoom?: number } | null,
    ) => {
      const m = store.model();
      let id: string | null = null;
      if (at) {
        const h = chrome.hitAt(at.page, at.point, {
          scale: at.scale,
          rotation: at.rotation,
          zoom: at.zoom,
        });
        if (h.t === 'annot') id = h.id;
      }
      // Diff HERE so the reducer sees enter/leave transitions only. The E/X
      // feed hangs off THIS seam alone: reducer-side hover clears
      // (session-hide, remove, reload) bypass it, so effect-induced hover
      // loss never fires a cursor exit (the anti-cascade law).
      if (m.hovered !== id) {
        hoverFeed?.hover(id);
        store.commit({ t: 'hover', id });
      }
    },
  };

  return { api };
}
