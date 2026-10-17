/**
 * A sheet: what a panel or a menu is on a phone. It slides up from the bottom
 * of the viewer, over the pages, in a layer over the whole viewer
 * (`viewer-layer.ts`); the viewer behind it dims, and a tap there closes it.
 * Its handle drags it taller or shorter, or down to close it, the dimming
 * fading as it goes, and a flick moves it a whole step (`sheet-rest.ts`).
 * It keeps clear of the home bar and the screen's rounded corners when the
 * viewer reaches the screen's edge.
 * A sheet takes focus when it opens, keeps Tab inside it, closes on Escape
 * and gives focus back to the button that opened it; a menu's sheet leaves
 * the keyboard to its menu. A sheet that holds a list closes when one of its
 * items is picked ({@link useCloseOnPick}).
 */
import { computeReleaseVelocity, observeOutsidePress } from '@embedpdf/web';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { safeAreaPaddingOf } from './screen-edges';
import { SHEET_TOP_CLEARANCE_PX, panelSheetHeightsOf, sheetRestOf } from './sheet-rest';
import { LAYER_CLASS, MODAL_SELECTOR, POPOVER, attachViewerLayer, holdFocus } from './viewer-layer';

/** A press that starts on one of these in the handle's row is the control's, not a drag. */
const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, [role="tab"], [contenteditable]:not([contenteditable="false"])';

/** The dimmed viewer behind a sheet or a dialog. */
export const SCRIM_CLASS = 'bg-black/30 transition-opacity duration-200 starting:opacity-0';

const NO_PICK = () => {};

const CloseOnPickContext = createContext<() => void>(NO_PICK);

/** Gives what's inside a sheet or an overlay the close it runs when one of its items is picked. */
export const CloseOnPickProvider = CloseOnPickContext.Provider;

/**
 * What a list's item runs when it's picked: it closes the sheet or the overlay the list is in,
 * so you see where it took you. It does nothing in a docked panel, or in one that isn't a list.
 */
export function useCloseOnPick(): () => void {
  return useContext(CloseOnPickContext);
}

/** Whether a press landed in another surface that holds focus, like a dialog opened over this one. */
const pressedInOtherModal = (event: PointerEvent, own: Element): boolean =>
  event
    .composedPath()
    .some((node) => node instanceof Element && node !== own && node.matches(MODAL_SELECTOR));

export interface SheetProps {
  /** Names the sheet for assistive technology. */
  readonly label: string;
  readonly onClose: () => void;
  /**
   * `'content'`: as tall as what's in it, like a menu. `'panel'`: opens at half the viewer's
   * height, and drags up to nearly all of it. Default `'content'`.
   */
  readonly size?: 'content' | 'panel';
  /** It holds a list: picking an item ({@link useCloseOnPick}) closes it. */
  readonly list?: boolean;
  /**
   * Whether it holds the keyboard (default true). A menu's sheet doesn't: its menu takes focus
   * and gives it back.
   */
  readonly trapFocus?: boolean;
  /** Drawn under the handle, above the part that scrolls; dragging it moves the sheet too. */
  readonly header?: ReactNode;
  /** The sheet's part name, for page CSS through `::part()`, when it is one: a panel's `panel`. */
  readonly part?: string;
  /** `data-*` attributes for the sheet, by their names without `data-`. */
  readonly data?: Readonly<Record<string, string>>;
  readonly children: ReactNode;
}

interface Drag {
  readonly pointerId: number;
  readonly startY: number;
  readonly startHeight: number;
  /** The heights it can rest at, ascending. */
  readonly heights: readonly number[];
  readonly samples: { t: number; x: number; y: number }[];
  height: number;
}

/** `data` as the `data-*` attributes it names. */
const dataAttributesOf = (data: Readonly<Record<string, string>> | undefined) =>
  Object.fromEntries(Object.entries(data ?? {}).map(([name, value]) => [`data-${name}`, value]));

/** How many pointer samples a drag keeps for its release speed. */
const DRAG_SAMPLES = 8;

