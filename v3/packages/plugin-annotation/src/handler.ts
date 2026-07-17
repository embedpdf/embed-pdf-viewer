import type {
  InteractionCapability,
  InteractionHandler,
  PointerSample,
} from '@embedpdf-x/plugin-interaction';
import type { PageRotation } from '@embedpdf-x/geometry';
import type { Subtype, Vec } from '@embedpdf-x/annotation-core';
import type { AnnotationHostCapability } from './types';

const MARQUEE_DRAG_THRESHOLD_PX = 4;
const isPolyTool = (subtype: Subtype): boolean => subtype === 'polygon' || subtype === 'polyline';
const isCalloutTool = (subtype: Subtype): boolean => subtype === 'free-text-callout';

/**
 * Resolve a sample against a gesture's HOME page. Annotation gestures are
 * page-anchored: they track the page they started on, even when the cursor
 * wanders off it — `s.page` re-resolves per event (a page-2 point is a
 * DIFFERENT coordinate frame, the teleport bug), so prefer the source's
 * unclamped projection and fall back to the page hit only when it's the same
 * page. Null → this sample can't speak for the home page; ignore it.
 */
const pointOn = (s: PointerSample, pon: number): Vec | null =>
  s.project?.(pon) ?? (s.page?.pon === pon ? s.page.point : null);

/**
 * Click-to-place for every payload-carrying tool (stamp / note / file
 * attachment). Each click places one annotation centred on the point (the
 * tool stays active for repeat placement — v2 rubber-stamp behaviour); the
 * capability's `placeAt` routes by the active tool's kind: armed stamp bytes,
 * a stamp/attachment prompt (pick the spot first, the payload second), or an
 * immediate note. No drag gesture — placement size comes from the content
 * (stamp aspect / the fixed icon box), not the pointer.
 *
 * Priority is deliberately BELOW the edit handler (100): a click over an
 * EXISTING annotation selects it; placement happens on empty page space.
 */
export function createPlaceHandler(anno: AnnotationHostCapability): InteractionHandler {
  return {
    id: 'annotation-place',
    // `annotation-stamp` is honoured as a legacy alias for embedder tool
    // configs written before the tags were unified.
    priority: 95,
    enabledFor: (t) => t.enables.has('annotation-place') || t.enables.has('annotation-stamp'),
    onDown: (s) => {
      if (!s.page) return false;
      // The click sample's display rotation drives the tool's `upright` policy —
      // the placement lands reading horizontally on a rotated page/view.
      return anno.placeAt(s.page.pon, s.page.point, s.page.rotation);
    },
  };
}

/**
 * The armed tool's FOOTPRINT ghost: every hover re-computes the would-be
 * placement under the cursor (stamp image fit / click-create default geometry);
 * off-page clears it. One handler for every tool — `ghostHoverAt` resolves the
 * tool's ghost policy and clears when it isn't `footprint`. Never captures:
 * the highest priority makes its onDown run FIRST on every press (hiding the
 * ghost while a gesture runs), then declines so the real handlers route.
 */
export function createGhostHandler(
  anno: AnnotationHostCapability,
  interaction: InteractionCapability,
): InteractionHandler {
  const hover = (s: PointerSample): void => {
    if (s.page)
      anno.ghostHoverAt(interaction.activeToolId(), s.page.pon, s.page.point, s.page.rotation);
    else anno.clearGhost();
  };
  return {
    id: 'annotation-ghost',
    priority: 1000,
    enabledFor: () => true,
    onDown: () => {
      anno.clearGhost();
      return false;
    },
    onHover: hover,
  };
}

/**
 * Ambient editing: live under the `annotation-edit` tag, which BOTH the pointer
 * and pan tools enable — so you select/move/resize in any navigation mode (Adobe
 * behaviour). It captures only over an annotation/handle; over empty it
 * deselects and declines (so text-selection / pan still work). Hover drives the
 * cursor (move / pointer / resize) via a priority cursor claim.
 */
