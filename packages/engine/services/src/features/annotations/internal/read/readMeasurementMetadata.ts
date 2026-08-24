import { parseMeasurementInfo } from '@embedpdf/engine-core/runtime';
import type { MeasurementInfo } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

/**
 * Read the measurement calibration written by `writeMeasurementMetadata` —
 * `/EMBD_Metadata/Measurement`, a JSON string.
 *
 * The value is UNTRUSTED: it survives in the file across versions of us, and
 * any tool can write into a vendor dictionary. So it is parsed and then
 * structurally VALIDATED (`parseMeasurementInfo`, the zod-free guard that
 * lives with the type), and anything that fails reads as `null` — an
 * annotation that merely stops being a measurement, never a throw that would
 * take down the whole page read.
 *
 * `/IT` is deliberately NOT consulted here. It is the portable marker we
 * write FOR other viewers; the calibration is what makes an annotation a
 * measurement for us, and a `/IT /PolygonDimension` with no readable
 * calibration is a dimension we cannot evaluate.
 */
const KEY_MEASUREMENT = 'Measurement';

export function readMeasurementMetadata(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): MeasurementInfo | null {
  if (!fn.EPDFAnnot_HasEmbedMetadata(annotPtr)) return null;

  // Two-pass UTF-16LE read, mirroring readEmbedMetadata's readMetaString.
  const len = fn.EPDFAnnot_GetEmbedMetadataString(annotPtr, KEY_MEASUREMENT, NULL_PTR, 0);
  if (len <= 2) return null; // absent, or the empty string

  const buf = mem.alloc(len);
  let raw: string;
  try {
    const written = fn.EPDFAnnot_GetEmbedMetadataString(annotPtr, KEY_MEASUREMENT, buf, len);
    if (written <= 0) return null;
    raw = mem.readU16String(buf);
  } finally {
    mem.free(buf);
  }

  try {
    return parseMeasurementInfo(JSON.parse(raw));
  } catch {
    return null;
  }
}
