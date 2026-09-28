import type {
  DocumentActionsSnapshot,
  NamedJavaScriptAction,
  PdfActionNode,
  PdfActionTree,
  PdfAnnotationActions,
  PdfFieldActions,
  PdfPageActions,
} from '../dto/PdfAction';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { PdfLinkTarget } from '../dto/PdfLinkTarget';
import type { PdfRect } from '../geometry/primitives';
import type { PageRef } from '../identity/PageRef';

/**
 * The visible box of any page of the document, in the file's coordinates. A
 * destination is measured on the page it goes to, so converting one needs
 * that page's box, not the box of the page it sits on.
 */
export type VisibleBoxOf = (page: PageRef) => PdfRect;

/**
 * The visible box a destination is measured on: the `pdfCropBox` of the page
 * it goes to, or a function that gives any page's.
 */
export type DestinationBox = PdfRect | VisibleBoxOf;

const boxFor = (page: PageRef, box: DestinationBox): PdfRect =>
  typeof box === 'function' ? box(page) : box;

type Axis = number | null | undefined;

/** An axis value that may keep the current one (`null`) or be left out. */
const across = (value: Axis, convert: (value: number) => number): Axis =>
  value == null ? value : convert(value);

/**
 * A destination in the file's coordinates, in page space: for one read by
 * another PDF tool, before handing it to the viewer. `box` is the `pdfCropBox`
 * of the page it goes to.
 */
export function pageDestinationOf(
  destination: PdfDestination,
  box: DestinationBox,
): PageDestination {
  const { left: boxLeft, top: boxTop } = boxFor(destination.page, box);
  const x = (left: Axis) => across(left, (value) => value - boxLeft);
  const y = (top: Axis) => across(top, (value) => boxTop - value);
  switch (destination.kind) {
    case 'xyz': {
      const { left, top, ...rest } = destination;
      return {
        ...rest,
        ...('left' in destination ? { x: x(left) } : {}),
        ...('top' in destination ? { y: y(top) } : {}),
      };
    }
    case 'fitH':
    case 'fitBH': {
      const { top, ...rest } = destination;
      return { ...rest, ...('top' in destination ? { y: y(top) } : {}) };
    }
    case 'fitV':
    case 'fitBV': {
      const { left, ...rest } = destination;
      return { ...rest, ...('left' in destination ? { x: x(left) } : {}) };
    }
    case 'fitR': {
      const { left, bottom, right, top, ...rest } = destination;
      const lower = Math.min(bottom, top);
      const upper = Math.max(bottom, top);
      return {
        ...rest,
        x: Math.min(left, right) - boxLeft,
        y: boxTop - upper,
        width: Math.abs(right - left),
        height: upper - lower,
      };
    }
    case 'fit':
    case 'fitB':
      return destination;
  }
}

/**
 * A page-space destination in the file's coordinates: for handing one to
 * another PDF tool. `box` is the `pdfCropBox` of the page it goes to.
 */
export function pdfDestinationOf(
  destination: PageDestination,
  box: DestinationBox,
): PdfDestination {
  const { left: boxLeft, top: boxTop } = boxFor(destination.page, box);
  const left = (x: Axis) => across(x, (value) => value + boxLeft);
  const top = (y: Axis) => across(y, (value) => boxTop - value);
  switch (destination.kind) {
    case 'xyz': {
      const { x, y, ...rest } = destination;
      return {
        ...rest,
        ...('x' in destination ? { left: left(x) } : {}),
        ...('y' in destination ? { top: top(y) } : {}),
      };
    }
    case 'fitH':
    case 'fitBH': {
      const { y, ...rest } = destination;
      return { ...rest, ...('y' in destination ? { top: top(y) } : {}) };
    }
    case 'fitV':
    case 'fitBV': {
      const { x, ...rest } = destination;
      return { ...rest, ...('x' in destination ? { left: left(x) } : {}) };
    }
    case 'fitR': {
      const { x, y, width, height, ...rest } = destination;
      const upper = boxTop - y;
      return {
        ...rest,
        left: x + boxLeft,
        bottom: upper - height,
        right: x + boxLeft + width,
        top: upper,
      };
    }
    case 'fit':
    case 'fitB':
      return destination;
  }
}

// ── the values that carry destinations ──

/** Converts the destinations inside a value; everything else is kept. */
type Convert<From, To> = (destination: From) => To;

export function mapLinkTarget<From, To>(
  target: PdfLinkTarget<From>,
  convert: Convert<From, To>,
): PdfLinkTarget<To> {
  return target.kind === 'goto' ? { ...target, destination: convert(target.destination) } : target;
}

export function mapActionNode<From, To>(
  node: PdfActionNode<From>,
  convert: Convert<From, To>,
): PdfActionNode<To> {
  const next = node.next.map((child) => mapActionNode(child, convert));
  return (
    node.type === 'goto'
      ? { ...node, next, destination: convert(node.destination) }
      : { ...node, next }
  ) as PdfActionNode<To>;
}

export function mapActionTree<From, To>(
  tree: PdfActionTree<From>,
  convert: Convert<From, To>,
): PdfActionTree<To> {
  return { ...tree, root: tree.root ? mapActionNode(tree.root, convert) : null };
}

/** An action tree in page space: each `goto` measured on the page it goes to. */
export function pageActionTreeOf(
  tree: PdfActionTree<PdfDestination>,
  box: DestinationBox,
): PdfActionTree {
  return mapActionTree(tree, (destination) => pageDestinationOf(destination, box));
}

/** A link target in page space: a `goto` measured on the page it goes to. */
export function pageLinkTargetOf(
  target: PdfLinkTarget<PdfDestination>,
  box: DestinationBox,
): PdfLinkTarget {
  return mapLinkTarget(target, (destination) => pageDestinationOf(destination, box));
}

/** Every action tree in a record of triggers (an annotation's, a page's or a field's). */
function mapTriggers<From, To>(
  triggers: object,
  convert: Convert<From, To>,
): Record<string, PdfActionTree<To> | undefined> {
  return Object.fromEntries(
    Object.entries(triggers as Record<string, PdfActionTree<From> | undefined>).map(
      ([trigger, tree]) => [trigger, tree ? mapActionTree(tree, convert) : tree],
    ),
  );
}

export function mapAnnotationActions<From, To>(
  actions: PdfAnnotationActions<From>,
  convert: Convert<From, To>,
): PdfAnnotationActions<To> {
  return mapTriggers(actions, convert);
}

export function mapPageActions<From, To>(
  actions: PdfPageActions<From>,
  convert: Convert<From, To>,
): PdfPageActions<To> {
  return mapTriggers(actions, convert);
}

export function mapFieldActions<From, To>(
  actions: PdfFieldActions<From>,
  convert: Convert<From, To>,
): PdfFieldActions<To> {
  return mapTriggers(actions, convert);
}

export function mapDocumentActions<From, To>(
  snapshot: DocumentActionsSnapshot<From>,
  convert: Convert<From, To>,
): DocumentActionsSnapshot<To> {
  const { nameTreeScripts, openAction, openDestination, ...triggers } = snapshot;
  return {
    ...mapTriggers(triggers, convert),
    nameTreeScripts: nameTreeScripts.map(
      (script): NamedJavaScriptAction<To> => ({
        ...script,
        action: mapActionTree(script.action, convert),
      }),
    ),
    openAction: openAction ? mapActionTree(openAction, convert) : null,
    ...('openDestination' in snapshot
      ? { openDestination: openDestination ? convert(openDestination) : openDestination }
      : {}),
  } as DocumentActionsSnapshot<To>;
}
