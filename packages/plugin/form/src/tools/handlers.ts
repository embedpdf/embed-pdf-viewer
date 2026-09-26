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

import type { Box } from '../model';
import { FORM_TOOL_BY_ID } from './definitions';
import type { FormHostCapability } from '../host-contract';

type Vec = { x: number; y: number };

/**
 * Draw-to-place: drag a box (live placement preview through the annotation
 * plane's ghost pipeline) or just click (the tool's `clickCreate` policy,
 * resolved by the same `resolveClickPlacement` the annotation core uses) —
 * the commit creates field + widget through `doc.forms.placeField`, styled
 * from the tool's live defaults. The tool stays active for repeat placement
 * and the new widget is selected.
 *
 * Gesture rules match the annotation handlers: page-anchored via the sample
 * projection (the box keeps sizing along the edge when the cursor overshoots
 * or crosses a gap), the up sample is the final point, and a click means
 * width and height under the shared threshold — a thin 100×2 drag is a drag.
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
    enabledFor: (tool) => tool.enables.has('form-place'),
    onDown: (sample) => {
      // No capture without a page, a known palette tool, or design permission:
      // declining lets editing, panning or text selection take the gesture.
      if (!sample.page || !FORM_TOOL_BY_ID.has(interaction.getActiveToolId())) return false;
      if (!form.canDesign()) return false;
      origin = { page: sample.page.ref, start: sample.page.point, last: sample.page.point };
      return true;
    },
    onMove: (sample) => {
      if (!origin) return;
      const point = samplePointOn(sample, origin.page);
      if (!point) return;
      origin.last = point;
      const box = rectFromCorners(origin.start, point);
      // Once the gesture reads as a drag, preview the box with the tool's
      // defaults through the annotation plugin's placement preview.
      if (annotation) {
        if (Math.max(box.width, box.height) >= MIN_DRAG) {
          annotation.setPlacementPreview(interaction.getActiveToolId(), origin.page, box);
        } else {
          annotation.clearPlacementPreview();
        }
      }
    },
    onUp: (sample) => {
      if (!origin) return;
      const gesture = origin;
      origin = null;
      annotation?.clearPlacementPreview();
      const toolId = interaction.getActiveToolId();
      const tool = FORM_TOOL_BY_ID.get(toolId);
      if (!tool) return;
      // The up sample is the final point (projection first, like every
      // page-anchored gesture); a release over the gap falls back to the
      // last resolved point.
      const end = samplePointOn(sample, gesture.page) ?? gesture.last;
      const dragged = rectFromCorners(gesture.start, end);
      const isClick = dragged.width < MIN_DRAG && dragged.height < MIN_DRAG;
      const pageBox = form.getPageBox(gesture.page);
      const box = isClick ? boxOfClick(gesture.start, tool.clickCreate, pageBox) : dragged; // createField clamps a drag to the page
      form
        .createField({
          family: tool.family,
          page: gesture.page,
          bounds: box,
          // Style from the tool's live defaults when the annotation plugin
          // holds them (the user may have restyled the tool); without it,
          // use the tool table's defaults, so a field is never invisible.
          appearance: widgetAppearanceFromProps(
            annotation ? annotation.getToolDefaults(toolId) : tool.defaults,
          ),
        })
        .then((placed) => {
          // Select the new widget: createField resolves after the annotation
          // plugin knows it. Skip when the tool changed while the write ran.
          if (!annotation || interaction.getActiveToolId() !== toolId) return;
          const ref = placed.widget?.ref;
          if (!ref) return;
          annotation.select(ref);
        })
        .catch((error) => {
          globalThis.console?.error('[form] createField failed:', error);
        });
    },
  };
}

/** The click-create box through the shared placement layer (fields are boxes;
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
