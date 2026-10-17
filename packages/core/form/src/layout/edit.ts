/**
 * Laid-out text as the generator writes it (`GenerateEditAP`): a run per
 * line, each starting where the line's first character starts, moved by
 * `offset` (the vertical centring of a one-line field). A comb writes each
 * character on its own, at its cell.
 */
import type { TextLayout } from './variable-text';
import type { TextRun } from '../drawing/types';

const f32 = Math.fround;

export function textRuns(
  layout: TextLayout,
  offset: { readonly x: number; readonly y: number },
  continuous: boolean,
): TextRun[] {
  const runs: TextRun[] = [];
  for (const line of layout.lines) {
    if (line.words.length === 0) continue;
    if (continuous) {
      const first = line.words[0]!;
      runs.push({
        x: f32(first.x + offset.x),
        y: f32(first.y + offset.y),
        text: String.fromCharCode(...line.words.map((word) => word.code)),
        advances: line.words.map((word) => word.width),
      });
    } else {
      for (const word of line.words) {
        runs.push({
          x: f32(word.x + offset.x),
          y: f32(word.y + offset.y),
          text: String.fromCharCode(word.code),
          advances: [word.width],
        });
      }
    }
  }
  return runs;
}
