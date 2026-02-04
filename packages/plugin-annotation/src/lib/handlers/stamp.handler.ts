import {
  PdfAnnotationIcon,
  PdfAnnotationSubtype,
  PdfStampAnnoObject,
  Rect,
  Rotation,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory } from './types';
import { clamp } from '@embedpdf/core';

export const stampHandlerFactory: HandlerFactory<PdfStampAnnoObject> = {
  annotationType: PdfAnnotationSubtype.STAMP,
  create(context) {
    const { services, onCommit, getTool, pageSize, pageRotation } = context;

    /**
     * Rotates ImageData based on the page rotation to ensure the stamp remains upright.
     * Note: PDF rotation is clockwise. To compensate, we rotate the image counter-clockwise.
     */
    const rotateImageData = (data: ImageData, rotation: Rotation): ImageData => {
      if (rotation === Rotation.Degree0) return data;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return data;

      const { width, height } = data;

      if (rotation === Rotation.Degree90 || rotation === Rotation.Degree270) {
        canvas.width = height;
        canvas.height = width;
      } else {
        canvas.width = width;
        canvas.height = height;
      }

      // We want to rotate the content so it stays upright relative to the user.
      // If the page is rotated 90 deg clockwise, we rotate the image 90 deg counter-clockwise.
      const angle = (rotation * -90 * Math.PI) / 180;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      ctx.translate(-width / 2, -height / 2);

      // Create a temporary canvas to put the original ImageData
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return data;
      tempCtx.putImageData(data, 0, 0);

      ctx.drawImage(tempCanvas, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    return {
      onPointerDown: (pos) => {
        const tool = getTool();
        if (!tool) return;

        const { imageSrc, imageSize } = tool.defaults;

        const placeStamp = (imageData: ImageData, width: number, height: number) => {
          // Pre-rotate the image data to match page rotation
          const transformedImageData = rotateImageData(imageData, pageRotation);

          // Calculate effective page dimensions based on rotation
          const effectivePageWidth =
            pageRotation === Rotation.Degree90 || pageRotation === Rotation.Degree270
              ? pageSize.height
              : pageSize.width;
          const effectivePageHeight =
            pageRotation === Rotation.Degree90 || pageRotation === Rotation.Degree270
              ? pageSize.width
              : pageSize.height;

          // Center the stamp at the click position, then clamp origin to stay fully on-page.
          const originX = pos.x - width / 2;
          const originY = pos.y - height / 2;
          const finalX = clamp(originX, 0, effectivePageWidth - width);
          const finalY = clamp(originY, 0, effectivePageHeight - height);

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

          onCommit(anno, { imageData: transformedImageData });
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
