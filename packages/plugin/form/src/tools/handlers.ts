import type { PageRef } from '@embedpdf/engine-core/runtime';
import { gesturePlacement, widgetAppearanceOf } from '@embedpdf/plugin-annotation/authoring';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import { samplePointOn, type InteractionHandler } from '@embedpdf/plugin-interaction/contract';
import type { InteractionHostCapability } from '@embedpdf/plugin-interaction/contract/host';

import { FORM_TOOL_BY_ID } from './definitions';
import type { FormHostCapability } from '../host-contract';

type Vec = { x: number; y: number };

/**
 * Draw-to-place: drag a box or just click — the commit creates field +
 * widget through `doc.forms.placeField`, styled from the tool's live
 * defaults. Where the field goes is `gesturePlacement`, the call the
 * annotation core makes for its own drawings: the dragged box once the
 * gesture is a drag (the shared click ↔ drag threshold), else the tool's
 * `clickCreate` box. The tool stays active for repeat placement and the new
 * widget is selected.
 *
 * With the annotation plugin, the tool's ghost shows the field a click
 * places: this handler's hover puts it where the click would reach it (no
 * widget or annotation under the pointer claims it) and the user may design
 * forms. The gesture reports itself (`previewPlacement`), so once it drags
 * the page paints the field the release places, a radio button round.
 *
 * Gesture rules match the annotation handlers: page-anchored via the sample
 * projection (the box keeps sizing along the edge when the cursor overshoots
 * or crosses a gap), and the up sample is the final point.
 */
export function createPlaceHandler(
  form: FormHostCapability,
  interaction: InteractionHostCapability,
  annotation: AnnotationHostCapability | null,
): InteractionHandler {
  let origin: { page: PageRef; start: Vec; last: Vec } | null = null;
  /** Drop the gesture and what it painted: its placement and the tool's ghost. */
  const endGesture = (): void => {
    origin = null;
    annotation?.clearPlacementPreview();
    annotation?.clearGhost();
  };
  return {
    id: 'form-place',
    // Above the annotation edit handler (100): while a palette tool is
    // active, a drag on empty page means "place a field", not "marquee".
    priority: 95,
    enabledFor: (tool) => tool.enables.has('form-place'),
    onHover: (sample) => {
      if (!annotation) return;
      const toolId = interaction.getActiveToolId();
      if (
        sample.page &&
        FORM_TOOL_BY_ID.has(toolId) &&
        form.canDesign() &&
        !interaction.hasCursorClaim()
      ) {
        annotation.hoverGhostAt(
          toolId,
          sample.page.ref,
          sample.page.point,
          sample.page.rotation,
          sample.page.zoom,
        );
      } else {
        annotation.clearGhost();
      }
    },
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
      annotation?.previewPlacement(interaction.getActiveToolId(), origin.page, origin.start, point);
    },
    onUp: (sample) => {
      if (!origin) return;
      const gesture = origin;
      endGesture();
      const toolId = interaction.getActiveToolId();
      const tool = FORM_TOOL_BY_ID.get(toolId);
      if (!tool) return;
      // The up sample is the final point (projection first, like every
      // page-anchored gesture); a release over the gap falls back to the
      // last resolved point.
      const end = samplePointOn(sample, gesture.page) ?? gesture.last;
      const placement = gesturePlacement('box', gesture.start, end, tool.clickCreate, {
        pageBox: form.getPageBox(gesture.page) ?? undefined,
      });
      if (placement?.kind !== 'box') return;
      form
        .createField({
          family: tool.family,
          page: gesture.page,
          bounds: placement.rect,
          // Style from the tool's live defaults when the annotation plugin
          // holds them (the user may have restyled the tool); without it,
          // use the tool table's defaults, so a field is never invisible.
          appearance: widgetAppearanceOf(
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
    // Aborted (a second finger, a system cancel): nothing is placed.
    onCancel: endGesture,
  };
}
