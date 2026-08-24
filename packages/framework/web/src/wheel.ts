/**
 * Wheel-input classification for ambient zoom — pure, so every framework
 * adapter shares one feel and the mapping is unit-testable.
 *
 * A ctrl/cmd wheel event is one of three physically different inputs that
 * happen to share an event type, each with its own unit system:
 *
 *   • trackpad PINCH — browsers (Chrome/Edge/Firefox) synthesize ctrl+wheel
 *     px-deltas scaled to the de-facto convention that `exp(-Δ/100)` tracks
 *     the physical finger scale 1:1. Anything weaker feels dead (the content
 *     must track the fingers — the Figma/maps feel).
 *   • mouse NOTCHES — coarse steps: ±100/±120 px in Chrome, lines/pages mode
 *     in Firefox. The pinch mapping would triple per click; a notch instead
 *     steps by 1.2, the same ratio as the zoom buttons.
 *   • cmd + continuous SCROLL — real scroll px, big and streaming (with
 *     momentum): a gentle scrub coefficient. A cmd+mouse notch (±120 px)
 *     lands within 0.3% of the 1.2 button step, so it needs no special case.
 *
 * (Safari never synthesizes ctrl+wheel for pinch — it fires proprietary
 * gesture events with an absolute scale; that wiring lives in the adapters.)
 */
export interface WheelSample {
  deltaY: number;
  /** WheelEvent.deltaMode: 0 = pixels, 1 = lines, 2 = pages. */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** The per-notch step for discrete wheels — the zoom buttons' ratio. */
const NOTCH = 1.2;

/** Zoom factor for a ctrl/cmd wheel event (the caller decides zoom vs pan). */
export function wheelZoomFactor(e: WheelSample): number {
  // Lines/pages mode (Firefox mouse wheels): one button-step per notch.
  if (e.deltaMode !== 0) return Math.pow(NOTCH, -Math.sign(e.deltaY));
  if (e.ctrlKey) {
    // px deltas with ctrl: a real mouse notch arrives big (±100/±120) and
    // steps like the buttons; anything smaller is a synthesized pinch.
    if (Math.abs(e.deltaY) >= 100) return Math.pow(NOTCH, -Math.sign(e.deltaY));
    return Math.exp(-e.deltaY / 100);
  }
  // cmd + continuous scroll: the gentle scrub.
  return Math.exp(-e.deltaY * 0.0015);
}
