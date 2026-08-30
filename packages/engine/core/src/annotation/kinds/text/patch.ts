import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationPatchBase } from '../../patch-base';
import type { AnnotationState, AnnotationStateModel } from '../../primitives';
import type { ColorStylePatchFields } from '../style.shared';
import type { NoteIcon } from './draft';

export interface TextPatch extends AnnotationPatchBase, ColorStylePatchFields {
  subtype: 'text';
  rect?: PdfRect;
  icon?: NoteIcon;
  /** `/State`, three-state: undefined=leave, null=remove the entry, value=set. */
  state?: AnnotationState | null;
  /** `/StateModel`, three-state: undefined=leave, null=remove the entry, value=set. */
  stateModel?: AnnotationStateModel | null;
}
