import type { AnnotationDraftBase } from '../../draft-base';
import type { TextMarkupDraftFields } from '../text-markup.shared';

export interface SquigglyDraft extends AnnotationDraftBase, TextMarkupDraftFields {
  subtype: 'squiggly';
}
