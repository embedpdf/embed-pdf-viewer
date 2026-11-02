/**
 * The viewer's own tooltips: what a button does, its shortcut the way the platform writes it,
 * and why it can't run when it can't, in the theme's font and its `tooltip` colors. When one
 * shows and goes is `tooltip-timing.ts`. It opens in the browser's top layer, like the menus, so
 * nothing clips it: on the side the button's menu would open, or beside a menu's row, flipped
 * when there's no room. It's a `role="tooltip"` element beside its button, which names it in
 * `aria-describedby` while it shows, for what the button's name doesn't say already: its
 * shortcut and its reason. Text cut short on screen (a long row's) shows whole in one, the same
 * way, and only while it's cut short.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefCallback,
} from 'react';
import { directionOf, observeClientGeometry, type AnchoredPlacement } from '@embedpdf/web';

import { useBarEdge } from './bar-edge';
import { tooltipPlacementOf } from './menu-placement';
import { boxOf, placeInWindow, selectionBarSideOf } from './top-layer';
import { attachTooltipTiming, type TooltipCause, type TooltipTiming } from './tooltip-timing';
import { POPOVER } from './viewer-layer';

/** What a tooltip says. */
export interface TooltipContent {
  /** What the button does: its name. */
  readonly label: string;
  /** Its shortcut, the way the platform writes it (`formatShortcut`). */
  readonly shortcut?: string | null;
  /** Why it can't run, when it can't. */
  readonly reason?: string | null;
  /** The button shows its label already: it has a tooltip only when there's more to say. */
  readonly labelShown?: boolean;
}

export interface TooltipOptions {
  /** The button is a row in a menu: its tooltip opens beside it. */
  readonly inMenu?: boolean;
  /**
   * The label is on screen already, in the element this returns (the trigger itself, or one in
   * it): the tooltip shows it whole, and only while that element cuts it short.
   */
  readonly clipped?: (trigger: HTMLElement) => Element | null;
}

/** A button's tooltip: what goes on the button, and the tooltip to draw beside it. */
export interface Tooltip {
  /** Spread on the button. */
  readonly trigger: {
    readonly ref: RefCallback<HTMLElement>;
    readonly 'aria-describedby'?: string;
  };
  /** The tooltip while it shows, else nothing: draw it right after the button. */
  readonly element: ReactNode;
}

/** Px between a tooltip and its button, and between a tooltip and the window's edges. */
const TOOLTIP_GAP_PX = 6;

/** A copy no one sees: the toolbar's hidden measurement layer draws every button twice. */
const HIDDEN_COPY_SELECTOR = '[inert], [aria-hidden="true"]';

const TOOLTIP_CLASS =
  'bg-tooltip text-tooltip-fg m-0 max-w-64 overflow-visible rounded-sm border border-transparent px-2 py-1 text-start text-xs font-normal leading-4 tracking-normal normal-case whitespace-normal shadow-md transition-opacity duration-100 starting:opacity-0 motion-reduce:transition-none';

/** Whether `content` has something to say that the button doesn't show. */
const saysMore = (content: TooltipContent): boolean =>
  content.label !== '' &&
  (!content.labelShown || Boolean(content.shortcut) || Boolean(content.reason));

/** Whether `element` cuts its text short: it's wider (or taller) than the room it has. */
const isClipped = (element: Element | null): boolean =>
  element !== null &&
  (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight);

/**
 * The tooltip of a button: spread `trigger` on the button and draw `element` right after it.
 * `null` content, or a label the button shows with nothing more to say, has none.
 */
export function useTooltip(content: TooltipContent | null, options: TooltipOptions = {}): Tooltip {
  const [button, setButton] = useState<HTMLElement | null>(null);
  const [cause, setCause] = useState<TooltipCause | null>(null);
  const timing = useRef<TooltipTiming | null>(null);
  const edge = useBarEdge();
  const id = useId();
  // A label shown on screen says something only while it's cut short.
  const onlyClipped = options.clipped !== undefined && content !== null && !saysMore(content);
  const has = content !== null && (saysMore(content) || (onlyClipped && content.label !== ''));
  const clipped = useRef(options.clipped);
  clipped.current = options.clipped;

  useLayoutEffect(() => {
    if (!button || !has || button.closest(HIDDEN_COPY_SELECTOR)) return;
    const keys = button.ownerDocument.defaultView ?? button.ownerDocument;
    const attached = attachTooltipTiming(
      button,
      {
        show: setCause,
        hide: () => setCause(null),
        canShow: onlyClipped ? () => isClipped(clipped.current?.(button) ?? null) : undefined,
      },
      keys,
    );
    timing.current = attached;
    return () => {
      timing.current = null;
      attached.detach();
    };
  }, [button, has, onlyClipped]);

  const shown = has && content !== null && cause !== null && button !== null;
  // The words that are the button's name already are left out of its description.
  const named =
    shown &&
    (content.labelShown === true ||
      options.clipped !== undefined ||
      button.getAttribute('aria-label') === content.label);
  const describes = shown && (!named || Boolean(content.shortcut) || Boolean(content.reason));
  return {
    trigger: { ref: setButton, 'aria-describedby': describes ? id : undefined },
    element: shown ? (
      <TooltipSurface
        id={id}
        button={button}
        content={content}
        named={named}
        interactive={cause === 'pointer'}
        placement={() =>
          tooltipPlacementOf(
            edge,
            directionOf(button),
            options.inMenu === true,
            edge === 'selection' ? selectionBarSideOf(button) : undefined,
          )
        }
        timing={timing}
      />
    ) : null,
  };
}

