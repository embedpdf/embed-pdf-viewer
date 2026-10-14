/**
 * Your own components in the viewer: `ToolbarItem`, `Panel` and `Region` put
 * your component in the place the viewer makes for it (`item:<id>`,
 * `panel:<id>`, or a region's name). It renders as a child of the
 * `<embedpdf-viewer>` element, so it stays in your React tree, with your
 * context, your state and your CSS; the browser shows it in that place.
 *
 * `useToolbarItem()` tells a component inside a `ToolbarItem` where it sits.
 * The viewer keeps that on the item's element as `data-orientation`,
 * `data-edge`, `data-variant` and `data-size`; `ToolbarItem` reads them, live,
 * into a context for the hook, and redraws before the browser lays the bar out
 * (an external store's change renders at once), so the toolbar measures your
 * component in the variant it picked. Types only from the viewer, as in
 * `./component`: this module is shared by both doors.
 */
import type { ToolbarItemContext, ToolbarItemEdge, ViewerSize } from '@embedpdf/viewer/core';
import {
  createContext,
  createElement,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';

/** The element around what you put in a place adds no box: your component lays out there. */
const CONTENTS = { display: 'contents' } as const;

// ── a toolbar item ───────────────────────────────────────────────────────────

const EDGES: readonly ToolbarItemEdge[] = ['top', 'bottom', 'start', 'end', 'float', 'selection'];
const SIZES: readonly ViewerSize[] = ['compact', 'medium', 'expanded'];

/** Before the viewer says where the item is: the main bar's place. */
const AT_THE_TOP: ToolbarItemContext = {
  orientation: 'horizontal',
  edge: 'top',
  variant: null,
  size: 'expanded',
};

const ATTRIBUTES = ['data-orientation', 'data-edge', 'data-variant', 'data-size'];

/** Where the item whose element is `element` sits, as the viewer wrote it there. */
function toolbarItemContextOf(element: Element): ToolbarItemContext {
  const edge = element.getAttribute('data-edge') as ToolbarItemEdge | null;
  const size = element.getAttribute('data-size') as ViewerSize | null;
  return {
    orientation:
      element.getAttribute('data-orientation') === 'vertical' ? 'vertical' : 'horizontal',
    edge: edge && EDGES.includes(edge) ? edge : AT_THE_TOP.edge,
    variant: element.getAttribute('data-variant'),
    size: size && SIZES.includes(size) ? size : AT_THE_TOP.size,
  };
}

const sameContext = (left: ToolbarItemContext, right: ToolbarItemContext): boolean =>
  left.orientation === right.orientation &&
  left.edge === right.edge &&
  left.variant === right.variant &&
  left.size === right.size;

const ToolbarItemCtx = createContext<ToolbarItemContext | null>(null);

export interface ToolbarItemProps {
  /** The item's id: `{ custom: id }` in the layout. */
  id: string;
  children?: ReactNode;
}

/** What the viewer says on the element `element` holds, as a store: the same object until it changes. */
function contextStoreOf(element: RefObject<Element | null>) {
  let current = AT_THE_TOP;
  return {
    subscribe(onChange: () => void): () => void {
      const target = element.current;
      if (!target) return () => {};
      const observer = new MutationObserver(onChange);
      observer.observe(target, { attributes: true, attributeFilter: ATTRIBUTES });
      return () => observer.disconnect();
    },
    read(): ToolbarItemContext {
      const target = element.current;
      const next = target ? toolbarItemContextOf(target) : current;
      if (!sameContext(current, next)) current = next;
      return current;
    },
  };
}

const atTheTop = () => AT_THE_TOP;

/** Your component in the toolbar, where the layout's `{ custom: id }` makes room for it. */
export function ToolbarItem({ id, children }: ToolbarItemProps) {
  const element = useRef<HTMLDivElement | null>(null);
  const [store] = useState(() => contextStoreOf(element));
  const context = useSyncExternalStore(store.subscribe, store.read, atTheTop);
  return createElement(
    ToolbarItemCtx.Provider,
    { value: context },
    createElement('div', { ref: element, slot: `item:${id}`, style: CONTENTS }, children),
  );
}

/**
 * Where the toolbar item this component is in sits: which way its bar runs (`orientation`), the
 * bar's place (`edge`), which of the item's `variants` the toolbar picked (`variant`), and the
 * viewer's size (`size`). Works inside a `ToolbarItem`.
 */
export function useToolbarItem(): ToolbarItemContext {
  const context = useContext(ToolbarItemCtx);
  if (!context) {
    throw new Error(
      '[embedpdf] useToolbarItem() works inside a <ToolbarItem>: it says where that item sits.',
    );
  }
  return context;
}

// ── a panel, a region ────────────────────────────────────────────────────────

export interface PanelProps {
  /** The panel's id, as `addPanel(id, …)` names it in the layout. */
  id: string;
  children?: ReactNode;
}

/** What goes inside a panel: the viewer draws its frame, header and the way it opens. */
export function Panel({ id, children }: PanelProps) {
  return createElement('div', { slot: `panel:${id}`, style: CONTENTS }, children);
}

/**
 * A place around the viewer for your own components: `header` above everything, `footer` below
 * everything, `tabs` in place of the document tabs, `empty` over the pages while no document is
 * open.
 */
export type RegionName = 'header' | 'footer' | 'tabs' | 'empty';

export interface RegionProps {
  name: RegionName;
  children?: ReactNode;
}

/** Your component in one of the viewer's regions. */
export function Region({ name, children }: RegionProps) {
  return createElement('div', { slot: name, style: CONTENTS }, children);
}
