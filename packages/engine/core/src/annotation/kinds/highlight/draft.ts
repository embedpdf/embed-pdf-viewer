import type { AnnotationDraftBase } from '../../draft-base';
import type { TextMarkupDraftFields } from '../text-markup.shared';

export interface HighlightDraft extends AnnotationDraftBase, TextMarkupDraftFields {
  subtype: 'highlight';
}
