import {
  PdfAnnotationReplyType,
  PdfAnnotationSubtype,
  PdfStrikeOutAnnoObject,
  uuidV4,
} from '@embedpdf/models';
import { SelectionHandlerFactory } from './types';
import { computeCaretGeometry } from './selection-utils';

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
      const lastSegQuad = selection.segmentQuads?.[selection.segmentQuads.length - 1];
      if (!lastSegRect) continue;

      const caretGeometry = computeCaretGeometry(lastSegRect, lastSegQuad);
      const caretId = uuidV4();
      const strikeoutId = uuidV4();
      const defaults = getDefaults();

      getText().then((text) => {
        context.createAnnotation(selection.pageIndex, {
          type: PdfAnnotationSubtype.CARET,
          id: caretId,
          pageIndex: selection.pageIndex,
          rect: caretGeometry.rect,
          ...(caretGeometry.unrotatedRect !== undefined && {
            unrotatedRect: caretGeometry.unrotatedRect,
          }),
          ...(caretGeometry.rotation !== undefined && { rotation: caretGeometry.rotation }),
          strokeColor: defaults.strokeColor,
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
          ...(selection.segmentQuads && { segmentQuads: selection.segmentQuads }),
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
