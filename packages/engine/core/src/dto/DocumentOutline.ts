import type { PdfActionTree } from './PdfAction';
import type { PageDestination } from './PdfDestination';
import type { PdfLinkTarget, PdfLinkTargetWritable } from './PdfLinkTarget';
import type { OutlineItemRef } from '../identity/OutlineItemRef';

/**
 * One item of the document's outline (`/Root /Outlines`, which PDF apps call
 * the bookmarks): a title, where it goes, how it is drawn, and whether its
 * children show when the document opens. A destination is in page space in
 * the public API (`D` = `PageDestination`); the engine's readers use the
 * file's coordinates.
 */
export interface OutlineItem<D = PageDestination> {
  ref: OutlineItemRef;
  /** The item it sits under; `null` at the top level. */
  parent: OutlineItemRef | null;
  /** `/Title`, as written. */
  title: string;
  /**
   * Where it goes, read the way a link's target is: a `/Dest` and a `/A`
   * GoTo both read as `goto`, a named destination resolved to the place it
   * names. A destination on a page the document no longer has, or an action
   * that can't be run, reads as `unsupported`. `null` when it goes nowhere.
   */
  target: PdfLinkTarget<D> | null;
  /**
   * Its `/A` action as a tree, to run it the way a link's is run (a script,
   * a chain of actions). `null` without `/A`: a `/Dest` is no action.
   */
  action: PdfActionTree<D> | null;
  /**
   * Whether its children show when the document opens (`/Count` above 0).
   * Always `false` for an item without children: a leaf has no open state.
   */
  open: boolean;
  /**
   * The colour its title is drawn in (`/C`), as `#rrggbb`; `null` when the
   * file sets none, so a viewer draws its own text colour.
   */
  color: string | null;
  /** `/F` bit 2. */
  bold: boolean;
  /** `/F` bit 1. */
  italic: boolean;
}

/** What `doc.outline.get()` reads: the document's outline, every item. */
export interface DocumentOutline<D = PageDestination> {
  /** Every item, depth first: a parent before its children, siblings in their order. */
  items: OutlineItem<D>[];
  /**
   * Part of the outline couldn't be read: a loop in its links, an item that
   * isn't an indirect object (with the items under it), or past
   * {@link OUTLINE_READ_LIMITS}. What could be read is listed.
   */
  incomplete: boolean;
}

/**
 * A new item. It starts without children, so it has no open state: to open
 * an item, update it once its children exist (in the same change).
 */
export interface OutlineItemDraft<D = PageDestination> {
  title: string;
  /** Where it goes; nowhere when left out or `null`. */
  target?: PdfLinkTargetWritable<D> | null;
  /** `#rrggbb`; the viewer's own text colour when left out or `null`. */
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
}

/**
 * What an update changes: the fields it names, each as a draft takes it.
 * `target: null` removes the target, `color: null` the colour. `open` takes
 * effect only on an item with children; a leaf has no open state.
 */
export type OutlineItemPatch<D = PageDestination> = Partial<OutlineItemDraft<D>> & {
  open?: boolean;
};

/**
 * How much of an outline a read takes: the items, and how deep they nest.
 * Past either, the read stops and says `incomplete`.
 */
export const OUTLINE_READ_LIMITS = { items: 50_000, depth: 128 } as const;
