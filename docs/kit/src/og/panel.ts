/**
 * The code panel's geometry — the one place that knows how much code the card
 * can hold, and what happens when a snippet holds more.
 *
 * It lives apart from ./card.tsx because ./snippet.ts asks the same question
 * when it decides WHAT to put in the panel.
 *
 * The panel does not wrap. Like the editor it is imitating, a line wider than
 * the panel simply runs off the right edge and is clipped — which the card
 * leans into, since the panel already overhangs the canvas. Reflowing code
 * into a continuation indent read as damage on exactly the lines that were
 * most worth showing.
 */
import type { OgLine, OgToken } from './highlight';

export const CODE_FONT_SIZE = 15;
export const CODE_LINE_HEIGHT = 28;

/**
 * Rows that clear the fade entirely.
 *
 * The panel is 380px, the tab strip takes 54 and the body pads 26 at the top
 * and nothing at the bottom — 300px, or ten 28px rows. A snippet within this
 * is shown whole and crisp, and the fade stays hidden.
 */
export const VISIBLE_ROWS = 10;

/**
 * Rows still worth drawing once a snippet overflows. The extra two sit under
 * the darkest part of the fade, so the code reads as continuing past the edge
 * rather than stopping at a suspiciously flat last line.
 */
export const OVERFLOW_ROWS = VISIBLE_ROWS + 2;

export interface PanelRow {
  tokens: OgToken[];
  /** 1-based source line, for the gutter. */
  lineNumber: number;
}

/** The rows the panel will draw: one per source line, numbered, capped. */
export function toPanelRows(lines: OgLine[], limit = OVERFLOW_ROWS): PanelRow[] {
  return lines.slice(0, limit).map((tokens, index) => ({ tokens, lineNumber: index + 1 }));
}

/** Rows a snippet needs — one per line, since nothing wraps. */
export function panelRows(code: string) {
  return code.split('\n').length;
}

/** Whether a snippet sits on the card whole, with no fade. */
export function fitsPanel(code: string) {
  return Boolean(code.trim()) && panelRows(code) <= VISIBLE_ROWS;
}
