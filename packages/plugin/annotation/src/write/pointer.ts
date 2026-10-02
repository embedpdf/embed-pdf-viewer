import {
  defaultsFor,
  type MeasurementAppearance,
  type KindName,
  type Point,
} from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import {
  isDimension,
  isReadout,
  measurementReadout,
  viewportForPoint,
  type LineLeader,
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
    afterCreate,
  }: Pick<
    AnnotationServices,
    'store' | 'geometry' | 'authority' | 'tools' | 'behaviors' | 'afterCreate'
  >,
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
          pageBox: geometry.pageBoxOf(page.objectNumber),
          // Touch grabs with the same widened zones the claim used, so the
          // gesture picks up exactly what claimsTouchAt said it would.
          chrome: chrome.chromeGeomAt(scale, chrome.grabBoost(touch)),
          // Screen-pixel settings (the alignment threshold) convert by it.
          ...(scale ? { scale } : {}),
          inert: behaviors.engagedIdsOn(page.objectNumber),
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
          pageBox: geometry.pageBoxOf(page.objectNumber),
          inert: behaviors.engagedIdsOn(page.objectNumber),
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
      const pageObjectNumber = page.objectNumber;
      // No create authority → creation gestures are inert: no ghost, no
      // draft, no doomed 403. The engine enforces; this keeps pixels honest.
      const resolvedTool = tools.get(tool);
      if (
        resolvedTool?.capture === true
          ? !ctx.doc?.security.allows('doc.annotate.modify')
          : !authority.canCreate()
      )
        return;
      // Resolve the authoring tool to its routing subtype + defaults key. Two
      // tools can share a subtype (line / arrow); `preset` keeps their defaults
      // apart. Unknown id → treat it as a bare subtype (headless/programmatic).
      // The tool's `upright` policy + the sample's display rotation ride the
      // input bag; the core captures them on the draft at down.
      const laidOut = geometry.sizeOf(pageObjectNumber) !== null;
      const cache = measurement.viewportsOf(pageObjectNumber);
      const draft = store.model().draft;
      const continuingMeasurement =
        (draft?.kind === 'create-distance' || draft?.kind === 'create-poly') &&
        draft.page.objectNumber === pageObjectNumber &&
        draft.preset === (resolvedTool?.preset ?? tool);
      // A tool's intent, caption and leader are among its defaults (the user's changes included).
      const own = resolvedTool ? defaultsFor(store.model(), resolvedTool.preset) : {};
      const intent = own.intent as string | undefined;
      const dimension = resolvedTool && isDimension({ subtype: resolvedTool.subtype, intent });
      if (
        dimension &&
        phase === 'down' &&
        !continuingMeasurement &&
        (!laidOut || !cache?.viewports)
      ) {
        return;
      }
      const viewport =
        laidOut && cache?.viewports ? viewportForPoint(cache.viewports, point) : undefined;
      const scale = viewport ? (viewport.measure ?? null) : cache?.fallback;
      const captionEnabled = (own.captionEnabled as boolean | null | undefined) ?? true;
      const measure: MeasurementAppearance | undefined =
        dimension && laidOut && cache
          ? intent === 'line-dimension'
            ? {
                intent,
                measure: scale ?? null,
                captionEnabled,
                captionPosition: (own.captionPosition as 'inline' | 'top' | undefined) ?? 'inline',
                captionOffset: null,
                leader: (own.leader as LineLeader | undefined) ?? null,
                contents: '',
              }
            : {
                intent: intent as 'polyline-dimension' | 'polygon-dimension',
                measure: scale ?? null,
                captionEnabled,
                contents: '',
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
      const committed = store.commit(
        {
          type: 'createPointer',
          measure,
          capture: resolvedTool?.capture === true ? tool : undefined,
          phase,
          subtype: resolvedTool?.subtype ?? (tool as KindName),
          preset: resolvedTool?.preset ?? tool,
          intent: intent === 'ink-highlight' ? intent : undefined,
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
        },
        afterCreate.shape(resolvedTool?.id),
      );
      afterCreate.done(resolvedTool?.id, committed);
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
