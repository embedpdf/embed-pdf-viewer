import type { PdfRect } from '../../../geometry/primitives';
import type { BinarySource, ResourceRef } from '../../../resource/BinarySource';
import type { AnnotationPatchBase } from '../../patch-base';
import type { StampFit } from './draft';

/**
 * Authoring patch. Supplying `source` replaces the stamp's visual content
 * (the writer clears the existing appearance objects and re-appends).
 */
export interface StampPatch extends AnnotationPatchBase {
  subtype: 'stamp';
  rect?: PdfRect;
  source?: BinarySource;
  name?: string;
  fit?: StampFit;
  rotation?: number;
  unrotatedRect?: PdfRect;
}

/** Wire form of {@link StampPatch} — see {@link StampWireDraft} for the rules. */
export interface StampWirePatch extends AnnotationPatchBase {
  subtype: 'stamp';
  rect?: PdfRect;
  source?: ResourceRef;
  name?: string;
  fit?: StampFit;
  rotation?: number;
  unrotatedRect?: PdfRect;
}
