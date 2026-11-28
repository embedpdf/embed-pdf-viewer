import {
  gesturePlacement,
  placedBoxFields,
  standingRect,
  widgetAppearanceOf,
  type Placement,
} from '@embedpdf/core-annotation';
import type { Rotation } from '@embedpdf/core-geometry';
import type {
  FieldAssignment,
  FormFieldDraft,
  PageRef,
  WidgetPlacement,
} from '@embedpdf/engine-core/runtime';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  samplePointOn,
  type InteractionHandler,
  type InteractionHostCapability,
} from '@embedpdf/plugin-interaction/contract/host';

import type { FormHostCapability } from '../host-contract';
import { patchOfAssignment, UNASSIGNED, type Box } from '../model';
import { FORM_TOOL_BY_ID, type FormToolDefinition } from './definitions';

type Vec = { x: number; y: number };

/**
 * How a field placed with `tool` looks: the tool's live defaults when the annotation plugin
 * holds them (the user may have restyled the tool), else the tool table's, so a field is never
 * invisible. The place handler and the tool's ghost both read it.
 */
export function toolLookOf(
  tool: FormToolDefinition,
  annotation: Pick<AnnotationHostCapability, 'tools'> | null,
): ReturnType<typeof widgetAppearanceOf> {
  return widgetAppearanceOf(annotation ? annotation.tools.getDefaults(tool.id) : tool.defaults);
}

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
 * `text_1`, for `assignment`, who the palette places for (the form's design
 * assignment): in a group (`groupId`, as 3.4 placed it), or anyone's
 * (`assignment`), but never anyone's for a signature field, which one signer
 * signs. Nobody's, where it starts, names none, and the field is in no group.
 * A radio button stands for `'Choice1'` and a dropdown or a list starts with
 * two options, as in Acrobat; rename and change them in a settings panel.
 * What the tool gives its fields (`tool.field`: a purpose, a format, a flag)
 * goes over what its kind starts with.
 */
export function toolDraft(
  tool: FormToolDefinition,
  name: string,
  widget: WidgetPlacement,
  assignment: FieldAssignment = UNASSIGNED,
): FormFieldDraft {
  const draft = { ...kindDraft(tool, name, widget), ...tool.field } as FormFieldDraft;
  if (assignment.kind === 'unassigned') return draft;
  if (assignment.kind === 'anyone' && !placesForAnyone(tool)) return draft;
  return { ...draft, ...patchOfAssignment(assignment) } as FormFieldDraft;
}

/** Whether a tool's field may be one anyone fills in: any but a signature field. */
export const placesForAnyone = (tool: FormToolDefinition): boolean =>
  tool.fieldKind !== 'signature';

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
      // An image field shows its image alone: a caption would only show if its layout changed.
      return {
        kind: 'pushbutton',
        name,
        widgets: [widget.layout === 'image' ? widget : { ...widget, caption: 'Button' }],
      };
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
  /** The field tools: the built-in ones unless the document's are given. */
  tools: ReadonlyMap<string, FormToolDefinition> = FORM_TOOL_BY_ID,
): InteractionHandler {
  let origin: { page: PageRef; start: Vec; last: Vec; displayRotation?: Rotation } | null = null;
  /** Whether the tool places upright: the annotation plugin's tool says, else the tool table. */
  const uprightOf = (tool: FormToolDefinition): boolean =>
    annotation?.getResolvedTool(tool.id)?.upright ?? tool.upright;
  /**
   * The active tool, when it is a field tool and the user may design the form. While fields are
   * placed for anyone, the signature tool is off: no ghost, and the press goes on to the other
   * handlers.
   */
  const placingTool = (): FormToolDefinition | null => {
    const tool = tools.get(interaction.getActiveToolId());
    if (!tool || !form.canDesign()) return null;
    return form.getDesignAssignment().kind === 'anyone' && !placesForAnyone(tool) ? null : tool;
  };
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
    const look = toolLookOf(tool, annotation);
    const name = nextFieldName(tool.fieldKind, new Set(form.list().map((field) => field.name)));
    // The new field shows at once, when the document holds the numbers it
    // takes: then it is selected in the same frame. Otherwise once it shows.
    const created = form.create(
      toolDraft(tool, name, { page, ...placed, ...look }, form.getDesignAssignment()),
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
      const tool = sample.page && !interaction.hasCursorClaim() ? placingTool() : null;
      if (sample.page && tool) {
        annotation.hoverGhostAt(
          tool.id,
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
      // No capture without a page, a known palette tool, or the right to place its field:
      // declining lets editing, panning or text selection take the gesture.
      if (!sample.page || !placingTool()) return false;
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
      const tool = tools.get(interaction.getActiveToolId());
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
