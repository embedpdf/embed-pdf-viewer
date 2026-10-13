/**
 * Where a toolbar item sits, as the viewer tells it. The viewer keeps that on the item's element as
 * `data-orientation`, `data-edge`, `data-variant` and `data-size`; `ToolbarItem` reads them, live,
 * into a reactive object for `useToolbarItem()`. A change reaches your component in the microtasks
 * after the viewer writes it, before the browser lays the bar out, so the toolbar measures your
 * component in the variant it picked.
 */
// Types only from the viewer: this module is shared by both doors.
import type { ToolbarItemContext, ToolbarItemEdge, ViewerSize } from '@embedpdf/viewer/core';
import { getContext, hasContext, setContext } from 'svelte';

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

/** An item's context as a reactive object: each field reads the latest the viewer wrote. */
export class ToolbarItemPlace implements ToolbarItemContext {
  #current = $state.raw<ToolbarItemContext>(AT_THE_TOP);

  get orientation(): ToolbarItemContext['orientation'] {
    return this.#current.orientation;
  }
  get edge(): ToolbarItemEdge {
    return this.#current.edge;
  }
  get variant(): string | null {
    return this.#current.variant;
  }
  get size(): ViewerSize {
    return this.#current.size;
  }

  /** Read what the viewer says on `element`, now and whenever it writes it. Returns the stop. */
  follow(element: Element): () => void {
    const read = () => {
      const next = toolbarItemContextOf(element);
      if (!sameContext(this.#current, next)) this.#current = next;
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { attributes: true, attributeFilter: ATTRIBUTES });
    return () => observer.disconnect();
  }
}

const TOOLBAR_ITEM = Symbol('embedpdf.toolbar-item');

/** For `ToolbarItem`: the context of the item it makes, for the components inside it. */
export function provideToolbarItem(): ToolbarItemPlace {
  const place = new ToolbarItemPlace();
  setContext(TOOLBAR_ITEM, place);
  return place;
}

/**
 * Where the toolbar item this component is in sits, as a reactive object: which way its bar runs
 * (`orientation`), the bar's place (`edge`), which of the item's `variants` the toolbar picked
 * (`variant`), and the viewer's size (`size`). Read the fields where you use them
 * (`item.orientation`), so they stay live. Works inside a `ToolbarItem`.
 */
export function useToolbarItem(): ToolbarItemContext {
  if (!hasContext(TOOLBAR_ITEM)) {
    throw new Error(
      '[embedpdf] useToolbarItem() works inside a <ToolbarItem>: it says where that item sits.',
    );
  }
  return getContext<ToolbarItemPlace>(TOOLBAR_ITEM);
}
