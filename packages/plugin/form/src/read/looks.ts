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
import { memoByKey } from '@embedpdf/core';
import type { SceneNode } from '@embedpdf/core-annotation';
import {
  drawingPrograms,
  textEditorLayout,
  widgetDrawing,
  widgetScene,
  type FontProgram,
  type TextEditorLayout,
} from '@embedpdf/core-form';
import type { AnnotationRef, FormFieldDTO, WidgetAnnotation } from '@embedpdf/engine-core/runtime';

import {
  fieldForWidget,
  pictureVersionOf,
  shownWidgetsOf,
  widgetRowOf,
  type FieldIndex,
  type ShownWidget,
} from '../model';
import type { FormServices } from '../services';

const NOTHING_SHOWN: readonly ShownWidget[] = Object.freeze([]);

/** A widget as the painter draws it: its scene on the page, and the font programs its text needs. */
export interface WidgetPainting {
  readonly scene: readonly SceneNode[];
  readonly programs: readonly FontProgram[];
}

const numberOf = (ref: AnnotationRef): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : -1;

export function createWidgetLooks({
  fields,
  formatted,
  design,
}: Pick<FormServices, 'fields' | 'formatted' | 'design'>) {
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

  /** The painter's drawing of a widget as the view has it; `null` for one it doesn't draw. */
  const sceneOf = memoByKey(
    (number: number) => {
      const view = fields.view();
      const row = widgetRowOf(view, number);
      const field = row ? fieldForWidget(view, number) : null;
      return [row, field, field ? formatted.textOf(field) : null] as const;
    },
    (_number, row, field, text): WidgetPainting | null => {
      if (!row || !field) return null;
      const drawing = widgetDrawing(row, field, text === null ? {} : { text });
      if (!drawing) return null;
      return {
        scene: widgetScene(drawing, { box: row.box ?? row.rect, rotation: row.rotation }),
        programs: drawingPrograms(drawing),
      };
    },
  );

  return {
    listShownWidgets: (pageObjectNumber: number) => shownOn(pageObjectNumber),
    getWidgetPainting: (ref: AnnotationRef) => sceneOf(numberOf(ref)),
    getTextEditorLayout: (ref: AnnotationRef, text: string): TextEditorLayout | null => {
      const view = fields.view();
      const number = numberOf(ref);
      const row = widgetRowOf(view, number);
      const field = row ? fieldForWidget(view, number) : null;
      return row && field ? textEditorLayout(row, field, text) : null;
    },
  };
}
