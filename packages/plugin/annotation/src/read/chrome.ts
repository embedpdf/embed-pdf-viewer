import {
  canMove,
  chrome as coreChrome,
  cursorAt,
  hitTest,
  selectionAnchor as coreSelectionAnchor,
  type ChromeGeom,
  type ChromeNode,
  type Id,
  type Model,
  type Rect,
  type Vec,
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
  ctx: Pick<AnnotationContext, 'getState'>,
  { store, geometry, behaviors }: Pick<AnnotationServices, 'store' | 'geometry' | 'behaviors'>,
) {
  const chromeSettings = (): ChromeSettings => ctx.getState().chrome;

  /** The CSS-px chrome settings converted to CONTENT units by the page's view
   *  scale (px per content unit) — screen-constant grab zones + stalk at every
   *  zoom. No scale → the values are read as content units (headless callers).
   *  `boost` widens the GRAB tolerances only (never the drawn chrome or the
   *  knob's position) — the touch path passes {@link TOUCH_GRAB_BOOST} so
   *  handles present finger-sized targets. */
  const chromeGeomAt = (scale?: number, boost = 1): ChromeGeom => {
    const cs = chromeSettings();
    const s = scale || 1;
    return {
      handleTol: (cs.handles.hitSize / 2 / s) * boost,
      knobTol: (cs.knob.hitSize / 2 / s) * boost,
      knobOffset: cs.knob.offset / s,
    };
  };
  const grabBoost = (touch?: boolean): number => (touch ? TOUCH_GRAB_BOOST : 1);

  /** The core hit-test with this plugin's inputs filled in: chrome geometry
   *  at the view scale, the page box, and the engaged (inert) ids. Pass
   *  `inert: null` to test with no inert set at all. */
  const hitAt = (
    page: PageRef,
    point: Vec,
    view: HitView = {},
    boost = 1,
    inert: ReadonlySet<Id> | null | undefined = undefined,
  ) => {
    const m = store.model();
    const pon = page.pageObjectNumber;
    return hitTest(
      m,
      page,
      point,
      chromeGeomAt(view.scale, boost),
      m.hitMargin,
      geometry.pageBoxOf(pon),
      inert === undefined ? behaviors.engagedIdsOn(pon) : (inert ?? undefined),
      viewEnv(view.zoom, view.rotation),
    );
  };

  // Memoize the derived per-page arrays by input identity, so a selector returns
  // a STABLE reference between dispatches (useSyncExternalStore needs this — the
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
    const pon = page.pageObjectNumber;
    const m = store.model();
    const cs = chromeSettings();
    const c = chromeCache.get(pon);
    if (
      c &&
      c.model === m &&
      c.cs === cs &&
      c.scale === scale &&
      c.rotation === rotation &&
      c.zoom === zoom
    )
      return c.v;
    let v = coreChrome(
      m,
      page,
      geometry.pageBoxOf(pon),
      chromeGeomAt(scale).knobOffset,
      viewEnv(zoom, rotation),
    );
    // `guides.enabled` is presentation config, filtered HERE so the emitted
    // chrome stays authoritative for every painter (default and headless alike).
    if (!cs.guides.enabled) v = v.filter((n) => n.kind !== 'rotate-guides');
    chromeCache.set(pon, { model: m, cs, scale, rotation, zoom, v });
    return v;
  };

  // Anchor for the selection menu — memoized by input identity so the selector
  // returns a stable reference between unrelated dispatches.
  let anchorCache: {
    model: Model;
    cs: ChromeSettings;
    scale: number | undefined;
    rotation: number | undefined;
    zoom: number | undefined;
    v: { page: PageRef; bounds: Rect; knob?: Vec } | null;
  } | null = null;
  const selectionAnchorOf = (
    scale?: number,
    rotation?: number,
    zoom?: number,
  ): { page: PageRef; bounds: Rect; knob?: Vec } | null => {
    const m = store.model();
    const cs = chromeSettings();
    if (
      anchorCache &&
      anchorCache.model === m &&
      anchorCache.cs === cs &&
      anchorCache.scale === scale &&
      anchorCache.rotation === rotation &&
      anchorCache.zoom === zoom
    )
      return anchorCache.v;
    const v = coreSelectionAnchor(
      m,
      (page) => geometry.pageBoxOf(page.pageObjectNumber),
      () => chromeGeomAt(scale).knobOffset,
      () => viewEnv(zoom, rotation),
    );
    anchorCache = { model: m, cs, scale, rotation, zoom, v };
    return v;
  };

  const api = {
    listChromeNodes: (page: PageRef, scale?: number, rotation?: number, zoom?: number) =>
      chromeNodesOf(page, scale, rotation, zoom),
    getSelectionAnchor: (view?: HitView) =>
      selectionAnchorOf(view?.scale, view?.rotation, view?.zoom),
    hitTestAt: (page: PageRef, point: Vec) => {
      const m = store.model();
      const t = hitAt(page, point);
      if (t.t === 'annot') return m.byId[t.id]?.ref ?? null;
      if (t.t === 'empty') return null;
      return refsOfIn(m, m.selected)[0] ?? null; // a handle or the knob belongs to the selection
    },
    getHitKind: (
      page: PageRef,
      point: Vec,
      scale?: number,
      rotation?: number,
      zoom?: number,
      touch?: boolean,
    ) => hitAt(page, point, { scale, rotation, zoom }, grabBoost(touch)).t,
    claimsTouchAt: (
      page: PageRef,
      point: Vec,
      scale?: number,
      rotation?: number,
      zoom?: number,
    ) => {
      const m = store.model();
      const t = hitAt(page, point, { scale, rotation, zoom }, TOUCH_GRAB_BOOST);
      // Selection chrome only exists FOR the selection — always a claim (the
      // hit-tester already suppresses handles on kinds/states that can't
      // resize or rotate).
      if (t.t === 'handle' || t.t === 'rotate' || t.t === 'group-handle') return true;
      // A body claims only when a drag would actually ARM A MOVE — mirror the
      // core's edit-down exactly (update.ts editPointer: a hit on a selected
      // member moves the WHOLE selection only if every member canMove). A
      // selected highlight/caret (selectable, not movable) and a locked
      // annotation must keep scrolling, never eat the drag into a dead zone.
      if (t.t === 'annot') {
        return m.selected.includes(t.id) && m.selected.every((id) => canMove(m, id));
      }
      return false;
    },
    getCursorAt: (page: PageRef, point: Vec, scale?: number, rotation?: number, zoom?: number) => {
      const pon = page.pageObjectNumber;
      const m = store.model();
      return cursorAt(
        m,
        page,
        point,
        chromeGeomAt(scale),
        m.hitMargin,
        geometry.pageBoxOf(pon),
        behaviors.engagedIdsOn(pon),
        viewEnv(zoom, rotation),
      );
    },
  };

  return { chromeSettings, chromeGeomAt, grabBoost, hitAt, api };
}

export type ChromeReads = ReturnType<typeof createChromeReads>;
