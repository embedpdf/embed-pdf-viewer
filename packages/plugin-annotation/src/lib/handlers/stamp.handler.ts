import {
  PdfAnnotationIcon,
  PdfAnnotationSubtype,
  PdfStampAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
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

        const { imageSrc, imageSize } = tool.defaults;

        const placeStamp = (imageData: ImageData, width: number, height: number) => {
          // Center the stamp at the click position, then clamp origin to stay fully on-page.
          const originX = pos.x - width / 2;
          const originY = pos.y - height / 2;
          const finalX = clamp(originX, 0, pageSize.width - width);
          const finalY = clamp(originY, 0, pageSize.height - height);

          const rect: Rect = {
            origin: { x: finalX, y: finalY },
            size: { width, height },
          };

          const anno: PdfStampAnnoObject = {
            ...tool.defaults,
            rect,
            type: PdfAnnotationSubtype.STAMP,
            icon: tool.defaults.icon ?? PdfAnnotationIcon.Draft,
            subject: tool.defaults.subject ?? 'Stamp',
            flags: tool.defaults.flags ?? ['print'],
            pageIndex: context.pageIndex,
            id: uuidV4(),
            created: new Date(),
          };

          onCommit(anno, { imageData });
        };

        if (imageSrc) {
          // Pre-defined stamp: process it with page dimensions as constraints
          services.processImage({
            source: imageSrc,
            maxWidth: pageSize.width,
            maxHeight: pageSize.height,
            onComplete: (result) =>
              placeStamp(
                result.imageData,
                imageSize?.width ?? result.width,
                imageSize?.height ?? result.height,
              ),
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
