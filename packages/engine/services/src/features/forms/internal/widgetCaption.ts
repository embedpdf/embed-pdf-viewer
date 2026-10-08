import { EngineError, EngineErrorCode, type FormFieldFamily } from '@embedpdf/engine-core/runtime';

/**
 * A widget placement or patch as a `family` widget takes it. A caption is a
 * push button's (`/MK /CA`). Another widget's `/MK /CA` is no caption (a
 * checkbox's is its symbol): its `caption: null`, as its row reads, is
 * dropped, and a caption is refused.
 */
export function fitCaptionToFamily<T extends { readonly caption?: string | null }>(
  family: FormFieldFamily,
  value: T,
): T {
  if (family === 'pushbutton' || value.caption === undefined) return value;
  if (value.caption !== null) {
    const widget = family === 'unknown' ? 'this widget' : `a ${family} field's widget`;
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `'caption' applies to a push button's widgets, not to ${widget}`,
      { details: { field: 'caption' } },
    );
  }
  const { caption: _none, ...rest } = value;
  return rest as unknown as T;
}
