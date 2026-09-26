/**
 * Widget geometry, mirrored per page from the widget plane: one annotation
 * read per page, loaded when a page first needs its fill controls. Value
 * writes never move widgets; structural form changes and edits of widget
 * annotations re-read the pages they touch.
 */
import type { DocumentEvent, PageRef } from '@embedpdf/core';
import type { PageMirror } from '@embedpdf/core';
import type { FormWidget } from '@embedpdf/engine-core/runtime';

import type { Box, WidgetBoxes } from '../model';
import type { FormContext } from '../services/context';

const pagesOfWidgets = (widgets: readonly FormWidget[]): PageRef[] =>
  widgets.flatMap((widget) => (widget.page ? [widget.page] : []));

function affectedPages(event: DocumentEvent): readonly PageRef[] | 'all' | null {
  switch (event.type) {
    case 'forms.created':
    case 'forms.updated':
    case 'forms.widgetAdded':
    case 'forms.widgetRemoved':
      return pagesOfWidgets(event.field.widgets);
    case 'forms.deleted':
      return pagesOfWidgets(event.meta.changedWidgets);
    case 'forms.imported':
    case 'forms.repaired':
      return 'all';
    case 'annotations.created':
      return event.annotation.subtype === 'widget' ? [event.page] : null;
    case 'annotations.updated':
      return event.annotation.subtype === 'widget' ? [event.page] : null;
    case 'annotations.deleted':
      return [event.page];
    default:
      return null;
  }
}

export function createWidgetBoxesMirror(ctx: FormContext): PageMirror<WidgetBoxes> {
  return ctx.pageMirror<WidgetBoxes>({
    name: 'widget-boxes',
    load: async (doc, page) => {
      const space = ctx.geometry.forPage(page);
      const { annotations } = await doc.page(page).annotations.list();
      const boxes: Record<number, Box> = {};
      for (const record of annotations) {
        if (record.subtype !== 'widget' || record.ref.kind !== 'objectNumber') continue;
        boxes[record.ref.annotObjectNumber] = space.pdfRectToPage(record.rect);
      }
      return boxes;
    },
    affected: affectedPages,
  });
}