export function Sheet({
  label,
  onClose,
  size = 'content',
  list = false,
  trapFocus = true,
  header,
  part,
  data,
  children,
}: SheetProps) {
  const layer = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  /** Which of its heights a panel's sheet rests at: the first (open) or a taller one. */
  const restIndex = useRef(0);
  const drag = useRef<Drag | null>(null);

  /** The heights it rests at now: a panel's from the viewer's height, a menu's as tall as it is. */
  const heightsNow = (): readonly number[] =>
    size === 'panel'
      ? panelSheetHeightsOf(layer.current?.offsetHeight ?? 0)
      : [sheet.current?.offsetHeight ?? 0];

  /**
   * Show the sheet dragged to `height` (its top that far above the viewer's bottom). Below its
   * lowest rest, the viewer behind it dims less the further down it goes.
   */
  const show = (height: number, heights: readonly number[]) => {
    const element = sheet.current;
    if (!element || heights.length === 0) return;
    const lowest = heights[0]!;
    const tallest = heights[heights.length - 1]!;
    if (size === 'panel') element.style.height = `${Math.min(tallest, Math.max(lowest, height))}px`;
    const below = Math.max(0, lowest - height);
    element.style.translate = below > 0 ? `0 ${below}px` : '';
    if (scrim.current) {
      scrim.current.style.opacity = below > 0 ? `${Math.max(0, 1 - below / lowest)}` : '';
    }
  };

  useLayoutEffect(() => {
    const layerElement = layer.current;
    const sheetElement = sheet.current;
    if (!layerElement || !sheetElement) return;
    const stopLayer = attachViewerLayer(layerElement, (edges) => {
      const padding = safeAreaPaddingOf(edges, ['right', 'bottom', 'left']);
      sheetElement.style.paddingLeft = padding.paddingLeft ?? '';
      sheetElement.style.paddingRight = padding.paddingRight ?? '';
      sheetElement.style.paddingBottom = padding.paddingBottom ?? '';
      sheetElement.style.maxHeight = `${Math.max(0, layerElement.offsetHeight - SHEET_TOP_CLEARANCE_PX)}px`;
      if (size === 'panel' && !drag.current) {
        const heights = panelSheetHeightsOf(layerElement.offsetHeight);
        show(heights[Math.min(restIndex.current, heights.length - 1)]!, heights);
      }
    });
    const held = trapFocus ? holdFocus(sheetElement, { onEscape: () => close.current() }) : null;
    // A press on the viewer above the sheet is the scrim's click; one outside the viewer closes it too.
    const stopOutside = observeOutsidePress(layerElement, (event) => {
      if (!pressedInOtherModal(event, sheetElement)) close.current();
    });
    return () => {
      stopOutside();
      held?.release();
      stopLayer();
    };
    // The sheet opens once; it closes by unmounting.
  }, []);

  const onGripDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as Element).closest(CONTROL_SELECTOR)) return;
    const element = sheet.current;
    if (!element) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startHeight = element.offsetHeight;
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      heights: heightsNow(),
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
      height: startHeight,
    };
    // The sheet and the dimming follow the finger, without easing.
    layer.current?.setAttribute('data-dragging', '');
  };

  const onGripMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.height = current.startHeight - (event.clientY - current.startY);
    current.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    if (current.samples.length > DRAG_SAMPLES) current.samples.shift();
    show(current.height, current.heights);
  };

  const onGripUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    layer.current?.removeAttribute('data-dragging');
    const cancelled = event.type === 'pointercancel';
    const velocity = cancelled
      ? 0
      : (computeReleaseVelocity(current.samples, event.timeStamp)?.vy ?? 0);
    const rest = cancelled
      ? current.heights[restIndex.current]!
      : sheetRestOf(current.heights, current.height, velocity);
    if (rest === null) {
      close.current();
      return;
    }
    restIndex.current = Math.max(0, current.heights.indexOf(rest));
    show(rest, current.heights);
  };

  return (
    <div
      ref={layer}
      {...POPOVER}
      data-epdf-layer=""
      className={`${LAYER_CLASS} p-0 open:flex open:flex-col open:justify-end`}
      style={{ position: 'fixed', inset: 'auto', maxWidth: 'none', maxHeight: 'none' }}
    >
      {/* Behind the whole viewer, not just above the sheet: the sheet sliding in or dragged down
          never uncovers it. */}
      <div
        ref={scrim}
        aria-hidden="true"
        className={`absolute inset-0 ${SCRIM_CLASS} in-data-dragging:transition-none`}
        onClick={() => close.current()}
      />
      <div
        ref={sheet}
        role={trapFocus ? 'dialog' : undefined}
        aria-modal={trapFocus ? true : undefined}
        aria-label={trapFocus ? label : undefined}
        part={part}
        {...dataAttributesOf(data)}
        data-epdf-sheet=""
        className="border-border-subtle bg-elevated starting:translate-y-full in-data-dragging:transition-none relative flex w-full shrink-0 flex-col rounded-t-2xl border-t shadow-2xl transition-[translate,height] duration-200 ease-out motion-reduce:transition-none"
      >
        <div
          className="shrink-0 touch-pan-x select-none"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
        >
          <div
            data-epdf-sheet-handle=""
            className="flex h-6 cursor-grab items-center justify-center active:cursor-grabbing"
          >
            <span className="bg-border-strong h-1 w-10 rounded-full" />
          </div>
          {header}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
          <CloseOnPickProvider value={list ? () => close.current() : NO_PICK}>
            {children}
          </CloseOnPickProvider>
        </div>
      </div>
    </div>
  );
}
