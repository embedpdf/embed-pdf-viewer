import type { AnnotationDraftBase } from '../../draft-base';
import type { TextMarkupDraftFields } from '../text-markup.shared';

export interface UnderlineDraft extends AnnotationDraftBase, TextMarkupDraftFields {
  subtype: 'underline';
}
