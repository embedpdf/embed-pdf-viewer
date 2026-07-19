import type { TextMarkupDTO } from '../text-markup.shared';
import type { StrikeoutIntent } from '../../primitives';

export type StrikeoutAnnotationDTO = TextMarkupDTO<'strikeout'> & {
  /** Normalized `/IT`; null for an ordinary standalone strikeout. */
  intent: StrikeoutIntent | null;
};
