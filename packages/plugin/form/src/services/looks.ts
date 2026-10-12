/**
 * What a shown widget looks like now: the engine's picture, or the painter's
 * drawing of it (`@embedpdf/core-form`).
 *
 * A widget's look is everything its picture depends on: its size and turn,
 * its style, and what it shows (the value, as this session formatted it). Its
 * place isn't (a move keeps the look), nor the state a toggle shows (its
 * picture of every state is held). A widget is `pending` while its look in
 * the view isn't its confirmed look: a value typed or calculated, a restyle,
 * a field just placed. The layer then draws the painter's scene, as it does
 * while the picture it holds is older than the widget's look.
 */
import { memoByKey, type Mirror } from '@embedpdf/core';
import type { SceneNode } from '@embedpdf/core-annotation';
import {
  paints,
  textEditorLayout,
  widgetDrawing,
  widgetScene,
  type TextEditorLayout,
} from '@embedpdf/core-form';
import type { AnnotationRef, FormFieldDTO, WidgetAnnotation } from '@embedpdf/engine-core/runtime';

import {
  fieldForWidget,
  pictureVersionOf,
  shownWidgetsOf,
  widgetRowOf,
  type Box,
  type FieldIndex,
  type ShownWidget,
} from '../model';
import type { FormDesign } from './design';
import type { FormattedTexts } from './formatted';

const NOTHING_SHOWN: readonly ShownWidget[] = Object.freeze([]);

/** A widget as the painter draws it: its scene on the page (its text carries the faces it needs). */
export interface WidgetPainting {
  readonly scene: readonly SceneNode[];
}

const numberOf = (ref: AnnotationRef): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : -1;

export type WidgetLooks = ReturnType<typeof createWidgetLooks>;

export function createWidgetLooks({
  fields,
  formatted,
  design,
}: {
  readonly fields: Mirror<FieldIndex>;
  readonly formatted: FormattedTexts;
  readonly design: FormDesign;
}) {
  /** What the widget's picture depends on, as one string. */
  const lookKeyOf = (row: WidgetAnnotation, field: FormFieldDTO | null): string => {
    const box = row.box ?? row.rect;
    const content = (() => {
      switch (field?.family) {
        case 'text':
          return [
            formatted.textOf(field) ?? field.value,
            field.multiline,
            field.password,
            field.comb,
            field.maxLength,
          ];
        case 'combobox':
          return [formatted.textOf(field) ?? field.value];
        case 'listbox':
          return [field.topIndex, field.options.map((option) => [option.label, option.selected])];
        default:
          return [field?.family ?? null];
      }
    })();
    return JSON.stringify([
      box.width,
      box.height,
      row.rotation ?? 0,
      row.color ?? null,
      row.interiorColor ?? null,
      row.strokeWidth ?? null,
      row.borderStyle ?? null,
      row.dashArray ?? null,
      row.fontFamily ?? null,
      row.fontSize ?? null,
      row.fontColor ?? null,
      row.textAlign ?? null,
      row.caption ?? null,
      row.checkStyle ?? null,
      content,
    ]);
  };

  const lookOf = (index: FieldIndex, number: number): string | null => {
    const row = widgetRowOf(index, number);
    return row ? lookKeyOf(row, fieldForWidget(index, number)) : null;
  };

  // In design mode the annotation layer draws the widgets it borrowed.
  const shownOn = memoByKey(
    (_pageObjectNumber: number) =>
      [fields.view(), fields.get(), formatted.version(), design.lending()] as const,
    (pageObjectNumber, view, truth, _formatted, lent): readonly ShownWidget[] =>
      lent
        ? NOTHING_SHOWN
        : shownWidgetsOf(view, pageObjectNumber, (row) => {
            const number = numberOf(row.ref);
            return {
              pending: lookOf(view, number) !== lookOf(truth, number),
              pictureVersion: pictureVersionOf(truth, number),
            };
          }),
  );

  /** The painter's drawing of `row` (in the view's field, as this session formatted it) at `box`, turned. */
  const paint = (
    row: WidgetAnnotation,
    box: Box,
    rotation: number | null | undefined,
  ): readonly SceneNode[] | null => {
    const view = fields.view();
    const field = fieldForWidget(view, numberOf(row.ref));
    if (!field) return null;
    const text = formatted.textOf(field);
    const drawing = widgetDrawing({ ...row, box }, field, text === null ? {} : { text });
    return drawing && widgetScene(drawing, { box, rotation });
  };

  /** The painter's drawing of a widget as the view has it; `null` for one it doesn't draw. */
  const sceneOf = memoByKey(
    (number: number) => {
      const view = fields.view();
      const row = widgetRowOf(view, number);
      const field = row ? fieldForWidget(view, number) : null;
      return [row, field, field ? formatted.textOf(field) : null] as const;
    },
    (_number, row): WidgetPainting | null => {
      const scene = row && paint(row, row.box ?? row.rect, row.rotation);
      return scene ? { scene } : null;
    },
  );

  return {
    listShownWidgets: (pageObjectNumber: number) => shownOn(pageObjectNumber),
    getWidgetPainting: (ref: AnnotationRef) => sceneOf(numberOf(ref)),
    /** The widget's look in the view isn't its confirmed look yet: it draws live until its picture is. */
    isPending: (ref: AnnotationRef): boolean => {
      const number = numberOf(ref);
      return lookOf(fields.view(), number) !== lookOf(fields.get(), number);
    },
    /**
     * How the painter draws a widget row live, upright in a box (where a gesture has it); `null`
     * for one whose field it doesn't draw (a signature).
     */
    painterOf: (row: WidgetAnnotation): ((box: Box) => readonly SceneNode[]) | null => {
      const field = fieldForWidget(fields.view(), numberOf(row.ref));
      return field && paints(field) ? (box) => paint(row, box, 0) ?? [] : null;
    },
    getTextEditorLayout: (ref: AnnotationRef, text: string): TextEditorLayout | null => {
      const view = fields.view();
      const number = numberOf(ref);
      const row = widgetRowOf(view, number);
      const field = row ? fieldForWidget(view, number) : null;
      return row && field ? textEditorLayout(row, field, text) : null;
    },
  };
}
