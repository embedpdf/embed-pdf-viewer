import { PdfAnnotationSubtype, PdfStampAnnoObject, Rect, uuidV4 } from '@embedpdf/models';
import { HandlerFactory } from './types';
import { clamp } from '@embedpdf/core';

export const stampHandlerFactory: HandlerFactory<PdfStampAnnoObject> = {
  annotationType: PdfAnnotationSubtype.STAMP,
  create(context) {
    const { services, onCommit, getTool, pageSize } = context;

    return {
      onPointerDown: (pos) => {
        const tool = getTool();
        if (!tool) return;

        const { imageSrc } = tool.defaults;

        const placeStamp = (imageData: ImageData, width: number, height: number) => {
          // The width and height are now guaranteed to be scaled to fit the page.
          // We still clamp the origin to ensure it's placed fully on-page.
          const finalX = clamp(pos.x, 0, pageSize.width - width);
          const finalY = clamp(pos.y, 0, pageSize.height - height);

          const rect: Rect = {
            origin: { x: finalX, y: finalY },
            size: { width, height },
          };

          const anno: PdfStampAnnoObject = {
            rect,
            type: PdfAnnotationSubtype.STAMP,
            pageIndex: context.pageIndex,
            id: uuidV4(),
            created: new Date(),
            flags: ['print'],
          };

          onCommit(anno, { imageData });
        };

        if (imageSrc) {
          // Pre-defined stamp: process it with page dimensions as constraints
          services.processImage({
            source: imageSrc,
            maxWidth: pageSize.width,
            maxHeight: pageSize.height,
            onComplete: (result) => placeStamp(result.imageData, result.width, result.height),
          });
        } else {
          // Dynamic stamp: let user select a file
          services.requestFile({
            accept: 'image/png,image/jpeg',
            onFile: (file) => {
              // Process the selected file with page dimensions as constraints
              services.processImage({
                source: file,
                maxWidth: pageSize.width,
                maxHeight: pageSize.height,
                onComplete: (result) => placeStamp(result.imageData, result.width, result.height),
              });
            },
          });
        }
      },
    };
  },
};
