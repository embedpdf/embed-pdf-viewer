import { gesturePlacement, widgetAppearanceOf } from '@embedpdf/core-annotation';
import type { FormFieldDraft, PageRef, WidgetPlacement } from '@embedpdf/engine-core/runtime';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  samplePointOn,
  type InteractionHandler,
  type InteractionHostCapability,
} from '@embedpdf/plugin-interaction/contract/host';

import type { FormHostCapability } from '../host-contract';
import type { Box } from '../model';
import { FORM_TOOL_BY_ID, type FormToolDef } from './definitions';

type Vec = { x: number; y: number };

/** A name for a field placed with a tool: `text_1`, `text_2`, …, the first one the form doesn't have. */
export function nextFieldName(family: string, taken: ReadonlySet<string>): string {
  let count = 1;
  while (taken.has(`${family}_${count}`)) count++;
  return `${family}_${count}`;
}

/** The part of a box on the page; `null` when too little of it is. */
export function clampToPage(box: Box, page: Box): Box | null {
  const x = Math.max(page.x, Math.min(box.x, page.width));
  const y = Math.max(page.y, Math.min(box.y, page.height));
  const clamped = {
    x,
    y,
    width: Math.max(0, Math.min(box.x + box.width, page.width) - x),
    height: Math.max(0, Math.min(box.y + box.height, page.height) - y),
  };
  return clamped.width < 1 || clamped.height < 1 ? null : clamped;
}

/**
 * The field a palette tool places: one widget at `widget`, named like
 * `text_1`. A radio button stands for `'Choice1'` and a dropdown or a list
 * starts with two options, as in Acrobat; rename and change them in a
 * settings panel.
 */
export function toolDraft(
  tool: FormToolDef,
  name: string,
  widget: WidgetPlacement,
): FormFieldDraft {
  switch (tool.family) {
    case 'radio':
      return { family: 'radio', name, widgets: [{ ...widget, exportValue: 'Choice1' }] };
    case 'combobox':
    case 'listbox':
      return {
        family: tool.family,
        name,
        widgets: [widget],
        options: [
          { label: 'Option 1', value: 'Option 1' },
          { label: 'Option 2', value: 'Option 2' },
        ],
      };
    default:
      return { family: tool.family, name, widgets: [widget] };
  }
}

/**
 * Draw-to-place: drag a box or just click. The commit creates the field and
 * its widget through `form.create()`, styled from the tool's live defaults.
 * Where the field goes is `gesturePlacement`, the call the annotation core
 * makes for its own drawings: the dragged box once the gesture is a drag
 * (the shared click ↔ drag threshold), else the tool's `clickCreate` box.
 * What follows is the annotation plugin's `afterCreate` setting, as for
 * every tool: select the new widget, and keep the tool or go back to the
 * default one.
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

  const place = async (tool: FormToolDef, page: PageRef, box: Box): Promise<void> => {
    const pageBox = form.getPageBox(page);
    const rect = pageBox ? clampToPage(box, pageBox) : null;
    if (!rect) return;
    // Style from the tool's live defaults when the annotation plugin holds
    // them (the user may have restyled the tool); without it, use the tool
    // table's defaults, so a field is never invisible.
    const look = widgetAppearanceOf(
      annotation ? annotation.tools.getDefaults(tool.id) : tool.defaults,
    );
    const name = nextFieldName(tool.family, new Set(form.list().map((field) => field.name)));
    const { field } = await form.create(toolDraft(tool, name, { page, rect, ...look }));
    // `create()` resolves after the annotation plugin knows the new widget.
    // Skip the follow-up when the tool changed while the write ran.
    if (!annotation || interaction.getActiveToolId() !== tool.id) return;
    const policy = annotation.getSettings().afterCreate;
    const widget = field.widgets.find(
      (candidate) => candidate.page?.objectNumber === page.objectNumber,
    );
    if (policy.select && widget?.ref) annotation.selection.set([widget.ref]);
    if (policy.tool === 'default') interaction.activateDefaultTool();
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
      const tool = FORM_TOOL_BY_ID.get(interaction.getActiveToolId());
      if (!tool) return;
      // The up sample is the final point (projection first, like every
      // page-anchored gesture); a release over the gap falls back to the
      // last resolved point.
      const end = samplePointOn(sample, gesture.page) ?? gesture.last;
      const placement = gesturePlacement('box', gesture.start, end, tool.clickCreate, {
        pageBox: form.getPageBox(gesture.page) ?? undefined,
      });
      if (placement?.kind !== 'box') return;
      place(tool, gesture.page, placement.rect).catch((error) => {
        globalThis.console?.error('[form] placing the field failed:', error);
      });
    },
    // Aborted (a second finger, a system cancel): nothing is placed.
    onCancel: endGesture,
  };
}
