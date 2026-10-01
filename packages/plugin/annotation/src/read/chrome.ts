import {
  annotationAnchor,
  canMove,
  chrome as coreChrome,
  type ChromeGeometry,
  type ChromeNode,
  cursorAt,
  hitTest,
  type Id,
  isOnTextBox,
  type Model,
  type Point,
  rotationAnchor,
  type RotationAnchor,
  selectionAnchor as coreSelectionAnchor,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import type { Annotation, AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationAnchor, AnnotationSelectionAnchor, ChromeSettings } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import { viewEnv } from '../services/geometry';
import { recordOfRef } from '../services/store';

/** The view a pointer sample arrives in: px per page unit, display rotation, relative zoom. */
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
  ctx: Pick<AnnotationContext, 'getPage'>,
  {
    store,
    geometry,
    behaviors,
    settings,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'behaviors' | 'settings'>,
) {
  const chromeSettings = (): ChromeSettings => settings.get().chrome;

  /** The CSS-px chrome settings converted to content units by the page's view
   *  scale (px per page unit) — screen-constant grab zones + stalk at every
   *  zoom. No scale → the values are read as content units (headless callers).
   *  `boost` widens the grab tolerances only (never the drawn chrome or the
   *  knob's position) — the touch path passes {@link TOUCH_GRAB_BOOST} so
   *  handles present finger-sized targets. */
  const chromeGeomAt = (scale?: number, boost = 1): ChromeGeometry => {
    const cs = chromeSettings();
    const effectiveScale = scale || 1;
    return {
      handleTol: (cs.handles.hitSize / 2 / effectiveScale) * boost,
      knobTol: (cs.rotationHandle.hitSize / 2 / effectiveScale) * boost,
      knobOffset: cs.rotationHandle.offset / effectiveScale,
      rotationHandle: cs.rotationHandle.enabled,
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
    const pageObjectNumber = page.objectNumber;
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

  /**
   * The text box whose box is under `point`: where a double-click edits its
   * text. Its body or a resize handle on its border counts; a callout's line,
   * its tip and knee, and the empty rest of its frame don't.
   */
  const textBoxAt = (page: PageRef, point: Point, view: HitView = {}): Id | null => {
    const target = hitAt(page, point, view, 1, null);
    const id = target.kind === 'annot' || target.kind === 'handle' ? target.id : null;
    const record = id != null ? store.model().byId[id] : undefined;
    const onBox =
      !!record &&
      isOnTextBox(
        record,
        point,
        chromeGeomAt(view.scale).handleTol,
        viewEnv(view.zoom, view.rotation),
      );
    return onBox ? id : null;
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
    const pageObjectNumber = page.objectNumber;
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
    // `guides.enabled` and `rotationHandle.enabled` are presentation
    // settings, filtered here so the emitted chrome stays authoritative for
    // every painter (default and headless alike). A disabled rotation handle
    // can't be grabbed either (`chromeGeomAt`).
    if (!cs.guides.enabled) nodes = nodes.filter((node) => node.kind !== 'rotate-guides');
    if (!cs.rotationHandle.enabled) nodes = nodes.filter((node) => node.kind !== 'rotate-knob');
    chromeCache.set(pageObjectNumber, { model: model, cs, scale, rotation, zoom, v: nodes });
    return nodes;
  };

  // Anchor for the selection menu: memoized by input identity so the selector
  // returns a stable reference between unrelated dispatches.
  let anchorCache: {
    model: Model;
    cs: ChromeSettings;
    scale: number | undefined;
    rotation: number | undefined;
    zoom: number | undefined;
    v: AnnotationSelectionAnchor | null;
  } | null = null;
  const selectionAnchorOf = (
    scale?: number,
    rotation?: number,
    zoom?: number,
  ): AnnotationSelectionAnchor | null => {
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
    const found = coreSelectionAnchor(
      model,
      (page) => geometry.pageBoxOf(page.objectNumber),
      () => chromeGeomAt(scale).knobOffset,
      () => viewEnv(zoom, rotation),
    );
    // Without a rotation handle, a menu has nothing to stay clear of.
    const anchor: AnnotationSelectionAnchor | null = found
      ? {
          page: found.page,
          bounds: found.bounds,
          ...(found.knob && cs.rotationHandle.enabled ? { rotationHandle: found.knob } : {}),
        }
      : null;
    anchorCache = { model: model, cs, scale, rotation, zoom, v: anchor };
    return anchor;
  };

  // One annotation's anchor, by ref and view: a new object only when it moved.
  const anchors = new Map<string, { model: Model; view?: ViewEnv; v: AnnotationAnchor | null }>();
  const annotationAnchorOf = (ref: AnnotationRef, view?: ViewEnv): AnnotationAnchor | null => {
    const model = store.model();
    const key = `${ref.page.objectNumber}:${ref.kind === 'nm' ? ref.nm : ref.kind === 'objectNumber' ? ref.objectNumber : ref.index}`;
    const cached = anchors.get(key);
    if (
      cached &&
      cached.model === model &&
      cached.view?.zoom === view?.zoom &&
      cached.view?.rotation === view?.rotation
    )
      return cached.v;
    const record = recordOfRef(model, ref);
    const found = record ? annotationAnchor(model, record.id, view) : null;
    const previous = cached?.v ?? null;
    const anchor =
      found &&
      previous &&
      previous.page.objectNumber === found.page.objectNumber &&
      previous.bounds.x === found.bounds.x &&
      previous.bounds.y === found.bounds.y &&
      previous.bounds.width === found.bounds.width &&
      previous.bounds.height === found.bounds.height
        ? previous
        : found;
    anchors.set(key, { model, view, v: anchor });
    return anchor;
  };

  /**
   * The topmost annotation at a page point: the one under it, or the
   * selection's first when the point is on its handles; `null` on a page that
   * isn't in the document.
   */
  const annotationAt = (page: PageRef | number, point: Point): Annotation | null => {
    const info = ctx.getPage(page);
    if (!info) return null;
    const model = store.model();
    const target = hitAt(info.ref, point);
    if (target.kind === 'annot') return model.byId[target.id]?.annotation ?? null;
    if (target.kind === 'empty') return null;
    // A handle or the rotation handle belongs to the selection.
    const first = model.selected[0];
    return first ? (model.byId[first]?.annotation ?? null) : null;
  };

  /** The rotation in progress, cached per model: the same object until it changes. */
  let rotationCache: { model: Model; v: RotationAnchor | null } | null = null;
  const rotationOf = (): RotationAnchor | null => {
    const model = store.model();
    if (rotationCache && rotationCache.model === model) return rotationCache.v;
    const rotation = rotationAnchor(model);
    rotationCache = { model, v: rotation };
    return rotation;
  };

  const api = {
    listChromeNodes: (page: PageRef, scale?: number, rotation?: number, zoom?: number) =>
      chromeNodesOf(page, scale, rotation, zoom),
    getSelectionAnchorIn: (view: HitView) =>
      selectionAnchorOf(view.scale, view.rotation, view.zoom),
    getAnnotationAnchor: (ref: AnnotationRef, view?: ViewEnv) => annotationAnchorOf(ref, view),
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
      const pageObjectNumber = page.objectNumber;
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

  return {
    chromeSettings,
    chromeGeomAt,
    grabBoost,
    hitAt,
    textBoxAt,
    annotationAt,
    selectionAnchor: () => selectionAnchorOf(),
    rotationAnchor: () => rotationOf(),
    api,
  };
}

export type ChromeReads = ReturnType<typeof createChromeReads>;
