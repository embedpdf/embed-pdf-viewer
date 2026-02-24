import { Fragment, HTMLAttributes, CSSProperties, useEffect, useRef, useState } from '@framework';
import { AppearanceMode, ignore, PdfAnnotationObject, PdfErrorCode } from '@embedpdf/models';

import { useAnnotationCapability } from '../hooks/use-annotation';

type RenderAnnotationProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  annotation: PdfAnnotationObject;
  scaleFactor?: number;
  dpr?: number;
  style?: CSSProperties;
  unrotated?: boolean;
};

export function RenderAnnotation({
  documentId,
  pageIndex,
  annotation,
  scaleFactor = 1,
  unrotated,
  style,
  ...props
}: RenderAnnotationProps) {
  const { provides: annotationProvides } = useAnnotationCapability();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const { width, height } = annotation.rect.size;

  useEffect(() => {
    if (annotationProvides) {
      const task = annotationProvides.forDocument(documentId).renderAnnotation({
        pageIndex,
        annotation,
        options: {
          scaleFactor,
          dpr: window.devicePixelRatio,
          unrotated,
        },
      });
      task.wait((blob) => {
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
        urlRef.current = url;
      }, ignore);

      return () => {
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        } else {
          task.abort({
            code: PdfErrorCode.Cancelled,
            message: 'canceled render task',
          });
        }
      };
    }
  }, [
    pageIndex,
    scaleFactor,
    unrotated,
    annotationProvides,
    documentId,
    annotation.id,
    width,
    height,
  ]);

  const handleImageLoad = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  return (
    <Fragment>
      {imageUrl && (
        <img
          src={imageUrl}
          onLoad={handleImageLoad}
          {...props}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            ...(style || {}),
          }}
        />
      )}
    </Fragment>
  );
}
