/**
 * Telling a click from a drag on something drawn over a page (a search
 * match). The press still reaches the page, so a drag that starts there
 * selects text; only a press that stays put counts as a click.
 */

/**
 * How far (CSS px) a press may travel and still count as a click. A mouse or
 * pen press that travels 4 px starts selecting text (the selection plugin's
 * default drag threshold); a finger wobbles more on its own, and the Stage
 * treats a touch that stays within 10 px as a tap.
 */
const CLICK_SLOP_PX: Readonly<Record<string, number>> = { mouse: 4, pen: 4, touch: 10 };

/** Where a press started, from its `pointerdown`. */
interface Press {
  x: number;
  y: number;
  slop: number;
}

/** A click detector for one layer: feed it the `pointerdown`, ask it at the `click`. */
export interface ClickDetector {
  /** A press began (`pointerdown`). */
  press(event: { clientX: number; clientY: number; pointerType: string }): void;
  /** Whether this `click` is a click, not the end of a drag. Forgets the press. */
  isClick(event: { clientX: number; clientY: number }): boolean;
}

export function createClickDetector(): ClickDetector {
  let started: Press | null = null;
  return {
    press(event) {
      started = {
        x: event.clientX,
        y: event.clientY,
        slop: CLICK_SLOP_PX[event.pointerType] ?? CLICK_SLOP_PX.mouse,
      };
    },
    isClick(event) {
      const start = started;
      started = null;
      return !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < start.slop;
    },
  };
}
