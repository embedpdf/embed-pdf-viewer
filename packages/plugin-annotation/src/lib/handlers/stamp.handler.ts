import {
  AnnotationCreateContext,
  PdfAnnotationName,
  PdfAnnotationSubtype,
  PdfStampAnnoObject,
  Rect,
  uuidV4,
  getImageMetadata,
  fitSizeWithin,
} from '@embedpdf/models';
import { HandlerFactory } from './types';
import { applyInsertUpright, clampAnnotationToPage } from '../patching';

interface CachedImage {
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

const imageFetchCache = new Map<string, { promise: Promise<CachedImage | null>; refs: number }>();

export const stampHandlerFactory: HandlerFactory<PdfStampAnnoObject> = {
  annotationType: PdfAnnotationSubtype.STAMP,
  create(context) {
    const { services, onCommit, onPreview, getTool, pageSize, pageRotation } = context;

    let cachedBuffer: ArrayBuffer | null = null;
    let cachedSize: { width: number; height: number } | null = null;

    const commitStamp = (
      pos: { x: number; y: number },
      width: number,
      height: number,
      ctx: AnnotationCreateContext<PdfStampAnnoObject>,
    ) => {
      const tool = getTool();
      if (!tool) return;

      const rect: Rect = {
        origin: { x: pos.x - width / 2, y: pos.y - height / 2 },
        size: { width, height },
      };

      let anno: PdfStampAnnoObject = {
        ...tool.defaults,
        rect,
        type: PdfAnnotationSubtype.STAMP,
        name: tool.defaults.name ?? PdfAnnotationName.Image,
        subject: tool.defaults.subject ?? 'Stamp',
        flags: tool.defaults.flags ?? ['print'],
        pageIndex: context.pageIndex,
        id: uuidV4(),
        created: new Date(),
      };

      if (tool.behavior?.insertUpright) {
        anno = applyInsertUpright(anno, pageRotation, false);
      }
      anno = clampAnnotationToPage(anno, pageSize);

      onCommit(anno, ctx);
    };

    const commitFromBuffer = (
      pos: { x: number; y: number },
      buffer: ArrayBuffer,
      imageSize?: { width?: number; height?: number },
    ) => {
      const meta = getImageMetadata(buffer);
      if (!meta || meta.mimeType === 'application/pdf') return false;

      const fitted = fitSizeWithin(meta, pageSize);
      const width = imageSize?.width ?? fitted.width;
      const height = imageSize?.height ?? fitted.height;
      commitStamp(pos, width, height, { data: buffer });
      return true;
    };

    return {
      onHandlerActiveStart: () => {
        const tool = getTool();
        const imageSrc = tool?.defaults.imageSrc;
        if (!imageSrc) return;

        let entry = imageFetchCache.get(imageSrc);
        if (!entry) {
          const promise = fetch(imageSrc)
            .then((res) => res.arrayBuffer())
            .then((buffer): CachedImage | null => {
              const meta = getImageMetadata(buffer);
              if (!meta || meta.mimeType === 'application/pdf') return null;
              const fitted = fitSizeWithin(meta, pageSize);
              const imageSize = tool.defaults.imageSize;
              return {
                buffer,
                width: imageSize?.width ?? fitted.width,
                height: imageSize?.height ?? fitted.height,
              };
            })
            .catch(() => null);
          entry = { promise, refs: 1 };
          imageFetchCache.set(imageSrc, entry);
        } else {
          entry.refs++;
        }

        entry.promise.then((result) => {
          if (!result) return;
          cachedBuffer = result.buffer;
          cachedSize = { width: result.width, height: result.height };
        });
      },

      onHandlerActiveEnd: () => {
        const tool = getTool();
        const imageSrc = tool?.defaults.imageSrc;
        if (imageSrc) {
          const entry = imageFetchCache.get(imageSrc);
          if (entry && --entry.refs <= 0) {
            imageFetchCache.delete(imageSrc);
          }
        }
        cachedBuffer = null;
        cachedSize = null;
        onPreview(null);
      },

      onPointerMove: (pos) => {
        const tool = getTool();
        if (!tool?.behavior?.showGhost || !cachedSize || !tool.defaults.imageSrc) return;

        const rect: Rect = {
          origin: { x: pos.x - cachedSize.width / 2, y: pos.y - cachedSize.height / 2 },
          size: cachedSize,
        };

        onPreview({
          type: PdfAnnotationSubtype.STAMP,
          bounds: rect,
          data: { rect, ghostUrl: tool.defaults.imageSrc, pageRotation },
        });
      },

      onPointerDown: (pos) => {
        const tool = getTool();
        if (!tool) return;

        const { imageSrc, imageSize } = tool.defaults;

        if (imageSrc) {
          onPreview(null);
          if (cachedBuffer) {
            commitFromBuffer(pos, cachedBuffer, imageSize);
          } else {
            fetch(imageSrc)
              .then((res) => res.arrayBuffer())
              .then((buffer) => commitFromBuffer(pos, buffer, imageSize));
          }
        } else {
          services.requestFile({
            accept: 'image/png,image/jpeg',
            onFile: (file) => {
              file.arrayBuffer().then((buffer) => commitFromBuffer(pos, buffer));
            },
          });
        }
      },

      onPointerLeave: () => {
        onPreview(null);
      },
    };
  },
};
