import {
  EngineError,
  EngineErrorCode,
  type PdfMeasure,
  type PdfMeasurement,
  type PdfNumberFormat,
  type PdfPoint,
} from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';
import { withScratch } from '../../../runtime/memory/scratch';
import { readUtf16String, writeUtf16String } from '../../../runtime/memory/strings';

export const MEASURE_AXES = { x: 0, y: 1, distance: 2, area: 3, angle: 4, slope: 5 } as const;
const FRACTIONS = ['decimal', 'fraction', 'round', 'truncate'] as const;
const TEXT = ['thousands', 'decimal', 'prefixSpacing', 'suffixSpacing'] as const;

/** A native rejection after validated input is an internal invariant, never caller validation. */
export function requireMeasureWrite(ok: unknown): void {
  if (!ok)
    throw new EngineError(
      EngineErrorCode.Unknown,
      'Measurement native write failed after preflight',
    );
}
export function readMeasureNumber(
  mem: PdfRuntimeMemory,
  call: (p: Ptr) => boolean,
  type: 'f32' | 'i32' = 'f32',
): number | undefined {
  return withScratch(mem, 4, (p) => (call(p) ? Number(mem.peek(p, type)) : undefined));
}
export function withMeasurePoint<T>(
  mem: PdfRuntimeMemory,
  point: PdfPoint | undefined,
  call: (p: Ptr) => T,
): T {
  if (!point) return call(NULL_PTR);
  return withScratch(mem, 8, (p) => {
    mem.poke(p, 'f32', point.x);
    mem.poke(p, 'f32', point.y, 4);
    return call(p);
  });
}

export function readMeasure(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  handle: Ptr,
): PdfMeasurement | undefined {
  if (!handle) return undefined;
  const subtype = fn.EPDFMeasure_GetSubtype(handle);
  if (subtype !== 1) return { subtype: subtype === 2 ? 'geospatial' : 'unknown' };
  const formats = (axis: number): PdfNumberFormat[] =>
    Array.from({ length: fn.EPDFMeasure_CountFormats(handle, axis) }, (_, i) => {
      const f = fn.EPDFMeasure_GetFormat(handle, axis, i);
      const unit = readUtf16String(mem, (b, n) => fn.EPDFNumberFormat_GetUnit(f, b, n)) ?? '';
      const out: PdfNumberFormat = { unit };
      const conversion = readMeasureNumber(mem, (p) => fn.EPDFNumberFormat_GetConversion(f, p));
      if (conversion !== undefined) out.conversion = conversion;
      const fraction = readMeasureNumber(mem, (p) => fn.EPDFNumberFormat_GetFraction(f, p), 'i32');
      if (fraction !== undefined && FRACTIONS[fraction]) out.fraction = FRACTIONS[fraction];
      const precision = readMeasureNumber(
        mem,
        (p) => fn.EPDFNumberFormat_GetPrecision(f, p),
        'i32',
      );
      if (precision !== undefined) out.precision = precision;
      const fixed = readMeasureNumber(
        mem,
        (p) => fn.EPDFNumberFormat_GetFixedDenominator(f, p),
        'i32',
      );
      if (fixed !== undefined) out.fixed = !!fixed;
      const position = readMeasureNumber(
        mem,
        (p) => fn.EPDFNumberFormat_GetLabelPosition(f, p),
        'i32',
      );
      if (position !== undefined) out.labelPosition = position === 1 ? 'prefix' : 'suffix';
      for (const [code, key] of TEXT.entries()) {
        const text = readUtf16String(mem, (b, n) => fn.EPDFNumberFormat_GetText(f, code, b, n));
        if (text !== null) out[key] = text;
      }
      return out;
    });
  const ratio = readUtf16String(mem, (b, n) => fn.EPDFMeasure_GetRatio(handle, b, n));
  const origin = withScratch(mem, 8, (p) =>
    fn.EPDFMeasure_GetOrigin(handle, p)
      ? { x: Number(mem.peek(p, 'f32')), y: Number(mem.peek(p, 'f32', 4)) }
      : undefined,
  );
  const cyx = readMeasureNumber(mem, (p) => fn.EPDFMeasure_GetCYX(handle, p));
  const result: PdfMeasure = {
    subtype: 'rectilinear',
    x: formats(0),
    distance: formats(2),
    area: formats(3),
    ...(ratio !== null ? { ratio } : {}),
    ...(origin ? { origin } : {}),
    ...(cyx !== undefined ? { cyx } : {}),
  };
  for (const key of ['y', 'angle', 'slope'] as const) {
    const list = formats(MEASURE_AXES[key]);
    if (list.length) result[key] = list;
  }
  return result;
}

/** The caller supplies a freshly created/reset handle and has completed preflight. */
export function writeMeasure(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  handle: Ptr,
  value: PdfMeasure,
): void {
  requireMeasureWrite(handle);
  if (value.ratio !== undefined)
    requireMeasureWrite(
      writeUtf16String(mem, value.ratio, (p) => fn.EPDFMeasure_SetRatio(handle, p)),
    );
  if (value.origin)
    requireMeasureWrite(
      withMeasurePoint(mem, value.origin, (p) => fn.EPDFMeasure_SetOrigin(handle, p)),
    );
  if (value.cyx !== undefined)
    withScratch(mem, 4, (p) => {
      mem.poke(p, 'f32', value.cyx!);
      requireMeasureWrite(fn.EPDFMeasure_SetCYX(handle, p));
    });
  for (const [key, axis] of Object.entries(MEASURE_AXES)) {
    for (const nf of value[key as keyof typeof MEASURE_AXES] ?? []) {
      const text = mem.writeU16String(nf.unit);
      let f: Ptr;
      try {
        f = fn.EPDFMeasure_AddFormat(handle, axis, text, nf.conversion!);
      } finally {
        mem.free(text);
      }
      requireMeasureWrite(f);
      if (nf.fraction !== undefined)
        requireMeasureWrite(fn.EPDFNumberFormat_SetFraction(f, FRACTIONS.indexOf(nf.fraction)));
      if (nf.precision !== undefined)
        requireMeasureWrite(fn.EPDFNumberFormat_SetPrecision(f, nf.precision));
      if (nf.fixed !== undefined)
        requireMeasureWrite(fn.EPDFNumberFormat_SetFixedDenominator(f, nf.fixed));
      if (nf.labelPosition !== undefined)
        requireMeasureWrite(
          fn.EPDFNumberFormat_SetLabelPosition(f, nf.labelPosition === 'prefix' ? 1 : 0),
        );
      for (const [code, key] of TEXT.entries()) {
        if (nf[key] !== undefined)
          requireMeasureWrite(
            writeUtf16String(mem, nf[key]!, (p) => fn.EPDFNumberFormat_SetText(f, code, p)),
          );
      }
    }
  }
}
