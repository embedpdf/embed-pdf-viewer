import {
  canMove,
  chrome as coreChrome,
  cursorAt,
  hitTest,
  selectionAnchor as coreSelectionAnchor,
  type ChromeGeometry,
  type ChromeNode,
  type Id,
  type Model,
  type Rect,
  type Point,
} from '@embedpdf/core-annotation';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { ChromeSettings } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import { viewEnv } from '../services/geometry';
import { refsOfIn } from '../services/store';

/** The view a pointer sample arrives in: px per content unit, display rotation, relative zoom. */
export interface HitView {
  scale?: number;
  rotation?: number;
  zoom?: number;
}

/** Finger-sized grab zones: 2× the mouse tolerances lands a ~24px handle hit
 *  box in Apple's ~44pt-target territory without moving any visuals. */
export const TOUCH_GRAB_BOOST = 2;

/**
 * Selection chrome and hit-testing: the chrome nodes a page paints, the
 * selection anchor, and every "what is under this point" question, all
 * projected through the live chrome settings and the page's view scale.
 */
export function createChromeReads(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, geometry, behaviors }: Pick<AnnotationServices, 'store' | 'geometry' | 'behaviors'>,
) {
  const chromeSettings = (): ChromeSettings => ctx.state.get().chrome;

  /** The CSS-px chrome settings converted to content units by the page's view
   *  scale (px per content unit) — screen-constant grab zones + stalk at every
   *  zoom. No scale → the values are read as content units (headless callers).
   *  `boost` widens the grab tolerances only (never the drawn chrome or the
   *  knob's position) — the touch path passes {@link TOUCH_GRAB_BOOST} so
   *  handles present finger-sized targets. */
  const chromeGeomAt = (scale?: number, boost = 1): ChromeGeometry => {
    const cs = chromeSettings();
    const effectiveScale = scale || 1;
    return {
      handleTol: (cs.handles.hitSize / 2 / effectiveScale) * boost,
      knobTol: (cs.knob.hitSize / 2 / effectiveScale) * boost,
      knobOffset: cs.knob.offset / effectiveScale,
    };
  };
  const grabBoost = (touch?: boolean): number => (touch ? TOUCH_GRAB_BOOST : 1);

  /** The core hit-test with this plugin's inputs filled in: chrome geometry
   *  at the view scale, the page box, and the engaged (inert) ids. Pass
   *  `inert: null` to test with no inert set at all. */
  const hitAt = (
    page: PageRef,
    point: Point,
    view: HitView = {},
    boost = 1,
    inert: ReadonlySet<Id> | null | undefined = undefined,
  ) => {
    const model = store.model();
    const pageObjectNumber = page.pageObjectNumber;
    return hitTest(
      model,
      page,
      point,
      chromeGeomAt(view.scale, boost),
      model.hitMargin,
      geometry.pageBoxOf(pageObjectNumber),
      inert === undefined ? behaviors.engagedIdsOn(pageObjectNumber) : (inert ?? undefined),
      viewEnv(view.zoom, view.rotation),
    );
  };

  // Memoize the derived per-page arrays by input identity, so a selector returns
  // a stable reference between dispatches (useSyncExternalStore needs this — the
  // model object only changes when `update` produces a new one; chrome also keys
  // on the settings object + the page scale it was projected with).
  const chromeCache = new Map<
    number,
    {
      model: Model;
      cs: ChromeSettings;
      scale: number | undefined;
      rotation: number | undefined;
      zoom: number | undefined;
      v: ChromeNode[];
    }
  >();
  const chromeNodesOf = (
    page: PageRef,
    scale?: number,
    rotation?: number,
    zoom?: number,
  ): ChromeNode[] => {
    const pageObjectNumber = page.pageObjectNumber;
    const model = store.model();
    const cs = chromeSettings();
    const cached = chromeCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.cs === cs &&
      cached.scale === scale &&
      cached.rotation === rotation &&
      cached.zoom === zoom
    )
      return cached.v;
    let nodes = coreChrome(
      model,
      page,
      geometry.pageBoxOf(pageObjectNumber),
      chromeGeomAt(scale).knobOffset,
      viewEnv(zoom, rotation),
    );
    // `guides.enabled` is presentation config, filtered here so the emitted
    // chrome stays authoritative for every painter (default and headless alike).
    if (!cs.guides.enabled) nodes = nodes.filter((node) => node.kind !== 'rotate-guides');
    chromeCache.set(pageObjectNumber, { model: model, cs, scale, rotation, zoom, v: nodes });
    return nodes;
  };

  // Anchor for the selection menu — memoized by input identity so the selector
  // returns a stable reference between unrelated dispatches.
  let anchorCache: {
    model: Model;
    cs: ChromeSettings;
    scale: number | undefined;
    rotation: number | undefined;
    zoom: number | undefined;
    v: { page: PageRef; bounds: Rect; knob?: Point } | null;
  } | null = null;
  const selectionAnchorOf = (
    scale?: number,
    rotation?: number,
    zoom?: number,
  ): { page: PageRef; bounds: Rect; knob?: Point } | null => {
    const model = store.model();
    const cs = chromeSettings();
    if (
      anchorCache &&
      anchorCache.model === model &&
      anchorCache.cs === cs &&
      anchorCache.scale === scale &&
      anchorCache.rotation === rotation &&
      anchorCache.zoom === zoom
    )
      return anchorCache.v;
    const anchor = coreSelectionAnchor(
      model,
      (page) => geometry.pageBoxOf(page.pageObjectNumber),
      () => chromeGeomAt(scale).knobOffset,
      () => viewEnv(zoom, rotation),
    );
    anchorCache = { model: model, cs, scale, rotation, zoom, v: anchor };
    return anchor;
  };

  const api = {
    listChromeNodes: (page: PageRef, scale?: number, rotation?: number, zoom?: number) =>
      chromeNodesOf(page, scale, rotation, zoom),
    getSelectionAnchor: (view?: HitView) =>
      selectionAnchorOf(view?.scale, view?.rotation, view?.zoom),
    hitTestAt: (page: PageRef, point: Point) => {
      const model = store.model();
      const target = hitAt(page, point);
      if (target.kind === 'annot') return model.byId[target.id]?.ref ?? null;
      if (target.kind === 'empty') return null;
      return refsOfIn(model, model.selected)[0] ?? null; // a handle or the knob belongs to the selection
    },
    getHitKind: (
      page: PageRef,
      point: Point,
      scale?: number,
      rotation?: number,
      zoom?: number,
      touch?: boolean,
    ) => hitAt(page, point, { scale, rotation, zoom }, grabBoost(touch)).kind,
    claimsTouchAt: (
      page: PageRef,
      point: Point,
      scale?: number,
      rotation?: number,
      zoom?: number,
    ) => {
      const model = store.model();
      const target = hitAt(page, point, { scale, rotation, zoom }, TOUCH_GRAB_BOOST);
      // Selection chrome only exists for the selection — always a claim (the
      // hit-tester already suppresses handles on kinds/states that can't
      // resize or rotate).
      if (target.kind === 'handle' || target.kind === 'rotate' || target.kind === 'group-handle')
        return true;
      // A body claims only when a drag would actually arm A move — mirror the
      // core's edit-down exactly (update.ts editPointer: a hit on a selected
      // member moves the whole selection only if every member canMove). A
      // selected highlight/caret (selectable, not movable) and a locked
      // annotation must keep scrolling, never eat the drag into a dead zone.
      if (target.kind === 'annot') {
        return (
          model.selected.includes(target.id) && model.selected.every((id) => canMove(model, id))
        );
      }
      return false;
    },
    getCursorAt: (
      page: PageRef,
      point: Point,
      scale?: number,
      rotation?: number,
      zoom?: number,
    ) => {
      const pageObjectNumber = page.pageObjectNumber;
      const model = store.model();
      return cursorAt(
        model,
        page,
        point,
        chromeGeomAt(scale),
        model.hitMargin,
        geometry.pageBoxOf(pageObjectNumber),
        behaviors.engagedIdsOn(pageObjectNumber),
        viewEnv(zoom, rotation),
      );
    },
  };

  return { chromeSettings, chromeGeomAt, grabBoost, hitAt, api };
}

export type ChromeReads = ReturnType<typeof createChromeReads>;
