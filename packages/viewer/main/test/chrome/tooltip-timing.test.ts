/**
 * When a button's tooltip shows and goes: after the pointer rests on the button, at once while
 * another one shows or just went, at once on focus from the keyboard, never from a touch; a
 * press or Escape hides it until the pointer and focus have left; the pointer can cross onto the
 * tooltip; one shows at a time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TOOLTIP_DELAY_MS,
  TOOLTIP_LINGER_MS,
  TOOLTIP_WARM_MS,
  attachTooltipTiming,
  type TooltipCause,
  type TooltipTiming,
  type TooltipTrigger,
} from '../../../chrome/src/ui/tooltip-timing';

/** A button the timing can listen to: focus from the keyboard or not, open menu or not. */
class FakeButton extends EventTarget implements TooltipTrigger {
  keyboardFocus = true;
  attributes = new Map<string, string>();
  matches(selectors: string): boolean {
    return selectors === ':focus-visible' && this.keyboardFocus;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

const pointer = (type: string, pointerType = 'mouse') =>
  Object.assign(new Event(type), { pointerType });
const key = (name: string) => Object.assign(new Event('keydown'), { key: name });

/**
 * A button with its timing, and what the tooltip shows: the cause, or null while it's hidden.
 * `canShow` says whether it has something to say as it would show.
 */
function setUp(keys: EventTarget, canShow?: () => boolean) {
  const button = new FakeButton();
  const seen: { now: TooltipCause | null } = { now: null };
  const timing = attachTooltipTiming(
    button,
    { show: (cause) => (seen.now = cause), hide: () => (seen.now = null), canShow },
    keys,
  );
  return { button, seen, timing };
}

describe('attachTooltipTiming', () => {
  let keys: EventTarget;
  const attached: TooltipTiming[] = [];
  const button = (canShow?: () => boolean) => {
    const made = setUp(keys, canShow);
    attached.push(made.timing);
    return made;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    keys = new EventTarget();
  });

  afterEach(() => {
    for (const timing of attached.splice(0)) timing.detach();
    // Past the moment the next tooltip shows at once, so each test starts cold.
    vi.advanceTimersByTime(TOOLTIP_WARM_MS + 1);
    vi.useRealTimers();
  });

  it('shows after the pointer rests on the button, and goes soon after it leaves', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
    expect(seen.now).toBeNull();
    vi.advanceTimersByTime(1);
    expect(seen.now).toBe('pointer');

    zoom.dispatchEvent(pointer('pointerleave'));
    expect(seen.now).toBe('pointer');
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS);
    expect(seen.now).toBeNull();
  });

  it('shows nothing when the pointer only passes over the button', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS / 2);
    zoom.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(seen.now).toBeNull();
  });

  it('never shows for a touch', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(pointer('pointerenter', 'touch'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS * 2);
    expect(seen.now).toBeNull();
    // A tap's focus isn't the keyboard's.
    zoom.keyboardFocus = false;
    zoom.dispatchEvent(new Event('focus'));
    expect(seen.now).toBeNull();
  });

  it('shows at once on focus from the keyboard, and goes when focus leaves', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(new Event('focus'));
    expect(seen.now).toBe('focus');
    zoom.dispatchEvent(new Event('blur'));
    expect(seen.now).toBeNull();
  });

  it('becomes the pointer’s when the pointer comes onto a button shown for focus', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(new Event('focus'));
    zoom.dispatchEvent(pointer('pointerenter'));
    expect(seen.now).toBe('pointer');
    // Focus still holds it after the pointer leaves.
    zoom.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS * 2);
    expect(seen.now).toBe('pointer');
  });

  it('moves along a bar at once: the next tooltip shows without the wait', () => {
    const first = button();
    const second = button();
    first.button.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(first.seen.now).toBe('pointer');

    first.button.dispatchEvent(pointer('pointerleave'));
    second.button.dispatchEvent(pointer('pointerenter'));
    // One at a time.
    expect(second.seen.now).toBe('pointer');
    expect(first.seen.now).toBeNull();

    // Just after one went, the next shows at once too; later, it waits again.
    second.button.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS);
    expect(second.seen.now).toBeNull();
    first.button.dispatchEvent(pointer('pointerenter'));
    expect(first.seen.now).toBe('pointer');
    first.button.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS + TOOLTIP_WARM_MS);
    second.button.dispatchEvent(pointer('pointerenter'));
    expect(second.seen.now).toBeNull();
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(second.seen.now).toBe('pointer');
  });

  it('stays while the pointer crosses onto the tooltip, and goes once it leaves both', () => {
    const { button: zoom, seen, timing } = button();
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    zoom.dispatchEvent(pointer('pointerleave'));
    timing.enterTooltip();
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS * 3);
    expect(seen.now).toBe('pointer');
    timing.leaveTooltip();
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS);
    expect(seen.now).toBeNull();
  });

  it('hides on a press, and stays hidden until the pointer has left', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    zoom.dispatchEvent(pointer('pointerdown'));
    expect(seen.now).toBeNull();
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS * 2);
    expect(seen.now).toBeNull();

    zoom.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_WARM_MS);
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(seen.now).toBe('pointer');
  });

  it('hides on Escape, which goes on to whatever else it closes', () => {
    const { button: zoom, seen } = button();
    zoom.dispatchEvent(new Event('focus'));
    const escape = key('Escape');
    keys.dispatchEvent(escape);
    expect(seen.now).toBeNull();
    expect(escape.defaultPrevented).toBe(false);
    // Not again until focus has left and come back.
    zoom.dispatchEvent(new Event('focus'));
    expect(seen.now).toBeNull();
    zoom.dispatchEvent(new Event('blur'));
    zoom.dispatchEvent(new Event('focus'));
    expect(seen.now).toBe('focus');
    // Other keys leave it.
    keys.dispatchEvent(key('ArrowRight'));
    expect(seen.now).toBe('focus');
  });

  it('shows nothing for a button whose menu is open over it', () => {
    const { button: zoom, seen } = button();
    zoom.attributes.set('aria-expanded', 'true');
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    zoom.dispatchEvent(new Event('focus'));
    expect(seen.now).toBeNull();
  });

  it('shows nothing while it has nothing to say, as text that fits says nothing', () => {
    let cut = false;
    const { button: row, seen } = button(() => cut);
    row.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(seen.now).toBeNull();
    row.dispatchEvent(new Event('focus'));
    expect(seen.now).toBeNull();
    // Nothing showed, so the next one still waits.
    const other = button();
    other.button.dispatchEvent(pointer('pointerenter'));
    expect(other.seen.now).toBeNull();
    other.button.dispatchEvent(pointer('pointerleave'));

    row.dispatchEvent(new Event('blur'));
    row.dispatchEvent(pointer('pointerleave'));
    cut = true;
    row.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(seen.now).toBe('pointer');
  });

  it('hides and stops listening once detached', () => {
    const { button: zoom, seen, timing } = button();
    zoom.dispatchEvent(new Event('focus'));
    timing.detach();
    expect(seen.now).toBeNull();
    zoom.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    expect(seen.now).toBeNull();
  });
});
