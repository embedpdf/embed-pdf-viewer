import { rectFromCorners } from '@embedpdf/core-geometry';
import {
  MIN_DRAG,
  resolveClickPlacement,
  widgetAppearanceFromProps,
} from '@embedpdf/plugin-annotation/authoring';
import type { PageRef } from '@embedpdf/engine-core/runtime';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  samplePointOn,
  type InteractionCapability,
  type InteractionHandler,
} from '@embedpdf/plugin-interaction/contract';

import type { Box } from '../core/model';
import { FORM_TOOL_BY_ID } from './definitions';
import type { FormHostCapability } from '../host-contract';

type Vec = { x: number; y: number };

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
  form: FormHostCapability,
  interaction: InteractionCapability,
  annotation: AnnotationHostCapability | null,
): InteractionHandler {
  let origin: { page: PageRef; start: Vec; last: Vec } | null = null;
  return {
    id: 'form-place',
    // Above the annotation edit handler (100): while a palette tool is
    // active, a drag on empty page means "place a field", not "marquee".
    priority: 95,
    enabledFor: (t) => t.enables.has('form-place'),
    onDown: (s) => {
      // No capture without a page, a known palette tool, or write permission —
      // declining lets edit/pan/text-selection act on the gesture instead.
      if (!s.page || !FORM_TOOL_BY_ID.has(interaction.getActiveToolId())) return false;
      if (!form.canDesign()) return false;
      origin = { page: s.page.ref, start: s.page.point, last: s.page.point };
      return true;
    },
    onMove: (s) => {
      if (!origin) return;
      const point = samplePointOn(s, origin.page);
      if (!point) return;
      origin.last = point;
      const box = rectFromCorners(origin.start, point);
      // Live preview once the gesture reads as a drag — the WYSIWYG white box
      // (tool defaults) through the annotation ghost pipeline. Never dispatch
      // into the annotation store directly; this is its typed seam.
      if (annotation) {
        if (Math.max(box.width, box.height) >= MIN_DRAG) {
          annotation.setPlacementPreview(interaction.getActiveToolId(), origin.page, box);
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
      const toolId = interaction.getActiveToolId();
      const tool = FORM_TOOL_BY_ID.get(toolId);
      if (!tool) return;
      // The UP sample is the final point (projection first, like every
      // page-anchored gesture); a release over the gap falls back to the
      // last resolved point.
      const end = samplePointOn(s, o.page) ?? o.last;
      const dragged = rectFromCorners(o.start, end);
      const isClick = dragged.width < MIN_DRAG && dragged.height < MIN_DRAG;
      const pageBox = form.getPageBox(o.page);
      const box = isClick ? boxOfClick(o.start, tool.clickCreate, pageBox) : dragged; // createField clamps a drag to the page
      form
        .createField({
          family: tool.family,
          page: o.page,
          bounds: box,
          // Style from the tool's LIVE defaults when the annotation plane is
          // here to hold them (the user restyled the tool in the panel);
          // annotation-less placement uses the table's static seed — a field
          // is never invisible. One conversion, the exported boundary util.
          appearance: widgetAppearanceFromProps(
            annotation ? annotation.getToolDefaults(toolId) : tool.defaults,
          ),
        })
        .then((placed) => {
          // Auto-select the fresh widget — createField resolves AFTER the
          // annotation page reload, so the ref is selectable. Skip when the
          // world moved on (tool changed) while the engine write ran.
          if (!annotation || interaction.getActiveToolId() !== toolId) return;
          const ref = placed.widget?.ref;
          if (!ref) return;
          annotation.select(ref);
        })
        .catch((err) => {
          globalThis.console?.error('[form] createField failed:', err);
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
