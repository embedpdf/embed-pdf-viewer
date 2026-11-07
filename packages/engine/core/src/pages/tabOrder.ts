/**
 * The order Tab takes through a document's annotations: page by page in the document's order, and
 * on each page the order the page gives (`/Tabs`, ISO 32000-2 §12.5): rows, top to bottom then left
 * to right; columns, left to right then top to bottom; structure, as the document's tags read, by
 * each annotation's `structurePosition`; widgets, the form fields first, then the rest; otherwise
 * the order the page lists them. The standard doesn't place an annotation the tags leave out, so on
 * a structure page those come after the tagged ones, in the order the page lists them. Page space:
 * top-left origin, y down.
 */
import type { PageTabOrder } from '../dto/PageLayout';

/** What `tabOrderOf()` reads of an annotation; every annotation, and a form's widget rows, have it. */
export interface TabOrderItem {
  readonly subtype: string;
  readonly page: { readonly objectNumber: number };
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly structurePosition: readonly number[] | null;
}

/** A page in the document's order, and its tab order; a `PageLayout` is one. */
export interface TabOrderPage {
  readonly ref: { readonly objectNumber: number };
  readonly tabOrder: PageTabOrder | null;
}

/**
 * `annotations` in the order Tab visits them, page by page in `pages`' order. Each page keeps the
 * order the annotations are given in (the page's own order) wherever its tab order doesn't decide.
 * Annotations on a page `pages` doesn't list are left out.
 */
export function tabOrderOf<T extends TabOrderItem>(
  annotations: readonly T[],
  pages: readonly TabOrderPage[],
): T[] {
  const byPage = new Map<number, T[]>();
  for (const annotation of annotations) {
    const onPage = byPage.get(annotation.page.objectNumber);
    if (onPage) onPage.push(annotation);
    else byPage.set(annotation.page.objectNumber, [annotation]);
  }
  return pages.flatMap((page) => {
    const onPage = byPage.get(page.ref.objectNumber) ?? [];
    switch (page.tabOrder) {
      case 'rows':
        return inLines(onPage, 'y', 'x');
      case 'columns':
        return inLines(onPage, 'x', 'y');
      case 'structure':
        return byStructure(onPage);
      case 'widgets':
        return [
          ...onPage.filter((annotation) => annotation.subtype === 'widget'),
          ...onPage.filter((annotation) => annotation.subtype !== 'widget'),
        ];
      default:
        return onPage;
    }
  });
}

/** Two structure positions in the tags' reading order: index by index, a parent before its kids. */
export function compareStructurePositions(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  }
  return left.length - right.length;
}

/**
 * The tagged annotations in the tags' order, then the rest in the page's own order. A row without
 * a position at all (from an engine that doesn't read them) counts as not tagged.
 */
function byStructure<T extends TabOrderItem>(annotations: readonly T[]): T[] {
  const positionOf = (annotation: T) => annotation.structurePosition ?? null;
  const tagged = annotations.filter((annotation) => positionOf(annotation) !== null);
  tagged.sort((left, right) => compareStructurePositions(positionOf(left)!, positionOf(right)!));
  return [...tagged, ...annotations.filter((annotation) => positionOf(annotation) === null)];
}

/**
 * Rows (or columns): the boxes go into lines down the page (or across it), each read along the
 * other axis. A line starts at the box nearest the top (or the left) and takes every box whose
 * middle falls inside that first box, so boxes a point or two apart still read as one line.
 */
function inLines<T extends TabOrderItem>(
  annotations: readonly T[],
  across: 'x' | 'y',
  along: 'x' | 'y',
): T[] {
  const size = across === 'y' ? 'height' : 'width';
  const lines: T[][] = [];
  let end = -Infinity;
  for (const annotation of [...annotations].sort((a, b) => a.rect[across] - b.rect[across])) {
    const middle = annotation.rect[across] + annotation.rect[size] / 2;
    const line = lines.at(-1);
    if (line && middle <= end) {
      line.push(annotation);
    } else {
      lines.push([annotation]);
      end = annotation.rect[across] + annotation.rect[size];
    }
  }
  return lines.flatMap((line) => line.sort((a, b) => a.rect[along] - b.rect[along]));
}
