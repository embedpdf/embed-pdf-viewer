import type { PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';
import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';

/**
 * Move (`rect`) and retarget a link. `target` is three-state: `undefined`
 * leaves it, a value REPLACES the `/A` action (any stray direct `/Dest`
 * is stripped — the spec forbids both), and `null` CLEARS the target
 * entirely (`/A` and `/Dest` both removed → a dead link). Only
 * `goto`/`uri` targets are writable.
 */
export interface LinkPatch extends AnnotationPatchBase {
  subtype: 'link';
  rect?: PdfRect;
  target?: PdfLinkTargetWritable | null;
}
