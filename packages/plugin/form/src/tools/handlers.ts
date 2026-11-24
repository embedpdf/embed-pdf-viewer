import {
  gesturePlacement,
  placedBoxFields,
  standingRect,
  widgetAppearanceOf,
  type Placement,
} from '@embedpdf/core-annotation';
import type { Rotation } from '@embedpdf/core-geometry';
import type { FormFieldDraft, PageRef, WidgetPlacement } from '@embedpdf/engine-core/runtime';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  samplePointOn,
  type InteractionHandler,
  type InteractionHostCapability,
} from '@embedpdf/plugin-interaction/contract/host';

import type { FormHostCapability } from '../host-contract';
import type { Box } from '../model';
import { FORM_TOOL_BY_ID, type FormToolDefinition } from './definitions';

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
 * A placed field's frame and turn, as its widget's placement states them
 * (`placedBoxFields`), kept on the page: the rect the turned frame stands in
 * is cut to the page (`clampToPage`), and the frame follows it. `null` when
 * too little of it is on the page.
 */
export function placedOnPage(
  placement: Extract<Placement, { kind: 'box' }>,
  page: Box,
): Pick<WidgetPlacement, 'box' | 'rotation'> | null {
  const { box, rotation } = placedBoxFields(placement);
  const turn = (rotation ?? 0) as Rotation;
  const stands = clampToPage(standingRect(box, turn), page);
  if (!stands) return null;
  // The frame that stands there: the same step back, its sides swapped at a quarter turn.
  return { box: standingRect(stands, turn), ...(turn ? { rotation: turn } : {}) };
}

/**
 * The field a palette tool places: one widget at `widget`, named like
 * `text_1`, in `groupId` when the palette places for a group (the form's
 * design group); without one it is in no group. A
 * radio button stands for `'Choice1'` and a dropdown or a list starts with
 * two options, as in Acrobat; rename and change them in a settings panel.
 */
export function toolDraft(
  tool: FormToolDefinition,
  name: string,
  widget: WidgetPlacement,
  groupId: string | null = null,
): FormFieldDraft {
  const draft = kindDraft(tool, name, widget);
  return groupId === null ? draft : { ...draft, groupId };
}

/** {@link toolDraft}'s field, as the tool's kind starts one. */
function kindDraft(
  tool: FormToolDefinition,
  name: string,
  widget: WidgetPlacement,
): FormFieldDraft {
  switch (tool.fieldKind) {
    case 'radio':
      return { kind: 'radio', name, widgets: [{ ...widget, exportValue: 'Choice1' }] };
    case 'combobox':
    case 'listbox':
      return {
        kind: tool.fieldKind,
        name,
        widgets: [widget],
        options: [
          { label: 'Option 1', value: 'Option 1' },
          { label: 'Option 2', value: 'Option 2' },
        ],
      };
    case 'pushbutton':
      return { kind: 'pushbutton', name, widgets: [{ ...widget, caption: 'Button' }] };
    default:
      return { kind: tool.fieldKind, name, widgets: [widget] };
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
 * An upright tool places the field as the author sees the page: the press's
 * display rotation goes to `gesturePlacement`, and the widget takes the
 * placed frame and its turn (`placedOnPage`), so on a page shown turned the
 * field reads upright. The ghost and the drag's preview make the same call
 * with the same turn.
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
  let origin: { page: PageRef; start: Vec; last: Vec; displayRotation?: Rotation } | null = null;
  /** Whether the tool places upright: the annotation plugin's tool says, else the tool table. */
  const uprightOf = (tool: FormToolDefinition): boolean =>
    annotation?.getResolvedTool(tool.id)?.upright ?? tool.upright;
  /** Drop the gesture and what it painted: its placement and the tool's ghost. */
  const endGesture = (): void => {
    origin = null;
    annotation?.clearPlacementPreview();
    annotation?.clearGhost();
  };

  const place = async (
    tool: FormToolDefinition,
    page: PageRef,
    placement: Extract<Placement, { kind: 'box' }>,
  ): Promise<void> => {
    const pageBox = form.getPageBox(page);
    const placed = pageBox ? placedOnPage(placement, pageBox) : null;
    if (!placed) return;
    // Style from the tool's live defaults when the annotation plugin holds
    // them (the user may have restyled the tool); without it, use the tool
    // table's defaults, so a field is never invisible.
    const look = widgetAppearanceOf(
      annotation ? annotation.tools.getDefaults(tool.id) : tool.defaults,
    );
    const name = nextFieldName(tool.fieldKind, new Set(form.list().map((field) => field.name)));
    // The new field shows at once, when the document holds the numbers it
    // takes: then it is selected in the same frame. Otherwise once it shows.
    const created = form.create(
      toolDraft(tool, name, { page, ...placed, ...look }, form.getDesignGroup()),
    );
    const field = form.get({ kind: 'fqn', name }) ?? (await created).field;
    // Skip the follow-up when the tool changed meanwhile.
    if (!annotation || interaction.getActiveToolId() !== tool.id) return;
    const policy = annotation.getSettings().afterCreate;
    const widget = field.widgets.find(
      (candidate) => candidate.page?.objectNumber === page.objectNumber,
    );
    if (policy.select && widget?.ref) annotation.selection.select([widget.ref]);
    // Back to design's resting tool, not the default pointer: that one fills, which would end
    // design and drop the new field's selection.
    if (policy.tool === 'default') interaction.activateTool('form-edit');
    await created;
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
    onPointerDown: (sample) => {
      // No capture without a page, a known palette tool, or design permission:
      // declining lets editing, panning or text selection take the gesture.
      if (!sample.page || !FORM_TOOL_BY_ID.has(interaction.getActiveToolId())) return false;
      if (!form.canDesign()) return false;
      origin = {
        page: sample.page.ref,
        start: sample.page.point,
        last: sample.page.point,
        displayRotation: sample.page.rotation,
      };
      return true;
    },
    onPointerMove: (sample) => {
      if (!origin) return;
      const point = samplePointOn(sample, origin.page);
      if (!point) return;
      origin.last = point;
      annotation?.previewPlacement(
        interaction.getActiveToolId(),
        origin.page,
        origin.start,
        point,
        origin.displayRotation,
      );
    },
    onPointerUp: (sample) => {
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
        upright: uprightOf(tool),
        displayRotation: gesture.displayRotation,
      });
      if (placement?.kind !== 'box') return;
      place(tool, gesture.page, placement).catch((error) => {
        globalThis.console?.error('[form] placing the field failed:', error);
      });
    },
    // Aborted (a second finger, a system cancel): nothing is placed.
    onPointerCancel: endGesture,
  };
}
