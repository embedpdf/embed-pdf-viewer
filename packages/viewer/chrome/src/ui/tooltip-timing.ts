/**
 * When a button's tooltip shows and when it goes, from what happens to the button: the pointer
 * resting on it a moment (at once while another tooltip shows or just went, so moving along a
 * bar reads each button at once), focus from the keyboard (at once), never a touch. A press, an
 * Escape, or the pointer and focus leaving hide it; the pointer can move onto the tooltip without
 * it going. One tooltip shows at a time on the page. Structurally typed over DOM events, so the
 * rules run without a browser.
 */

/** Ms the pointer rests on a button before its tooltip shows. */
export const TOOLTIP_DELAY_MS = 500;

/** Ms after a tooltip goes during which the next one shows at once. */
export const TOOLTIP_WARM_MS = 300;

/** Ms a tooltip stays after the pointer leaves its button or itself, so the pointer can cross. */
export const TOOLTIP_LINGER_MS = 100;

/** What showed a tooltip: the pointer resting on its button, or focus from the keyboard. */
export type TooltipCause = 'pointer' | 'focus';

/** The button a tooltip is for, as far as its timing reads it. */
export interface TooltipTrigger extends EventTarget {
  matches(selectors: string): boolean;
  getAttribute(name: string): string | null;
}

export interface TooltipTimingHandlers {
  /** Show the tooltip, or say what holds it now: the pointer, or only the keyboard's focus. */
  show(cause: TooltipCause): void;
  hide(): void;
  /** Whether it has something to say right now, asked as it would show. Default: always. */
  canShow?(): boolean;
}

export interface TooltipTiming {
  /** The pointer is on the tooltip itself: it stays. */
  enterTooltip(): void;
  /** The pointer left the tooltip: it goes, unless the pointer is back on its button. */
  leaveTooltip(): void;
  /** Stop listening, and hide the tooltip. */
  detach(): void;
}

/** The tooltip showing now, of any button on the page. */
let showing: { hide(): void } | null = null;
/** When the last tooltip went. */
let wentAt = Number.NEGATIVE_INFINITY;

const isTouch = (event: Event): boolean => (event as PointerEvent).pointerType === 'touch';

/**
 * Show and hide `trigger`'s tooltip through `handlers`. `keys` is where Escape is heard (the
 * window). Returns the tooltip's own pointer hooks and the stop.
 */
export function attachTooltipTiming(
  trigger: TooltipTrigger,
  handlers: TooltipTimingHandlers,
  keys: EventTarget,
): TooltipTiming {
  let cause: TooltipCause | null = null;
  let onButton = false;
  let onTooltip = false;
  let focused = false;
  /** Pressed or dismissed: no tooltip until the pointer and focus have both left. */
  let quiet = false;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const self = { hide: () => hide() };

  const clearTimers = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  };
  // A button whose menu is open has the menu over it.
  const expanded = () => trigger.getAttribute('aria-expanded') === 'true';
  const warm = () => showing !== null || Date.now() - wentAt < TOOLTIP_WARM_MS;

  const show = (next: TooltipCause) => {
    clearTimers();
    // Shown for the pointer, it stays the pointer's: the keyboard adds nothing.
    if (cause === next || cause === 'pointer') return;
    if (cause === null) {
      if (handlers.canShow && !handlers.canShow()) return;
      if (showing !== self) showing?.hide();
      showing = self;
      keys.addEventListener('keydown', onKeyDown, true);
    }
    cause = next;
    handlers.show(next);
  };
  const hide = () => {
    clearTimers();
    if (cause === null) return;
    cause = null;
    if (showing === self) showing = null;
    wentAt = Date.now();
    keys.removeEventListener('keydown', onKeyDown, true);
    handlers.hide();
  };
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, TOOLTIP_LINGER_MS);
  };

  const onPointerEnter = (event: Event) => {
    if (isTouch(event)) return;
    onButton = true;
    clearTimeout(hideTimer);
    if (quiet || expanded()) return;
    if (cause !== null || warm()) show('pointer');
    else showTimer = setTimeout(() => show('pointer'), TOOLTIP_DELAY_MS);
  };
  const onPointerLeave = (event: Event) => {
    if (isTouch(event)) return;
    onButton = false;
    clearTimeout(showTimer);
    if (focused) return;
    quiet = false;
    if (cause !== null && !onTooltip) hideSoon();
  };
  const onFocus = () => {
    // Focus from a press or a touch isn't the keyboard's.
    if (!trigger.matches(':focus-visible')) return;
    focused = true;
    if (!quiet && !expanded()) show('focus');
  };
  const onBlur = () => {
    focused = false;
    if (onButton || onTooltip) return;
    quiet = false;
    hide();
  };
  const onPress = () => {
    quiet = true;
    hide();
  };
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    // Escape goes on to whatever else it closes.
    quiet = true;
    hide();
  };

  trigger.addEventListener('pointerenter', onPointerEnter);
  trigger.addEventListener('pointerleave', onPointerLeave);
  trigger.addEventListener('focus', onFocus);
  trigger.addEventListener('blur', onBlur);
  trigger.addEventListener('pointerdown', onPress);

  return {
    enterTooltip() {
      onTooltip = true;
      clearTimeout(hideTimer);
    },
    leaveTooltip() {
      onTooltip = false;
      if (!onButton && !focused) hideSoon();
    },
    detach() {
      trigger.removeEventListener('pointerenter', onPointerEnter);
      trigger.removeEventListener('pointerleave', onPointerLeave);
      trigger.removeEventListener('focus', onFocus);
      trigger.removeEventListener('blur', onBlur);
      trigger.removeEventListener('pointerdown', onPress);
      hide();
    },
  };
}
