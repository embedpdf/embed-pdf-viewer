/**
 * The edge of the bar each slotted toolbar item is in, by the element slotted
 * there, for the viewer's own components inside it: they're drawn apart from
 * the bar (`placed-components.tsx`), and a menu among them opens away from
 * the bar's edge like the bar's own. The item sockets write it
 * (`item-socket.tsx`); outside any item, a component opens its menus like the
 * main bar's.
 */
import { createContext, useContext } from 'react';

import type { BarEdge } from './bar-edge';

export interface SlottedEdges {
  /** Says `element` is slotted into an item of a bar on `edge`. */
  set(element: Element, edge: BarEdge): void;
  /** The edge of the item `element` is in: its own, or its nearest ancestor's; else `'top'`. */
  edgeOf(element: Element): BarEdge;
  /** Calls `listener` when an edge changes. */
  subscribe(listener: () => void): () => void;
  /** A number that changes with every edge that changes. */
  version(): number;
}

/** The element `node` is a child of: its parent, or the host of the shadow root it is in. */
const parentOf = (node: Element): Element | null =>
  node.parentElement ?? (node.getRootNode() as Partial<ShadowRoot>).host ?? null;

export function createSlottedEdges(): SlottedEdges {
  const edges = new WeakMap<Element, BarEdge>();
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    set(element, edge) {
      if (edges.get(element) === edge) return;
      edges.set(element, edge);
      version += 1;
      for (const listener of [...listeners]) listener();
    },
    edgeOf(element) {
      for (let node: Element | null = element; node; node = parentOf(node)) {
        const edge = edges.get(node);
        if (edge) return edge;
      }
      return 'top';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}

const SlottedEdgesContext = createContext<SlottedEdges>(createSlottedEdges());

/** Gives the item sockets and the viewer's own components inside it one {@link SlottedEdges}. */
export const SlottedEdgesProvider = SlottedEdgesContext.Provider;

export function useSlottedEdges(): SlottedEdges {
  return useContext(SlottedEdgesContext);
}
