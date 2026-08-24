import type { AnnotationDraftBase } from '../../draft-base';
import type { StrikeoutIntent } from '../../primitives';
import type { TextMarkupDraftFields } from '../text-markup.shared';

export interface StrikeoutDraft extends AnnotationDraftBase, TextMarkupDraftFields {
  subtype: 'strikeout';
  intent?: StrikeoutIntent;
}
