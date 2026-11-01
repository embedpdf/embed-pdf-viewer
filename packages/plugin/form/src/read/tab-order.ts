/**
 * The order Tab takes through a form: page by page in the document's order, and on each page the
 * order the page gives (`/Tabs`, ISO 32000-2 §12.5): rows, top to bottom then left to right;
 * columns, left to right then top to bottom; or its annotations' own order, which a page that
 * says nothing and one that names its structure take too (the plugin doesn't read the structure
 * tree). Page space: top-left origin, y down.
 */
import type { PageTabOrder, WidgetAnnotation } from '@embedpdf/engine-core/runtime';

/** A page in the document's order, with the order its annotations take keyboard focus in. */
export interface TabPage {
  readonly ref: { readonly objectNumber: number };
  readonly tabOrder: PageTabOrder | null;
}

/** The widget rows in the order Tab visits them; rows on a page that isn't listed are left out. */
export function tabOrderOf(
  rows: readonly WidgetAnnotation[],
  pages: readonly TabPage[],
): WidgetAnnotation[] {
  const byPage = new Map<number, WidgetAnnotation[]>();
  for (const row of rows) {
    const onPage = byPage.get(row.page.objectNumber);
    if (onPage) onPage.push(row);
    else byPage.set(row.page.objectNumber, [row]);
  }
  return pages.flatMap((page) => {
    const onPage = byPage.get(page.ref.objectNumber) ?? [];
    switch (page.tabOrder) {
      case 'rows':
        return inLines(onPage, 'y', 'x');
      case 'columns':
        return inLines(onPage, 'x', 'y');
      default:
        return onPage;
    }
  });
}

/**
 * Rows (or columns): the boxes go into lines down the page (or across it), each read along the
 * other axis. A line starts at the box nearest the top (or the left) and takes every box whose
 * middle falls inside that first box, so boxes a point or two apart still read as one line.
 */
function inLines(
  rows: readonly WidgetAnnotation[],
  across: 'x' | 'y',
  along: 'x' | 'y',
): WidgetAnnotation[] {
  const size = across === 'y' ? 'height' : 'width';
  const lines: WidgetAnnotation[][] = [];
  let end = -Infinity;
  for (const row of [...rows].sort((a, b) => a.rect[across] - b.rect[across])) {
    const middle = row.rect[across] + row.rect[size] / 2;
    const line = lines.at(-1);
    if (line && middle <= end) {
      line.push(row);
    } else {
      lines.push([row]);
      end = row.rect[across] + row.rect[size];
    }
  }
  return lines.flatMap((line) => line.sort((a, b) => a.rect[along] - b.rect[along]));
}