export function createEditHandler(
  anno: AnnotationHostCapability,
  interaction: InteractionCapability,
): InteractionHandler {
  // The gesture's home page + last resolved point, armed on down. Every
  // move/up resolves against THIS page (the annotation slides along its edge
  // when the cursor overshoots — the core clamps), never against whatever
  // page the sample happens to hit.
  let origin: { pon: number; point: Vec } | null = null;
  return {
    id: 'annotation-edit',
    priority: 100,
    enabledFor: (t) => t.enables.has('annotation-edit'),
    onDown: (s) => {
      if (!s.page) return false;
      // While a free-text box is being edited it owns its own pointer events, so a
      // down that reaches the hub at all is a click OUTSIDE the editor — commit and
      // leave text edit. This makes exit hub-driven (deterministic) rather than
      // relying on a DOM blur, which races the focus-steal of the entering gesture.
      const wasEditing = anno.currentEditing() != null;
      if (wasEditing) anno.endTextEdit();
      if (
        anno.hitKind(s.page.pon, s.page.point, s.page.scale, s.page.rotation, s.page.zoom) ===
        'empty'
      ) {
        // Plain empty click drops the selection. Shift-empty preserves it so the
        // lower-priority marquee handler can additive/toggle-select.
        if (!s.modifiers.shift) anno.deselect();
        // A click that dismissed an active edit is CONSUMED: its sole job was to
        // leave edit mode, so the draw tool doesn't also spawn a new annotation
        // (matches v2). Only when nothing was being edited do we decline, letting
        // pan / text-selection / draw act on the empty click.
        return wasEditing;
      }
      // Double-click over a free-text box → enter text edit (not a move).
      if ((s.clickCount ?? 1) >= 2) {
        anno.beginTextEditAt(s.page.pon, s.page.point, s.page.scale, s.page.rotation, s.page.zoom);
        return true;
      }
      anno.editPointer(
        'down',
        s.page.pon,
        s.page.point,
        s.modifiers.shift,
        s.page.scale,
        s.page.rotation,
        s.page.zoom,
      );
      origin = { pon: s.page.pon, point: s.page.point };
      return true;
    },
    onMove: (s) => {
      if (!origin) return;
      const point = pointOn(s, origin.pon);
      if (!point) return;
      origin.point = point;
      // The sample's scale/rotation ride along (uniform across pages), so a
      // screen-anchored member page-clamps at its effective footprint mid-drag.
      anno.editPointer(
        'move',
        origin.pon,
        point,
        s.modifiers.shift,
        s.page?.scale,
        s.page?.rotation,
        s.page?.zoom,
      );
    },
    onUp: (s) => {
      if (!origin) return;
      // ALWAYS close the gesture — a release over a page gap or outside the
      // window must still commit (a dangling draft leaves a ghost that snaps
      // back on the next interaction). `editUp` doesn't read the point.
      anno.editPointer('up', origin.pon, pointOn(s, origin.pon) ?? origin.point, false);
      origin = null;
    },
    onHover: (s) => {
      // priority 20 → beats text-select's 'text' (10) over an annotation; null clears.
      interaction.setCursor(
        'annotation',
        s.page
          ? anno.cursorAt(s.page.pon, s.page.point, s.page.scale, s.page.rotation, s.page.zoom)
          : null,
        20,
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
    pon: number;
    point: Vec;
    vx: number;
    vy: number;
    shift: boolean;
  } | null = null;
  let last: { pon: number; point: Vec } | null = null;
  let dragging = false;

  // The marquee page's view env at the down sample — the `up` intersects
  // screen-anchored annotations at their effective footprint with it.
  let view: { scale?: number; rotation?: PageRotation; zoom?: number } = {};
  return {
    id: 'annotation-marquee',
    priority: 50,
    enabledFor: (t) => t.enables.has('annotation-marquee'),
    onDown: (s) => {
      if (!s.page) return false;
      anchor = {
        pon: s.page.pon,
        point: s.page.point,
        vx: s.viewport.x,
        vy: s.viewport.y,
        shift: s.modifiers.shift,
      };
      last = { pon: s.page.pon, point: s.page.point };
      view = { scale: s.page.scale, rotation: s.page.rotation, zoom: s.page.zoom };
      dragging = false;
      return true;
    },
    onMove: (s) => {
      if (!anchor) return;
      // Anchored to the page the drag started on; the projected point keeps the
      // marquee growing along the page edge when the cursor overshoots (the
      // core clamps it to the page box).
      const point = pointOn(s, anchor.pon);
      if (!point) return;
      last = { pon: anchor.pon, point };
      if (!dragging) {
        if (
          Math.hypot(s.viewport.x - anchor.vx, s.viewport.y - anchor.vy) < MARQUEE_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        dragging = true;
        anno.marqueePointer(
          'down',
          anchor.pon,
          anchor.point,
          anchor.shift,
          view.scale,
          view.rotation,
          view.zoom,
        );
      }
      anno.marqueePointer(
        'move',
        anchor.pon,
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
          anchor.pon,
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
  };
}

/** Drawing: live under `annotation-draw` (the square / circle / line tools). */
export function createDrawHandler(
  anno: AnnotationHostCapability,
  interaction: InteractionCapability,
): InteractionHandler {
  // The active tool id + its ROUTING subtype. The id is what `createPointer` takes
  // (it resolves the defaults preset — arrow vs line); the subtype is what the
  // poly/callout gesture checks read (arrow → `line`, a polygon preset → `polygon`).
  const toolId = () => interaction.activeToolId();
  const subtypeOf = (id: string): Subtype => anno.toolSubtype(id);
  let drawingPoly = false;
  // A callout is mid-creation between its tip/knee/box clicks; while it is, hover
  // (no button) must still drive the leader/box preview, like a poly's vertices.
  let drawingCallout = false;
  // The active drag's home page (down→up): moves/ups resolve against it, so a
  // shape keeps sizing along the page edge when the cursor overshoots.
  let origin: { pon: number; point: Vec } | null = null;
  let pendingInk: {
    tool: string;
    pon: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const flushPendingInk = () => {
    if (!pendingInk) return;
    clearTimeout(pendingInk.timer);
    pendingInk = null;
    anno.finishInkDraft();
  };
  interaction.onToolChange(() => {
    flushPendingInk();
    drawingPoly = false;
    drawingCallout = false;
    origin = null;
  });
  return {
    id: 'annotation-draw',
    priority: 90,
    enabledFor: (t) => t.enables.has('annotation-draw'),
    onDown: (s) => {
      if (!s.page) return false;
      const tool = toolId();
      const st = subtypeOf(tool);
      if (st === 'ink' && pendingInk) {
        if (pendingInk.tool === tool && pendingInk.pon === s.page.pon) {
          clearTimeout(pendingInk.timer);
          pendingInk = null;
        } else {
          flushPendingInk();
        }
      }
      // A down is a fresh intent — it may legitimately start on another page
      // (the core restarts the draft there), so it re-anchors the gesture.
      origin = { pon: s.page.pon, point: s.page.point };
      if (isPolyTool(st)) {
        const finish = (s.clickCount ?? 1) >= 2;
        anno.createPointer(tool, 'down', s.page.pon, s.page.point, finish);
        drawingPoly = !finish;
        return true;
      }
      drawingPoly = false;
      // Each callout click advances the core's tip → knee → box state machine; the
      // final box click/drag commits and clears the draft (so `drawingCallout`
      // resets on the next tool change or simply idles harmlessly).
      if (isCalloutTool(st)) drawingCallout = true;
      // The DOWN sample's display rotation rides along for the tool's `upright`
      // policy; the core captures it on the draft (later phases don't carry it).
      anno.createPointer(tool, 'down', s.page.pon, s.page.point, false, s.page.rotation);
      return true;
    },
    onMove: (s) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      // Drag-moves (button down): rect/line/ink/free-text size their box, and a
      // callout (a non-poly tool) sizes its text box during the box step. Poly
      // tools take vertices by click, so they ignore drag-moves.
      if (!origin || (isPolyTool(st) && !drawingPoly)) return;
      const point = pointOn(s, origin.pon);
      if (!point) return;
      origin.point = point;
      anno.createPointer(tool, 'move', origin.pon, point);
    },
    onUp: (s) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      if (origin && !isPolyTool(st)) {
        // ALWAYS commit the drag, even released off-page (point pins in core).
        anno.createPointer(tool, 'up', origin.pon, pointOn(s, origin.pon) ?? origin.point);
        if (st === 'ink') {
          const groupStrokesMs = anno.tool(tool)?.ink?.groupStrokesMs ?? 0;
          if (groupStrokesMs > 0) {
            const pon = origin.pon;
            const timer = setTimeout(() => {
              pendingInk = null;
              anno.finishInkDraft();
            }, groupStrokesMs);
            pendingInk = { tool, pon, timer };
          }
        }
      }
      origin = null;
    },
    onHover: (s) => {
      const tool = toolId();
      const st = subtypeOf(tool);
      // Hover preview for the multi-click tools: poly (while placing vertices) and
      // callout (while placing the tip/knee/box) follow the cursor between clicks.
      if (s.page && ((drawingPoly && isPolyTool(st)) || (drawingCallout && isCalloutTool(st)))) {
        anno.createPointer(tool, 'move', s.page.pon, s.page.point);
      }
    },
  };
}
