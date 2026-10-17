/**
 * The frame every panel opens in: its header (the title, or what the panel
 * puts there, and a close button) and one of three ways to open, the panel's
 * `present` for the viewer's size, or else the default for it
 * (`panel-layout.ts`):
 *
 * - dock: beside the pages, which make room for it. Its inner edge drags it
 *   wider or narrower, by pointer or with the arrow keys on the edge, within
 *   the panel's `width` limits, unless it isn't `resizable`. The viewer
 *   remembers that width per panel while it runs, and tells the app
 *   (`onPanelResize`). It is part of the page: Tab reaches it in order, and
 *   it never takes focus.
 * - overlay: over the edge of the pages, which stay where they are and dim.
 *   A click on them closes it; the bars around the pages keep working.
 * - sheet: up from the bottom of the viewer, over everything (`sheet.tsx`).
 *
 * An overlay or a sheet takes focus when it opens, closes on Escape and gives
 * focus back to the button that opened it. A sheet keeps Tab inside it; from
 * an overlay Tab moves on to the rest of the viewer. A panel that holds a
 * list closes from either when one of its items is picked
 * ({@link useCloseOnPick}). The frame is named after its title for assistive
 * technology: a region when docked, a dialog otherwise (modal as a sheet).
 */
import type { PanelPresentation, PanelPresentationBySize, PanelWidth } from '@embedpdf/core-ui';
import { useT } from '@embedpdf/react/i18n';
import { useKernel } from '@embedpdf/react/runtime';
import {
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { useLayoutEnv, usePanelResize } from '../config-context';
import { Icon } from './icons';
import {
  clampPanelWidth,
  maxPanelWidthOf,
  overlayWidthOf,
  panelWidthsOf,
  presentationOf,
  widthAfterDrag,
  widthAfterKey,
  type PanelEdge as PanelEdgeOf,
  type PanelSide,
  type PanelWidths,
} from './panel-layout';
import { CloseOnPickProvider, SCRIM_CLASS, Sheet, useCloseOnPick } from './sheet';
import { holdFocus } from './viewer-layer';

export { useCloseOnPick };

export interface PanelFrameProps {
  /** The panel's id: the frame's `data-epdf-panel`, and what its dragged width is kept under. */
  readonly id: string;
  readonly side: PanelSide;
  /** How it opens, at every size or per size. Default: dock, overlay, or sheet on a phone. */
  readonly present?: PanelPresentation | PanelPresentationBySize;
  /** Its width in px, or where it starts and how far it drags. Default 288, from 200 to 640. */
  readonly width?: number | PanelWidth;
  /** Whether its edge drags. Default true. */
  readonly resizable?: boolean;
  /** Its title: in its header, and the name assistive technology gives the frame. */
  readonly title: string;
  readonly onClose: () => void;
  /** Drawn in the header in place of the title: the switcher between the panels on its side. */
  readonly header?: ReactNode;
  /** It holds a list: in a sheet or an overlay, picking an item closes it ({@link useCloseOnPick}). */
  readonly list?: boolean;
  readonly children: ReactNode;
}

export function PanelFrame(props: PanelFrameProps) {
  const { size } = useLayoutEnv();
  const present = presentationOf(size, props.present);
  if (present === 'sheet') return <SheetPanel {...props} />;
  if (present === 'overlay') return <OverlayPanel {...props} />;
  return <DockedPanel {...props} />;
}

// ── the header ───────────────────────────────────────────────────────────────

function PanelHeader({
  title,
  header,
  onClose,
}: {
  title: string;
  header: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      part="panel-header"
      data-epdf-panel-header=""
      className="border-border-subtle flex min-h-11 shrink-0 items-center gap-2 border-b px-3 py-1.5"
    >
      <div className="flex min-w-0 flex-1 items-center">
        {header ?? <h2 className="text-fg truncate text-sm font-semibold">{title}</h2>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('panel.close')}
        title={t('panel.close')}
        className="text-fg-muted hover:bg-hover grid h-7 w-7 shrink-0 place-items-center rounded-md"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

// ── widths ───────────────────────────────────────────────────────────────────

/** The width each panel was dragged to, per viewer (its kernel), for as long as the viewer runs. */
const draggedWidths = new WeakMap<object, Map<string, number>>();

function draggedWidthsOf(kernel: object): Map<string, number> {
  let widths = draggedWidths.get(kernel);
  if (!widths) {
    widths = new Map();
    draggedWidths.set(kernel, widths);
  }
  return widths;
}

/**
 * The panel's width: the one it was dragged to in this viewer, else where its layout says it
 * starts. Returns it unclamped, and the setter that remembers a new one.
 */
function usePanelWidth(id: string, widths: PanelWidths): [number, (width: number) => void] {
  const dragged = draggedWidthsOf(useKernel());
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const width = dragged.get(id) ?? widths.initial;
  const setWidth = (next: number) => {
    if (dragged.get(id) === next) return;
    dragged.set(id, next);
    rerender();
  };
  return [width, setWidth];
}

// ── dock ─────────────────────────────────────────────────────────────────────

function DockedPanel({
  id,
  side,
  width,
  resizable = true,
  title,
  onClose,
  header,
  children,
}: PanelFrameProps) {
  const env = useLayoutEnv();
  const regionId = useId();
  const widths = panelWidthsOf(width);
  const [wanted, setWidth] = usePanelWidth(id, widths);
  const shown = clampPanelWidth(wanted, env.width, widths);
  const resized = usePanelResize();
  const edge: PanelEdgeOf = { side, dir: env.dir, viewerWidth: env.width, widths };
  // Above the dimmed pages of an overlay on the other side (z-30): only the pages dim.
  return (
    <section
      id={regionId}
      role="region"
      aria-label={title}
      part="panel"
      data-epdf-panel={id}
      data-present="dock"
      className={`bg-surface border-border-subtle relative z-[35] flex shrink-0 flex-col ${
        side === 'start' ? 'border-e' : 'border-s'
      }`}
      style={{ width: shown }}
    >
      <PanelHeader title={title} header={header} onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {resizable && (
        <PanelEdge
          regionId={regionId}
          edge={edge}
          title={title}
          width={shown}
          onWidth={setWidth}
          onResized={(next) => resized({ id, width: next })}
        />
      )}
    </section>
  );
}

/**
 * A docked panel's inner edge: a separator that drags the panel wider or narrower, and takes
 * the arrow keys (Home and End for the narrowest and the widest) when it has focus. `onWidth`
 * follows every move; `onResized` hears the width the user gave it, once a drag ends and on
 * each key that changes it.
 */
function PanelEdge({
  regionId,
  edge,
  title,
  width,
  onWidth,
  onResized,
}: {
  regionId: string;
  edge: PanelEdgeOf;
  title: string;
  width: number;
  onWidth: (width: number) => void;
  onResized: (width: number) => void;
}) {
  const t = useT();
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    width: number;
  } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // No text selection starts under the drag.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      width,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.width = widthAfterDrag(current.startWidth, event.clientX - current.startX, edge);
    onWidth(current.width);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.width !== current.startWidth) onResized(current.width);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-controls={regionId}
      aria-label={t('panel.resize', { params: { title } })}
      aria-valuenow={width}
      aria-valuemin={edge.widths.min}
      aria-valuemax={maxPanelWidthOf(edge.viewerWidth, edge.widths)}
      tabIndex={0}
      data-epdf-panel-edge=""
      className={`focus-visible:bg-accent/40 hover:bg-accent/20 absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none transition-colors ${
        edge.side === 'start' ? '-end-1' : '-start-1'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => {
        const next = widthAfterKey(width, event.key, event.shiftKey, edge);
        if (next === null) return;
        event.preventDefault();
        if (next === width) return;
        onWidth(next);
        onResized(next);
      }}
    />
  );
}

// ── overlay ──────────────────────────────────────────────────────────────────

/** Where an overlay comes in from: its own side, in either direction. */
const OVERLAY_ENTRY: Record<PanelSide, string> = {
  start: 'start-0 border-e starting:-translate-x-full rtl:starting:translate-x-full',
  end: 'end-0 border-s starting:translate-x-full rtl:starting:-translate-x-full',
};

function OverlayPanel({
  id,
  side,
  width,
  title,
  onClose,
  header,
  list,
  children,
}: PanelFrameProps) {
  const env = useLayoutEnv();
  const widths = panelWidthsOf(width);
  const [wanted] = usePanelWidth(id, widths);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    // It takes focus, and Escape closes it; Tab moves on to the bars, which keep working.
    const held = holdFocus(element, { onEscape: () => close.current(), trap: false });
    return () => held.release();
    // The overlay opens once; it closes by unmounting.
  }, []);
  return (
    <>
      {/* over the pages only, under the overlay: a click on them closes it */}
      <div
        aria-hidden="true"
        data-epdf-scrim=""
        className={`absolute inset-0 z-30 ${SCRIM_CLASS}`}
        onClick={() => close.current()}
      />
      <section
        ref={panel}
        role="dialog"
        aria-label={title}
        part="panel"
        data-epdf-panel={id}
        data-present="overlay"
        className={`bg-surface border-border-subtle absolute inset-y-0 z-40 flex flex-col shadow-xl transition-[translate] duration-200 ease-out motion-reduce:transition-none ${OVERLAY_ENTRY[side]}`}
        style={{ width: overlayWidthOf(clampPanelWidth(wanted, env.width, widths), env.width) }}
      >
        <PanelHeader title={title} header={header} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col">
          <CloseOnPickProvider value={list ? () => close.current() : () => {}}>
            {children}
          </CloseOnPickProvider>
        </div>
      </section>
    </>
  );
}

// ── sheet ────────────────────────────────────────────────────────────────────

function SheetPanel({ id, title, onClose, header, list, children }: PanelFrameProps) {
  return (
    <Sheet
      label={title}
      onClose={onClose}
      size="panel"
      list={list}
      part="panel"
      data={{ 'epdf-panel': id, present: 'sheet' }}
      header={<PanelHeader title={title} header={header} onClose={onClose} />}
    >
      {children}
    </Sheet>
  );
}
