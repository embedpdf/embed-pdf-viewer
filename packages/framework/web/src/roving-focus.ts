/**
 * One tab stop for a row of controls, and arrow keys along it (the ARIA
 * roving tabindex, as toolbars and tab lists use it): Tab enters the row at
 * the control that had focus last, else its first, and the arrows, Home and
 * End move between its controls. The arrows follow the row's orientation, Left and Right swap in
 * right-to-left text, a control that can't be used now is passed over, and a
 * control that uses an arrow key itself (a text field, a select) keeps it.
 */
import { isUnavailable, usesKey } from './focusable';
import type { Orientation } from './orientation';
import { directionOf } from './orientation';

/** Where a key moves focus in a row. */
export type RovingMove = 'next' | 'previous' | 'first' | 'last';

/** The move `key` asks for in a row running `orientation`, or null for a key the row leaves alone. */
export function rovingMoveOf(
  key: string,
  orientation: Orientation,
  direction: 'ltr' | 'rtl',
): RovingMove | null {
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (orientation === 'vertical') {
    if (key === 'ArrowDown') return 'next';
    if (key === 'ArrowUp') return 'previous';
    return null;
  }
  const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return 'next';
  if (key === backward) return 'previous';
  return null;
}

/**
 * The index `move` lands on among `count` stops, from `current` (-1 for
 * none), passing over the stops `available` rejects. With `loop`, next and
 * previous wrap around the ends; without it they stop there. -1 when there is
 * nowhere to go.
 */
export function rovingTargetOf(
  move: RovingMove,
  current: number,
  count: number,
  available: (index: number) => boolean,
  loop: boolean,
): number {
  if (move === 'first' || move === 'last') {
    const step = move === 'first' ? 1 : -1;
    for (let i = move === 'first' ? 0 : count - 1; i >= 0 && i < count; i += step) {
      if (available(i)) return i;
    }
    return -1;
  }
  const step = move === 'next' ? 1 : -1;
  for (let taken = 1; taken <= count; taken += 1) {
    let index = current + step * taken;
    if (index < 0 || index >= count) {
      if (!loop) return -1;
      index = ((index % count) + count) % count;
    }
    if (index === current) return -1;
    if (available(index)) return index;
  }
  return -1;
}

export interface RovingFocusOptions {
  /** Which arrows move: Left and Right for `'horizontal'`, Up and Down for `'vertical'`. */
  readonly orientation: Orientation;
  /** The stops, in order; read again on every key and every {@link RovingFocus.refresh}. */
  readonly stops: () => readonly HTMLElement[];
  /** The writing direction. Default: the container's computed `direction`, read on each key. */
  readonly direction?: () => 'ltr' | 'rtl';
  /** Whether next and previous wrap around at the ends. Default true. */
  readonly loop?: boolean;
}

/** A row's roving focus, from {@link attachRovingFocus}. */
export interface RovingFocus {
  /**
   * Put the one tab stop back after the stops changed: on the stop that had
   * focus last while it's still there and usable, else on the first usable
   * one. Call it after every render that can add, remove or disable a stop.
   */
  refresh(): void;
  /** Stop handling keys and focus. The stops keep their `tabIndex`. */
  detach(): void;
}

/**
 * Make the stops of `container` one tab stop with arrow keys between them.
 * Keys count only while a stop itself has focus, so keys inside a menu or
 * another control the row holds are theirs; a key with Alt, Control, Meta or
 * Shift, or one a handler already took (`defaultPrevented`), is left alone.
 */
export function attachRovingFocus(
  container: HTMLElement,
  options: RovingFocusOptions,
): RovingFocus {
  const direction = options.direction ?? (() => directionOf(container));
  const loop = options.loop ?? true;
  /**
   * The stop that had focus last. Until one has, the tab stop follows the
   * first usable stop, wherever the row's first render put it.
   */
  let used: HTMLElement | null = null;

  const giveTabStop = (stops: readonly HTMLElement[]) => {
    const keep = used !== null && stops.includes(used) && !isUnavailable(used);
    const tabStop = keep ? used : (stops.find((stop) => !isUnavailable(stop)) ?? null);
    for (const stop of stops) {
      const tabIndex = stop === tabStop ? 0 : -1;
      if (stop.tabIndex !== tabIndex) stop.tabIndex = tabIndex;
    }
  };

  const refresh = () => giveTabStop(options.stops());

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const stops = options.stops();
    const target = event.target as HTMLElement;
    const from = stops.indexOf(target);
    if (from < 0 || usesKey(target, event.key)) return;
    const move = rovingMoveOf(event.key, options.orientation, direction());
    if (!move) return;
    const to = rovingTargetOf(
      move,
      from,
      stops.length,
      (index) => !isUnavailable(stops[index]!),
      loop,
    );
    if (to < 0) return;
    event.preventDefault();
    const next = stops[to]!;
    used = next;
    giveTabStop(stops);
    next.focus();
  };

  // Focus that reaches a stop any other way (a click, Tab, a script) makes it the row's tab stop.
  const onFocusIn = (event: FocusEvent) => {
    const stops = options.stops();
    const target = event.target as HTMLElement;
    if (!stops.includes(target)) return;
    used = target;
    giveTabStop(stops);
  };

  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('focusin', onFocusIn);
  refresh();
  return {
    refresh,
    detach() {
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('focusin', onFocusIn);
    },
  };
}
