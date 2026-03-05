import { PdfAnnotationSubtype, PdfCaretAnnoObject, uuidV4 } from '@embedpdf/models';
import { SelectionHandlerFactory } from './types';
import { computeCaretRect } from './selection-utils';

/**
 * Selection handler for the "Insert Text" tool.
 * Creates a single Caret annotation at the end of the text selection
 * with intent "Insert".
 */
export const insertTextSelectionHandler: SelectionHandlerFactory<PdfCaretAnnoObject> = {
  toolId: 'insertText',
  handle(context, selections, getText) {
    const tool = context.getTool();
    if (!tool) return;

    const getDefaults = () => ({
      strokeColor: tool.defaults.strokeColor ?? '#E44234',
      opacity: tool.defaults.opacity ?? 1,
      flags: tool.defaults.flags ?? ['print'],
    });

    for (const selection of selections) {
      const lastSegRect = selection.segmentRects[selection.segmentRects.length - 1];
      if (!lastSegRect) continue;

      const caretRect = computeCaretRect(lastSegRect);
      const caretId = uuidV4();
      const defaults = getDefaults();

      getText().then((text) => {
        context.createAnnotation(selection.pageIndex, {
          type: PdfAnnotationSubtype.CARET,
          id: caretId,
          pageIndex: selection.pageIndex,
          rect: caretRect,
          strokeColor: defaults.strokeColor,
          opacity: defaults.opacity,
          intent: 'Insert',
          rectangleDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
          created: new Date(),
          flags: defaults.flags,
          ...(text != null && { custom: { text } }),
        });

        if (tool.behavior?.selectAfterCreate) {
          context.selectAnnotation(selection.pageIndex, caretId);
        }
      });
    }
  },
};
