/**
 * What a form widget takes, by its field's family: the rules the engine
 * checks a widget placement or patch with, and the row a patch leaves.
 */
import type { FormFieldFamily } from './field';
import type { WidgetAnnotation, WidgetPatch } from '../annotation/kinds/widget';
import type { WidgetCheckStyle } from '../annotation/primitives';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageBox } from '../geometry/pageSpace';
import type { Coordinates } from '../pageSpace/coordinates';
import { applyAnnotationPatch } from '../pageSpace/helpers';

/**
 * A widget placement or patch as a `family` widget takes it. `/MK /CA` is a
 * push button's caption and a checkbox's or radio button's symbol
 * (`checkStyle`), so each goes on its own family's widgets only: on another
 * widget, a `null` (as its row reads) is dropped, and a value is refused.
 */
export function fitWidgetToFamily<
  T extends { readonly caption?: string | null; readonly checkStyle?: WidgetCheckStyle | null },
>(family: FormFieldFamily, value: T): T {
  const toggle = family === 'checkbox' || family === 'radio';
  const fitted = fitToFamily(family, value, 'caption', family === 'pushbutton', "a push button's");
  return fitToFamily(family, fitted, 'checkStyle', toggle, "a checkbox's or radio button's");
}

function fitToFamily<T extends Record<string, unknown>>(
  family: FormFieldFamily,
  value: T,
  key: 'caption' | 'checkStyle',
  takes: boolean,
  whose: string,
): T {
  if (takes || value[key] === undefined) return value;
  if (value[key] !== null) {
    const widget = family === 'unknown' ? 'this widget' : `a ${family} field's widget`;
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `'${key}' applies to ${whose} widgets, not to ${widget}`,
      { details: { field: key } },
    );
  }
  const { [key]: _none, ...rest } = value;
  return rest as T;
}

/**
 * `forms.updateWidget`: the row a widget patch leaves, as an annotation
 * patch leaves it (a move keeps the look), checked against the widget's
 * family first. A new box or turn moves where it stands (`standingRectOf`).
 */
export function widgetAfterPatch<C extends Coordinates>(
  row: WidgetAnnotation<C>,
  patch: WidgetPatch,
): WidgetAnnotation<C> {
  const fitted = fitWidgetToFamily(row.fieldFamily, patch);
  const after = applyAnnotationPatch(
    row as never,
    { subtype: 'widget', ...fitted } as never,
  ) as unknown as WidgetAnnotation<C>;
  const placed = ['box', 'rect', 'rotation'].some((key) => key in fitted);
  if (!placed) return after;
  // Rows are in page space here (a box is `{ x, y, width, height }`).
  return { ...after, rect: standingRectOf(after.box as PageBox, after.rotation) as never };
}

/**
 * Where a widget stands on the page: its box, with its sides swapped under a
 * quarter turn (its contents turn, the frame keeps its place).
 */
export function standingRectOf<B extends { x: number; y: number; width: number; height: number }>(
  box: B,
  rotation: number | null | undefined,
): B {
  const turn = (((rotation ?? 0) % 360) + 360) % 360;
  if (turn !== 90 && turn !== 270) return box;
  const { x, y, width, height } = box;
  return {
    ...box,
    x: x + (width - height) / 2,
    y: y + (height - width) / 2,
    width: height,
    height: width,
  };
}
