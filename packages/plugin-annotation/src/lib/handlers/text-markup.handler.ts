import { PdfAnnotationObject, uuidV4 } from '@embedpdf/models';
import { SelectionHandlerFactory } from './types';

/**
 * Default selection handler for text-markup tools (highlight, underline,
 * strikeout, squiggly). Used as a fallback when no tool-specific
 * SelectionHandlerFactory is registered.
 */
export const textMarkupSelectionHandler: SelectionHandlerFactory = {
  toolId: '__textMarkup__',
  handle(context, selections, getText) {
    const tool = context.getTool();
    if (!tool) return;

    for (const selection of selections) {
      const id = uuidV4();

      getText().then((text) => {
        context.createAnnotation(selection.pageIndex, {
          ...tool.defaults,
          rect: selection.rect,
          segmentRects: selection.segmentRects,
          pageIndex: selection.pageIndex,
          created: new Date(),
          id,
          ...(text != null && { custom: { text } }),
        } as PdfAnnotationObject);

        if (tool.behavior?.selectAfterCreate) {
          context.selectAnnotation(selection.pageIndex, id);
        }
      });
    }
  },
};
