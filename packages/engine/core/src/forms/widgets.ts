/**
 * What a form widget takes, by its field's family: the rules the engine
 * checks a widget placement or patch with, and the row a patch leaves.
 */
import type { FormFieldFamily } from './field';
import type { WidgetAnnotation, WidgetPatch } from '../annotation/kinds/widget';
import type { WidgetCheckStyle } from '../annotation/primitives';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
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
 * patch leaves it (a move keeps the look, the engine works out the rect),
 * checked against the widget's family first.
 */
export function widgetAfterPatch<C extends Coordinates>(
  row: WidgetAnnotation<C>,
  patch: WidgetPatch,
): WidgetAnnotation<C> {
  const fitted = fitWidgetToFamily(row.fieldFamily, patch);
  return applyAnnotationPatch(
    row as never,
    { subtype: 'widget', ...fitted } as never,
  ) as unknown as WidgetAnnotation<C>;
}
