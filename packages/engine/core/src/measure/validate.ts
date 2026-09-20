import type { PdfMeasure } from '../dto/Measure';
import { validNumberFormat } from './format';

/** Shared preflight for HTTP, workers and calibration helpers. Does not write. */
export function assertWritableMeasure(value: PdfMeasure): void {
  if (value.subtype !== 'RL') throw new RangeError('Only rectilinear measures can be authored');
  if (value.ratio !== undefined && (typeof value.ratio !== 'string' || value.ratio.includes('\0')))
    throw new RangeError('Invalid scale ratio');
  for (const key of ['x', 'y', 'distance', 'area', 'angle', 'slope'] as const) {
    const list = value[key];
    if (list === undefined && (key === 'y' || key === 'angle' || key === 'slope')) continue;
    if (!Array.isArray(list)) throw new RangeError(`Missing ${key} formats`);
    for (const nf of list) {
      if (!nf || typeof nf.unit !== 'string' || !validNumberFormat(nf))
        throw new RangeError('Invalid number format');
      if (
        nf.fraction !== undefined &&
        !['decimal', 'fraction', 'round', 'truncate'].includes(nf.fraction)
      )
        throw new RangeError('Invalid fraction mode');
      if (nf.labelPosition !== undefined && !['prefix', 'suffix'].includes(nf.labelPosition))
        throw new RangeError('Invalid label position');
      if (nf.fixed !== undefined && typeof nf.fixed !== 'boolean')
        throw new RangeError('Invalid fixed precision');
      for (const key of [
        'unit',
        'thousands',
        'decimal',
        'prefixSpacing',
        'suffixSpacing',
      ] as const) {
        const text = nf[key];
        if (text !== undefined && (typeof text !== 'string' || text.includes('\0')))
          throw new RangeError('Invalid measurement text');
      }
    }
  }
  if (value.origin !== undefined)
    for (const n of [value.origin.x, value.origin.y]) assertPdfFloat(n);
  if (value.cyx !== undefined) {
    assertPdfFloat(value.cyx);
    if (Math.fround(value.cyx) <= 0) throw new RangeError('Invalid CYX');
  }
}
export function assertPdfFloat(n: number): void {
  if (typeof n !== 'number' || !Number.isFinite(Math.fround(n)))
    throw new RangeError('Value is outside PDF float range');
}
