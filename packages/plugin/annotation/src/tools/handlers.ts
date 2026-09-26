import type { Subtype, Point } from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import type { PageRef } from '@embedpdf/engine-core/runtime';
import type {
  InteractionHostCapability,
  InteractionHandler,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';

import type { AnnotationHostCapability } from '../host-contract';
import {
  ANNOTATION_DRAW_PRIORITY,
  ANNOTATION_EDIT_PRIORITY,
  ANNOTATION_GHOST_PRIORITY,
  ANNOTATION_MARQUEE_PRIORITY,
  ANNOTATION_PLACE_PRIORITY,
} from '../priorities';

const MARQUEE_DRAG_THRESHOLD_PX = 4;
const isPolyTool = (subtype: Subtype): boolean => subtype === 'polygon' || subtype === 'polyline';
const isCalloutTool = (subtype: Subtype): boolean => subtype === 'free-text-callout';

/**
 * Resolve a sample against a gesture's home page. Annotation gestures are
 * page-anchored: they track the page they started on, even when the cursor
 * wanders off it — `s.page` re-resolves per event (a page-2 point is a
 * different coordinate frame, the teleport bug), so prefer the source's
 * unclamped projection and fall back to the page hit only when it's the same
 * page. Null → this sample can't speak for the home page; ignore it.
 */
const pointOn = (sample: PointerSample, page: PageRef): Point | null =>
  sample.project?.(page) ??
  (sample.page?.ref.pageObjectNumber === page.pageObjectNumber ? sample.page.point : null);

/**
 * Click-to-place for every payload-carrying tool (stamp / note / file
 * attachment). Each click places one annotation centred on the point (the
 * tool stays active for repeat placement, like a rubber stamp); the
 * capability's `placeAt` routes by the active tool's kind: armed stamp bytes,
 * a stamp/attachment prompt (pick the spot first, the payload second), or an
 * immediate note. No drag gesture — placement size comes from the content
 * (stamp aspect / the fixed icon box), not the pointer.
 *
 * Priority is deliberately below the edit handler (100): a click over an
 * existing annotation selects it; placement happens on empty page space.
 */
export function createPlaceHandler(anno: AnnotationHostCapability): InteractionHandler {
  return {
    id: 'annotation-place',
    // `annotation-stamp` is honoured as a legacy alias for embedder tool
    // configs written before the tags were unified.
    priority: ANNOTATION_PLACE_PRIORITY,
    enabledFor: (tool) =>
      tool.enables.has('annotation-place') || tool.enables.has('annotation-stamp'),
    onDown: (sample) => {
      if (!sample.page) return false;
      // The click sample's display rotation drives the tool's `upright` policy —
      // the placement lands reading horizontally on a rotated page/view.
      return anno.placeAt(sample.page.ref, sample.page.point, sample.page.rotation);
    },
  };
}

/**
 * The armed tool's footprint ghost: every hover re-computes the would-be
 * placement under the cursor (stamp image fit / click-create default geometry);
 * off-page clears it. One handler for every tool — `ghostHoverAt` resolves the
 * tool's ghost policy and clears when it isn't `footprint`. Never captures:
 * the highest priority makes its onDown run first on every press (hiding the
 * ghost while a gesture runs), then declines so the real handlers route.
 */
export function createGhostHandler(
  anno: AnnotationHostCapability,
  interaction: InteractionHostCapability,
): InteractionHandler {
  const hover = (sample: PointerSample): void => {
    if (sample.page)
      anno.hoverGhostAt(
        interaction.getActiveToolId(),
        sample.page.ref,
        sample.page.point,
        sample.page.rotation,
      );
    else anno.clearGhost();
  };
  return {
    id: 'annotation-ghost',
    priority: ANNOTATION_GHOST_PRIORITY,
    enabledFor: () => true,
    onDown: () => {
      anno.clearGhost();
      return false;
    },
    onHover: hover,
  };
}

/**
 * Ambient editing: live under the `annotation-edit` tag, which both the pointer
 * and pan tools enable — so you select/move/resize in any navigation mode (Adobe
 * behaviour). It captures only over an annotation/handle; over empty it
 * deselects and declines (so text-selection / pan still work). Hover drives the
 * cursor (move / pointer / resize) via a priority cursor claim.
 */
export function createEditHandler(
  anno: AnnotationHostCapability,
  interaction: InteractionHostCapability,
): InteractionHandler {
  // The gesture's home page + last resolved point, armed on down. Every
  // move/up resolves against this page (the annotation slides along its edge
  // when the cursor overshoots — the core clamps), never against whatever
  // page the sample happens to hit. `downPoint` keeps the untouched origin so
  // an aborted gesture (second finger → pinch) can revert instead of leaving
  // the annotation half-moved. `touch` rides the whole gesture so every phase
  // grabs with the same finger-sized zones the down resolved with.
  let origin: { page: PageRef; point: Point; downPoint: Point; touch: boolean } | null = null;
  return {
    id: 'annotation-edit',
    priority: ANNOTATION_EDIT_PRIORITY,
    enabledFor: (tool) => tool.enables.has('annotation-edit'),
    // Touch consent: a finger owns a tool drag only over the selection's own
    // chrome or a selected annotation's body (see claimsTouchAt) — unselected
    // bodies keep scrolling, matching the Markup convention.
    claimsTouch: (sample) =>
      !!sample.page &&
      anno.claimsTouchAt(
        sample.page.ref,
        sample.page.point,
        sample.page.scale,
        sample.page.rotation,
        sample.page.zoom,
      ),
    onDown: (sample) => {
      if (!sample.page) return false;
      // The final distance-placement click belongs to its creation draft even
      // when it lands over an existing annotation.
      if (anno.distanceCreationPage?.() != null) return false;
      const touch = sample.pointerType === 'touch';
      // While a free-text box is being edited it owns its own pointer events, so a
      // down that reaches the hub at all is a click outside the editor — commit and
      // leave text edit. This makes exit hub-driven (deterministic) rather than
      // relying on a DOM blur, which races the focus-steal of the entering gesture.
      const wasEditing = anno.getEditingId() != null;
      if (wasEditing) anno.endTextEdit();
      if (
        anno.getHitKind(
          sample.page.ref,
          sample.page.point,
          sample.page.scale,
          sample.page.rotation,
          sample.page.zoom,
          touch,
        ) === 'empty'
      ) {
        // Plain empty click drops the selection. Shift-empty preserves it so the
        // lower-priority marquee handler can additive/toggle-select.
        if (!sample.modifiers.shift) anno.clearSelection();
        // A click that dismissed an active edit is consumed: its sole job was to
        // leave edit mode, so the draw tool doesn't also spawn a new annotation.
        // Only when nothing was being edited do we decline, letting
        // pan / text-selection / draw act on the empty click.
        return wasEditing;
      }
      // Double-click / long-press over a free-text box → enter text edit (not
      // a move). Over any other annotation the attempt reports false and the
      // press falls through to the normal path below (select / arm a move) —
      // so a long-press on a highlight selects it instead of the gesture
      // being swallowed by a no-op edit attempt.
      if ((sample.clickCount ?? 1) >= 2) {
        if (
          anno.beginTextEditAt(
            sample.page.ref,
            sample.page.point,
            sample.page.scale,
            sample.page.rotation,
            sample.page.zoom,
          )
        ) {
          return true;
        }
      }
      anno.editPointer(
        'down',
        sample.page.ref,
        sample.page.point,
        sample.modifiers.shift,
        sample.page.scale,
        sample.page.rotation,
        sample.page.zoom,
        touch,
      );
      origin = {
        page: sample.page.ref,
        point: sample.page.point,
        downPoint: sample.page.point,
        touch,
      };
      return true;
    },
    onMove: (sample) => {
      if (!origin) return;
      const point = pointOn(sample, origin.page);
      if (!point) return;
      origin.point = point;
      // The sample's scale/rotation ride along (uniform across pages), so a
      // screen-anchored member page-clamps at its effective footprint mid-drag.
      anno.editPointer(
        'move',
        origin.page,
        point,
        sample.modifiers.shift,
        sample.page?.scale,
        sample.page?.rotation,
        sample.page?.zoom,
        origin.touch,
      );
    },
    onUp: (sample) => {
      if (!origin) return;
      // Always close the gesture — a release over a page gap or outside the
      // window must still commit (a dangling draft leaves a ghost that snaps
      // back on the next interaction). `editUp` doesn't read the point.
      anno.editPointer(
        'up',
        origin.page,
        pointOn(sample, origin.page) ?? origin.point,
        false,
        undefined,
        undefined,
        undefined,
        origin.touch,
      );
      origin = null;
    },
    onCancel: () => {
      if (!origin) return;
      // Aborted (second finger → pinch): Revert, don't commit — replay the
      // gesture back to its own down point (every transform is delta-from-
      // down, so this restores the original geometry), then close it there.
      const { page, downPoint, touch } = origin;
      origin = null;
      anno.editPointer('move', page, downPoint, false, undefined, undefined, undefined, touch);
      anno.editPointer('up', page, downPoint, false, undefined, undefined, undefined, touch);
    },
    onHover: (sample) => {
      // priority 20 → beats text-select's 'text' (10) over an annotation; null clears.
      interaction.claimCursor(
        'annotation',
        sample.page
          ? anno.getCursorAt(
              sample.page.ref,
              sample.page.point,
              sample.page.scale,
              sample.page.rotation,
              sample.page.zoom,
            )
          : null,
        20,
      );
      // Hover state for scene affordances (redact preview) — rides the same
      // per-move sample; the capability dispatches on change only.
      anno.hoverAt(
        sample.page
          ? {
              page: sample.page.ref,
              point: sample.page.point,
              scale: sample.page.scale,
              rotation: sample.page.rotation,
              zoom: sample.page.zoom,
            }
          : null,
      );
    },
  };
}

/**
 * Empty-page drag selection. Lower priority than annotation edit and text
 * selection, so it only owns drags that begin on empty, non-text page space.
 */
export function createMarqueeHandler(anno: AnnotationHostCapability): InteractionHandler {
  let anchor: {
    page: PageRef;
    point: Point;
    vx: number;
    vy: number;
    shift: boolean;
  } | null = null;
  let last: { page: PageRef; point: Point } | null = null;
  let dragging = false;

  // The marquee page's view env at the down sample — the `up` intersects
  // screen-anchored annotations at their effective footprint with it.
  let view: { scale?: number; rotation?: PageRotation; zoom?: number } = {};
  return {
    id: 'annotation-marquee',
    priority: ANNOTATION_MARQUEE_PRIORITY,
    enabledFor: (tool) => tool.enables.has('annotation-marquee'),
    onDown: (sample) => {
      if (!sample.page) return false;
      anchor = {
        page: sample.page.ref,
        point: sample.page.point,
        vx: sample.viewport.x,
        vy: sample.viewport.y,
        shift: sample.modifiers.shift,
      };
      last = { page: sample.page.ref, point: sample.page.point };
      view = { scale: sample.page.scale, rotation: sample.page.rotation, zoom: sample.page.zoom };
      dragging = false;
      return true;
    },
    onMove: (sample) => {
      if (!anchor) return;
      // Anchored to the page the drag started on; the projected point keeps the
      // marquee growing along the page edge when the cursor overshoots (the
      // core clamps it to the page box).
      const point = pointOn(sample, anchor.page);
      if (!point) return;
      last = { page: anchor.page, point };
      if (!dragging) {
        if (
          Math.hypot(sample.viewport.x - anchor.vx, sample.viewport.y - anchor.vy) <
          MARQUEE_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        dragging = true;
        anno.marqueePointer(
          'down',
          anchor.page,
          anchor.point,
          anchor.shift,
          view.scale,
          view.rotation,
          view.zoom,
        );
      }
      anno.marqueePointer(
        'move',
        anchor.page,
        point,
        anchor.shift,
        view.scale,
        view.rotation,
        view.zoom,
      );
    },
    onUp: () => {
      if (dragging && anchor && last) {
        anno.marqueePointer(
          'up',
          anchor.page,
          last.point,
          anchor.shift,
          view.scale,
          view.rotation,
          view.zoom,
        );
      }
      anchor = null;
      last = null;
      dragging = false;
    },
    onCancel: () => {
      // Abort without committing a selection; the core's cancel message clears
      // the marquee draft so no rectangle lingers. (Touch can't currently
      // reach the marquee — this is symmetry and future-proofing.)
      anchor = null;
      last = null;
      dragging = false;
      anno.cancelCreationDraft();
    },
  };
}

/** Drawing: live under `annotation-draw` (the square / circle / line tools). */
export function createDrawHandler(
  anno: AnnotationHostCapability,
  interaction: InteractionHostCapability,
): InteractionHandler {
  // The active tool id + its routing subtype. The id is what `createPointer` takes
  // (it resolves the defaults preset — arrow vs line); the subtype is what the
  // poly/callout gesture checks read (arrow → `line`, a polygon preset → `polygon`).
  const toolId = () => interaction.getActiveToolId();
  const subtypeOf = (id: string): Subtype => anno.getToolSubtype(id);
  let drawingPoly = false;
  // A callout is mid-creation between its tip/knee/box clicks; while it is, hover
  // (no button) must still drive the leader/box preview, like a poly's vertices.
  let drawingCallout = false;
  // Home page of a between-clicks preview (polygon, polyline, callout). The drag
  // `origin` dies on pointer-up, but the preview does not: hover keeps projecting
  // onto this page, and the core pins the point, so the rubber-band slides along
  // the edge when the cursor leaves the page.
  let followPage: PageRef | null = null;
  // The active drag's home page (down→up): moves/ups resolve against it, so a
  // shape keeps sizing along the page edge when the cursor overshoots.
  let origin: { page: PageRef; point: Point } | null = null;
  let pendingInk: {
    tool: string;
    page: PageRef;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const flushPendingInk = () => {
    if (!pendingInk) return;
    clearTimeout(pendingInk.timer);
    pendingInk = null;
    anno.finishInkDraft();
  };
  interaction.onToolChanged(() => {
    flushPendingInk();
    drawingPoly = false;
    drawingCallout = false;
    followPage = null;
    origin = null;
  });
  return {
    id: 'annotation-draw',
    // The gesture cascade — relative order is the composition policy:
    //   100 annotation-edit     existing annotations own their gestures
    //    95 annotation-place    click-to-place armed tools
    //    60 text-select         claims text only (self-gates via isOverText,
    //                           yields everywhere else)
    //    55 annotation-draw     drag-create takes whatever text didn't claim
    //    50 annotation-marquee  empty-space selection, the final fallback
    // Draw sits below text-select so a composed tool (redact: text-select +
    // annotation-draw) lets text claim text — over a paragraph the drag makes
    // per-line quad marks, anywhere else it drag-creates. Priority only breaks
    // ties between simultaneously-eligible handlers, and draw-only tools
    // (square/ink/arrow…) never co-enable text-select, so they are unaffected.
    priority: ANNOTATION_DRAW_PRIORITY,
    enabledFor: (tool) => tool.enables.has('annotation-draw'),
    onDown: (sample) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      const distancePage = anno.distanceCreationPage?.();
      if (distancePage != null) {
        const point = pointOn(sample, distancePage);
        if (point) {
          anno.createPointer(tool, 'down', distancePage, point);
        }
        // This click commits on down. Its up must not start another draft.
        origin = null;
        return true;
      }
      if (!sample.page) return false;
      if (st === 'ink' && pendingInk) {
        if (
          pendingInk.tool === tool &&
          pendingInk.page.pageObjectNumber === sample.page.ref.pageObjectNumber
        ) {
          clearTimeout(pendingInk.timer);
          pendingInk = null;
        } else {
          flushPendingInk();
        }
      }
      // A down is a fresh intent — it may legitimately start on another page
      // (the core restarts the draft there), so it re-anchors the gesture.
      origin = { page: sample.page.ref, point: sample.page.point };
      if (isPolyTool(st)) {
        const finish = (sample.clickCount ?? 1) >= 2;
        anno.createPointer(tool, 'down', sample.page.ref, sample.page.point, finish);
        // A double-click commits the poly; the rubber-band ends with it.
        drawingPoly = !finish;
        followPage = finish ? null : sample.page.ref;
        return true;
      }
      drawingPoly = false;
      // Each callout click advances the core's tip → knee → box state machine; the
      // final box click/drag commits and clears the draft (so `drawingCallout`
      // resets on the next tool change or simply idles harmlessly).
      if (isCalloutTool(st)) {
        drawingCallout = true;
        followPage = sample.page.ref;
      } else {
        followPage = null;
      }
      // The down sample's display rotation rides along for the tool's `upright`
      // policy; the core captures it on the draft (later phases don't carry it).
      anno.createPointer(
        tool,
        'down',
        sample.page.ref,
        sample.page.point,
        false,
        sample.page.rotation,
      );
      return true;
    },
    onMove: (sample) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      // Drag-moves (button down): rect/line/ink/free-text size their box, and a
      // callout (a non-poly tool) sizes its text box during the box step. Poly
      // tools take vertices by click, so they ignore drag-moves.
      if (!origin || (isPolyTool(st) && !drawingPoly)) return;
      const point = pointOn(sample, origin.page);
      if (!point) return;
      origin.point = point;
      anno.createPointer(tool, 'move', origin.page, point);
    },
    onUp: (sample) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      if (origin && !isPolyTool(st)) {
        // Always commit the drag, even released off-page (point pins in core).
        anno.createPointer(tool, 'up', origin.page, pointOn(sample, origin.page) ?? origin.point);
        if (st === 'ink') {
          const groupStrokesMs = anno.getResolvedTool(tool)?.ink?.groupStrokesMs ?? 0;
          if (groupStrokesMs > 0) {
            const page = origin.page;
            const timer = setTimeout(() => {
              pendingInk = null;
              anno.finishInkDraft();
            }, groupStrokesMs);
            pendingInk = { tool, page, timer };
          }
        }
      }
      origin = null;
    },
    onCancel: () => {
      // Aborted (second finger → pinch, or a system cancel): the draft dies,
      // nothing commits — without this, the up-fallback would commit a shape
      // whose final point teleports to the second finger. For an ink group
      // this drops the whole in-window draft (there is no partial discard);
      // a cancel is a cancel, and the grouping window is sub-second.
      if (pendingInk) {
        clearTimeout(pendingInk.timer);
        pendingInk = null;
      }
      drawingPoly = false;
      drawingCallout = false;
      followPage = null;
      origin = null;
      anno.cancelCreationDraft();
    },
    onHover: (sample) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      const distancePage = anno.distanceCreationPage?.();
      if (distancePage != null) {
        const point = pointOn(sample, distancePage);
        if (point) {
          anno.createPointer(tool, 'move', distancePage, point);
        }
        return;
      }
      // Between clicks the button is up, so there is no drag origin. The preview
      // stays on the page the series started on: project onto it even when the
      // cursor has left that page. The core pins the point, so the rubber-band
      // slides along the edge and picks the cursor back up inside the page.
      if (
        followPage &&
        ((drawingPoly && isPolyTool(st)) || (drawingCallout && isCalloutTool(st)))
      ) {
        const point = pointOn(sample, followPage);
        if (point) anno.createPointer(tool, 'move', followPage, point);
      }
    },
  };
}
