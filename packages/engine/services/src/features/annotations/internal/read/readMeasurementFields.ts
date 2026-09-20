import type {
  LineDimensionCaption,
  ShapeDimensionCaption,
  LineLeader,
  PdfMeasurement,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { withScratchN } from '../../../../runtime/memory/scratch';
import { readMeasure } from '../../../measure/internal/measureCodec';

export function readAnnotationMeasure(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annot: Ptr,
): { measure?: PdfMeasurement } {
  const measure = readMeasure(fn, mem, fn.EPDFAnnot_GetMeasure(annot));
  return measure ? { measure } : {};
}

export function readLineCaption(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annot: Ptr,
): LineDimensionCaption | undefined {
  if (!['Cap', 'CP', 'CO'].some((key) => fn.FPDFAnnot_HasKey(annot, key))) return undefined;
  return withScratchN(mem, [4, 4, 8], ([enabled, position, offset]) => {
    if (!fn.EPDFAnnot_GetLineCaption(annot, enabled, position, offset)) return undefined;
    return {
      enabled: !!mem.peek(enabled, 'i32'),
      position: mem.peek(position, 'i32') === 1 ? 'top' : 'inline',
      ...(fn.FPDFAnnot_HasKey(annot, 'CO')
        ? {
            offset: {
              along: Number(mem.peek(offset, 'f32')),
              perpendicular: Number(mem.peek(offset, 'f32', 4)),
            },
          }
        : {}),
    };
  });
}

export function readShapeCaption(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annot: Ptr,
): ShapeDimensionCaption | undefined {
  return withScratchN(mem, [4, 4, 8], ([enabled, hasCenter, center]) => {
    if (!fn.EPDFAnnot_GetShapeCaption(annot, enabled, hasCenter, center)) return undefined;
    const value = !!mem.peek(enabled, 'i32'),
      manual = !!mem.peek(hasCenter, 'i32');
    // Keep an explicitly disabled flag distinguishable from an untouched imported shape.
    const present = fn.EPDFAnnot_GetEmbedMetadataBoolean(annot, 'MeasurementCaption', enabled);
    if (!present && !manual) return undefined;
    return {
      enabled: value,
      ...(manual
        ? { center: { x: Number(mem.peek(center, 'f32')), y: Number(mem.peek(center, 'f32', 4)) } }
        : {}),
    };
  });
}

export function readLineLeader(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annot: Ptr,
): LineLeader | undefined {
  if (!['LL', 'LLE', 'LLO'].some((key) => fn.FPDFAnnot_HasKey(annot, key))) return undefined;
  return withScratchN(mem, [4, 4, 4], ([length, extension, offset]) => {
    if (!fn.EPDFAnnot_GetLineLeader(annot, length, extension, offset)) return undefined;
    return {
      length: Number(mem.peek(length, 'f32')),
      extension: Number(mem.peek(extension, 'f32')),
      offset: Number(mem.peek(offset, 'f32')),
    };
  });
}
