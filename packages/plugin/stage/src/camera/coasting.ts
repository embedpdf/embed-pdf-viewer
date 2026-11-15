/**
 * Coasting, told from a new push. After the fingers leave a trackpad the
 * scroll coasts: wheels keep coming for a second or more, slower and slower.
 * The next swipe often begins before they stop, so no pause sets the two
 * apart, and a wheel doesn't say which of the two it is. The speed does:
 * coasting only slows down, so a scroll that speeds up after it has slowed is
 * a new push.
 *
 * Speed, not the size of a wheel. A browser hands over one wheel for however
 * many the trackpad sent since the last, so sizes double and halve at a steady
 * speed. Each wheel carries the time it happened, and the distance over that
 * time holds steady.
 */

/** How many times its slowest speed a scroll has to reach, to have sped up. */
const PUSH_GROWTH = 2.5;

/**
 * The slowest speed a push is told against, in px per ms. A scroll about to
 * stop moves a pixel or two a frame, where one pixel more doubles its speed.
 */
const SLOWEST_TOLD = 0.1;

/**
 * The shortest time a speed is told over: a frame. Wheels closer together
 * count as one, which evens out a screen that sends two or more a frame.
 */
const MEASURE_MS = 16;

/**
 * The longest. A scroll that coasts sends a wheel every frame; wheels further
 * apart than this are the notches of a mouse wheel, or a scroll that rested.
 * No speed is told across the gap, so notches never read as a new push.
 */
const STEADY_MS = 40;

export function createCoasting() {
  /** When the last wheel that began or ended a speed's span came, and how far the scroll has gone since. */
  let since = -Infinity;
  let gone = 0;
  /** The last speed, in px per ms. */
  let last = 0;
  /**
   * The slowest speed since the scroll began to slow. While it has only sped
   * up there is none, and nothing is a new push.
   */
  let slowest = Infinity;

  return {
    /**
     * Take the next wheel: `size` px along its longer axis, at `timeMs`. True:
     * with it the scroll sped up, a new push.
     */
    brokenBy: (size: number, timeMs: number): boolean => {
      const span = timeMs - since;
      if (span > STEADY_MS) {
        since = timeMs;
        gone = 0;
        return false;
      }
      gone += size;
      if (span < MEASURE_MS) return false;
      const speed = gone / span;
      since = timeMs;
      gone = 0;

      const pushed = speed > PUSH_GROWTH * Math.max(slowest, SLOWEST_TOLD);
      if (pushed) slowest = Infinity;
      else if (speed < last) slowest = Math.min(slowest, speed);
      last = speed;
      return pushed;
    },
    /** The scroll paused: the next wheel has nothing before it. */
    forget: (): void => {
      since = -Infinity;
      gone = 0;
      last = 0;
      slowest = Infinity;
    },
  };
}