/**
 * A button with its tooltip, for a button drawn only sometimes: `children` draws the button with
 * `trigger` spread on it, and the tooltip goes right after it.
 */
export function WithTooltip({
  content,
  options,
  children,
}: {
  content: TooltipContent | null;
  options?: TooltipOptions;
  children: (trigger: Tooltip['trigger']) => ReactNode;
}) {
  const tooltip = useTooltip(content, options);
  return (
    <>
      {children(tooltip.trigger)}
      {tooltip.element}
    </>
  );
}

/**
 * A `<button>` with the viewer's tooltip in place of the browser's `title`: `label` is its
 * tooltip, and its name (`aria-label`) unless it has a name of its own.
 */
export function TooltipButton({
  label,
  reason,
  inMenu,
  ...button
}: Omit<ComponentProps<'button'>, 'title' | 'ref'> & {
  label: string;
  /** Why it can't run, when it can't. */
  reason?: string | null;
  /** It's a row in a menu: its tooltip opens beside it. */
  inMenu?: boolean;
}) {
  const tooltip = useTooltip({ label, reason }, { inMenu });
  return (
    <>
      <button type="button" aria-label={label} {...button} {...tooltip.trigger} />
      {tooltip.element}
    </>
  );
}

function TooltipSurface({
  id,
  button,
  content,
  named,
  interactive,
  placement,
  timing,
}: {
  id: string;
  button: HTMLElement;
  content: TooltipContent;
  named: boolean;
  /** Shown for the pointer, the pointer can move onto it; shown for focus, presses go through. */
  interactive: boolean;
  placement: () => AnchoredPlacement;
  timing: { readonly current: TooltipTiming | null };
}) {
  const surface = useRef<HTMLDivElement>(null);
  const placementOf = useRef(placement);
  placementOf.current = placement;

  useLayoutEffect(() => {
    const tooltip = surface.current;
    if (!tooltip) return;
    if (typeof tooltip.showPopover === 'function') tooltip.showPopover();
    const place = () =>
      placeInWindow(tooltip, boxOf(button), placementOf.current(), TOOLTIP_GAP_PX);
    place();
    // Its words change (a reason that comes or goes), or the button moves.
    const resizes = new ResizeObserver(place);
    resizes.observe(tooltip);
    resizes.observe(button);
    const stopGeometry = observeClientGeometry(place);
    return () => {
      stopGeometry();
      resizes.disconnect();
      if (typeof tooltip.hidePopover === 'function' && tooltip.matches(':popover-open')) {
        tooltip.hidePopover();
      }
    };
  }, [button]);

  return (
    <div
      ref={surface}
      {...POPOVER}
      id={id}
      role="tooltip"
      part="tooltip"
      className={`${TOOLTIP_CLASS} ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ position: 'fixed', right: 'auto', bottom: 'auto', fontFamily: 'var(--epdf-font)' }}
      onPointerEnter={() => timing.current?.enterTooltip()}
      onPointerLeave={() => timing.current?.leaveTooltip()}
    >
      <span className="flex items-baseline gap-2">
        <span aria-hidden={named || undefined}>{content.label}</span>{' '}
        {content.shortcut && (
          // In the tooltip's font, and `↩` as a symbol, not a color emoji.
          <kbd className="opacity-75 [font-variant-emoji:text]" style={{ fontFamily: 'inherit' }}>
            {content.shortcut}
          </kbd>
        )}
      </span>{' '}
      {content.reason && <span className="mt-0.5 block opacity-80">{content.reason}</span>}
    </div>
  );
}
