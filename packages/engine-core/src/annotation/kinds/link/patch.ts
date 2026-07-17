import type { PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';
import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';

/**
 * Move (`rect`) and RETARGET a link. `target` replaces the `/A` action;
 * only `goto`/`uri` targets are writable. There is deliberately no
 * `target: null` — the runtime has no dict-entry removal primitive, so a
 * target cannot be CLEARED in place (delete the annotation instead; a
 * fork `EPDFAnnot_RemoveEntry` can lift this later without a wire bump).
 */
export interface LinkPatch extends AnnotationPatchBase {
  subtype: 'link';
  rect?: PdfRect;
  target?: PdfLinkTargetWritable;
}
