/**
 * Each page's widgets, where they are and how they look, mirrored from the
 * widget plane: one annotation read per page, loaded when a page first needs
 * its fill controls. Value writes never move or restyle widgets; structural
 * form changes and edits of widget annotations re-read the pages they touch.
 */
import type { DocumentEvent, PageRef } from '@embedpdf/core';
import type { PageMirror } from '@embedpdf/core';
import type { FormWidget } from '@embedpdf/engine-core/runtime';

import type { PageWidget, PageWidgets } from '../model';
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

export function createWidgetBoxesMirror(ctx: FormContext): PageMirror<PageWidgets> {
  return ctx.pageMirror<PageWidgets>({
    name: 'widget-boxes',
    load: async (doc, page) => {
      const { annotations } = await doc.page(page).annotations.list();
      const widgets: Record<number, PageWidget> = {};
      for (const record of annotations) {
        if (record.subtype !== 'widget' || record.ref.kind !== 'objectNumber') continue;
        widgets[record.ref.objectNumber] = {
          box: record.rect,
          look: {
            border: record.color ?? null,
            borderWidth: record.strokeWidth ?? 1,
            borderStyle: record.borderStyle ?? 'solid',
            background: record.interiorColor ?? null,
            color: record.fontColor ?? null,
            fontFamily: record.fontFamily ?? null,
            fontSize: record.fontSize ?? null,
            textAlign: record.textAlign ?? 'left',
          },
        };
      }
      return widgets;
    },
    affected: affectedPages,
  });
}
