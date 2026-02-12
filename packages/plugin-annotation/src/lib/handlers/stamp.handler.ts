import {
  PdfAnnotationIcon,
  PdfAnnotationSubtype,
  PdfStampAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory } from './types';
import { applyInsertUpright, clampAnnotationToPage } from '../patching';

export const stampHandlerFactory: HandlerFactory<PdfStampAnnoObject> = {
  annotationType: PdfAnnotationSubtype.STAMP,
  create(context) {
    const { services, onCommit, getTool, pageSize, pageRotation } = context;

    return {
      onPointerDown: (pos) => {
        const tool = getTool();
        if (!tool) return;

        const { imageSrc, imageSize } = tool.defaults;

        const placeStamp = (imageData: ImageData, width: number, height: number) => {
          // Create rect centered at click position (unclamped)
          const rect: Rect = {
            origin: { x: pos.x - width / 2, y: pos.y - height / 2 },
            size: { width, height },
          };

          let anno: PdfStampAnnoObject = {
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

          // Apply insert-upright rotation (utility handles everything via patch system)
          if (tool.behavior?.insertUpright) {
            anno = applyInsertUpright(anno, pageRotation, false);
          }
          anno = clampAnnotationToPage(anno, pageSize);

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
