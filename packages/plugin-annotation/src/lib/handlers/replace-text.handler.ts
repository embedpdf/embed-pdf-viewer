import {
  PdfAnnotationReplyType,
  PdfAnnotationSubtype,
  PdfStrikeOutAnnoObject,
  uuidV4,
} from '@embedpdf/models';
import { SelectionHandlerFactory } from './types';
import { computeCaretRect } from './selection-utils';

/**
 * Selection handler for the "Replace Text" tool.
 * Creates a Caret annotation (group leader, intent "Replace") at the end
 * of the selection, plus a StrikeOut annotation (intent "StrikeOutTextEdit")
 * over the full selection, linked to the Caret via IRT/RT=Group.
 */
export const replaceTextSelectionHandler: SelectionHandlerFactory<PdfStrikeOutAnnoObject> = {
  toolId: 'replaceText',
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
      const strikeoutId = uuidV4();
      const defaults = getDefaults();

      getText().then((text) => {
        context.createAnnotation(selection.pageIndex, {
          type: PdfAnnotationSubtype.CARET,
          id: caretId,
          pageIndex: selection.pageIndex,
          rect: caretRect,
          color: defaults.strokeColor,
          opacity: defaults.opacity,
          intent: 'Replace',
          rectangleDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
          created: new Date(),
          flags: defaults.flags,
        });

        context.createAnnotation(selection.pageIndex, {
          type: PdfAnnotationSubtype.STRIKEOUT,
          id: strikeoutId,
          pageIndex: selection.pageIndex,
          rect: selection.rect,
          segmentRects: selection.segmentRects,
          strokeColor: defaults.strokeColor,
          opacity: defaults.opacity,
          intent: 'StrikeOutTextEdit',
          inReplyToId: caretId,
          replyType: PdfAnnotationReplyType.Group,
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
