/**
 * Your own toolbar item, in its bar: a `<slot name="item:<id>">` the browser
 * shows your element in, with what the item stands for when nothing is
 * slotted (its command's button). What's slotted lives in the page, so the
 * socket is measured where it renders; the toolbar's measurement layer can't
 * hold it. It tells what's slotted where it sits (`item-context.ts`), and the
 * viewer's own components inside it learn the bar's edge from it, so their
 * menus open away from the bar.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { useLayoutEnv } from '../config-context';
import { useBarEdge } from './bar-edge';
import { toolbarItemEdgeOf, writeToolbarItemContext } from './item-context';
import { useSlottedEdges } from './slotted-edges';

/** The socket's box: a row of what's slotted, at its own size along the bar. */
const SOCKET_STYLE = { display: 'inline-flex', alignItems: 'center', flexShrink: 0 } as const;

export function ItemSocket({
  id,
  variant,
  orientation,
  measure,
  children,
}: {
  /** The item's id: `{ custom: id }` in the layout. */
  id: string;
  /** The variant the toolbar picked, or null for an item without variants of its own. */
  variant: string | null;
  orientation: 'horizontal' | 'vertical';
  /** Reports the socket's length along the bar. */
  measure: (length: number) => void;
  /** What shows while nothing is slotted. */
  children?: ReactNode;
}) {
  const slot = useRef<HTMLSlotElement>(null);
  const edge = useBarEdge();
  const { size } = useLayoutEnv();
  const edges = useSlottedEdges();
  const report = useRef(measure);
  report.current = measure;

  // A child slotted in or out resizes the socket's box, so one observer covers both.
  const resizes = useRef<ResizeObserver | null>(null);
  const hasVariants = variant !== null;
  useLayoutEffect(() => {
    const element = slot.current;
    if (!element) return;
    const side = orientation === 'vertical' ? 'height' : 'width';
    const measureNow = () => report.current(element.getBoundingClientRect()[side]);
    // Measured before the first paint, unless what's slotted is about to draw its variant.
    if (!hasVariants) measureNow();
    const observer = new ResizeObserver(measureNow);
    observer.observe(element);
    resizes.current = observer;
    return () => {
      observer.disconnect();
      resizes.current = null;
    };
  }, [orientation, hasVariants]);
  // At another variant, what's slotted draws itself again first: its length is taken once the
  // browser has laid that out (an observer's first call), and counts for the new variant.
  useLayoutEffect(() => {
    const element = slot.current;
    const observer = resizes.current;
    if (!element || !observer) return;
    observer.unobserve(element);
    observer.observe(element);
  }, [variant]);

  useLayoutEffect(() => {
    const element = slot.current;
    if (!element) return;
    const context = { orientation, edge: toolbarItemEdgeOf(edge), variant, size };
    const tell = () => {
      for (const slotted of element.assignedElements()) {
        writeToolbarItemContext(slotted, context);
        edges.set(slotted, edge);
      }
    };
    tell();
    element.addEventListener('slotchange', tell);
    return () => element.removeEventListener('slotchange', tell);
  }, [orientation, edge, variant, size, edges]);

  return (
    <slot ref={slot} name={`item:${id}`} style={SOCKET_STYLE}>
      {children}
    </slot>
  );
}
