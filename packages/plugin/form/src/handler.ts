import {
  MIN_DRAG,
  resolveClickPlacement,
  widgetAppearanceFromProps,
} from '@embedpdf/plugin-annotation/authoring';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  samplePointOn,
  type InteractionCapability,
  type InteractionHandler,
} from '@embedpdf/plugin-interaction/contract';

import type { Box } from './core/model';
import { FORM_TOOL_BY_ID } from './tools';
import type { FormCapability } from './types';

type Vec = { x: number; y: number };

const rectFrom = (a: Vec, b: Vec): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

/**
 * Draw-to-place: drag a box (live placement preview through the annotation
 * plane's ghost pipeline) or just click (the tool's `clickCreate` policy,
 * resolved by the SAME `resolveClickPlacement` the annotation core uses) —
 * the commit creates field + widget through `doc.forms.placeField`, styled
 * from the tool's live defaults. The tool stays active for repeat placement
 * (v2 rubber-stamp feel) and the fresh widget is auto-selected.
 *
 * Gesture rules match the annotation handlers: page-anchored via the sample
 * projection (the box keeps sizing along the edge when the cursor overshoots
 * or crosses a gap), the UP sample is the final point, and a CLICK means
 * width AND height under the shared threshold — a thin 100×2 drag is a drag.
 */
export function createPlaceHandler(
  form: FormCapability,
  interaction: InteractionCapability,
  annotation: AnnotationHostCapability | null,
): InteractionHandler {
  let origin: { pon: number; start: Vec; last: Vec } | null = null;
  return {
    id: 'form-place',
    // Above the annotation edit handler (100): while a palette tool is
    // active, a drag on empty page means "place a field", not "marquee".
    priority: 95,
    enabledFor: (t) => t.enables.has('form-place'),
    onDown: (s) => {
      // No capture without a page, a known palette tool, or write permission —
      // declining lets edit/pan/text-selection act on the gesture instead.
      if (!s.page || !FORM_TOOL_BY_ID.has(interaction.activeToolId())) return false;
      if (!form.canDesign()) return false;
      origin = { pon: s.page.pon, start: s.page.point, last: s.page.point };
      return true;
    },
    onMove: (s) => {
      if (!origin) return;
      const point = samplePointOn(s, origin.pon);
      if (!point) return;
      origin.last = point;
      const box = rectFrom(origin.start, point);
      // Live preview once the gesture reads as a drag — the WYSIWYG white box
      // (tool defaults) through the annotation ghost pipeline. Never dispatch
      // into the annotation store directly; this is its typed seam.
      if (annotation) {
        if (Math.max(box.width, box.height) >= MIN_DRAG) {
          annotation.setPlacementPreview(interaction.activeToolId(), origin.pon, box);
        } else {
          annotation.clearPlacementPreview();
        }
      }
    },
    onUp: (s) => {
      if (!origin) return;
      const o = origin;
      origin = null;
      annotation?.clearPlacementPreview();
      const toolId = interaction.activeToolId();
      const tool = FORM_TOOL_BY_ID.get(toolId);
      if (!tool) return;
      // The UP sample is the final point (projection first, like every
      // page-anchored gesture); a release over the gap falls back to the
      // last resolved point.
      const end = samplePointOn(s, o.pon) ?? o.last;
      const dragged = rectFrom(o.start, end);
      const isClick = dragged.width < MIN_DRAG && dragged.height < MIN_DRAG;
      const pageBox = form.pageBox(o.pon);
      const box = isClick ? boxOfClick(o.start, tool.clickCreate, pageBox) : dragged; // placeField clamps a drag to the page
      form
        .placeField({
          family: tool.family,
          pageObjectNumber: o.pon,
          box,
          // Style from the tool's LIVE defaults when the annotation plane is
          // here to hold them (the user restyled the tool in the panel);
          // annotation-less placement uses the table's static seed — a field
          // is never invisible. One conversion, the exported boundary util.
          appearance: widgetAppearanceFromProps(
            annotation ? annotation.currentDefaults(toolId) : tool.defaults,
          ),
        })
        .then((placed) => {
          // Auto-select the fresh widget — placeField resolves AFTER the
          // annotation page reload, so the ref is selectable. Skip when the
          // world moved on (tool changed) while the engine write ran.
          if (!annotation || interaction.activeToolId() !== toolId) return;
          const widget = placed.widget;
          if (!widget || widget.annotObjectNumber <= 0) return;
          annotation.select({
            kind: 'objectNumber',
            annotObjectNumber: widget.annotObjectNumber,
            pageObjectNumber: o.pon,
          });
        })
        .catch((err) => {
          globalThis.console?.error('[form] placeField failed:', err);
        });
    },
  };
}

/** The click-create box through the SHARED placement layer (fields are boxes;
 *  the policy anchor + page clamp are exactly the annotation click's). */
function boxOfClick(
  point: Vec,
  policy: { width: number; height: number; anchor?: 'center' | 'top-left' },
  pageBox: Box | null,
): Box {
  const placement = resolveClickPlacement(point, policy, { pageBox: pageBox ?? undefined });
  return placement.kind === 'box'
    ? placement.rect
    : { x: point.x, y: point.y, width: policy.width, height: policy.height };
}
