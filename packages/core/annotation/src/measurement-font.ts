import { helveticaAdvance } from './helvetica';

export const DISTANCE_CAPTION_SIZE = 9;

/**
 * A distance caption's width. Distance authoring uses the same base font as
 * the native caption fallback, Helvetica, also for headless callers.
 */
export function distanceCaptionWidth(text: string): number {
  return helveticaAdvance(text.trimEnd()) * DISTANCE_CAPTION_SIZE;
}
