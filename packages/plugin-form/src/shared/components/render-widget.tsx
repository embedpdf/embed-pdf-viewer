import { Fragment, HTMLAttributes, CSSProperties, useEffect, useRef, useState } from '@framework';
import { ignore, PdfErrorCode, PdfWidgetAnnoObject } from '@embedpdf/models';

import { useFormCapability } from '../hooks/use-form';

type RenderWidgetProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  pageIndex: number;
  annotation: PdfWidgetAnnoObject;
  scaleFactor?: number;
  dpr?: number;
  style?: CSSProperties;
};

export function RenderWidget({
  pageIndex,
  annotation,
  scaleFactor = 1,
  style,
  ...props
}: RenderWidgetProps) {
  const { provides: formProvides } = useFormCapability();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const { width, height } = annotation.rect.size;

  useEffect(() => {
    if (formProvides) {
      const task = formProvides.renderWidget({
        pageIndex,
        annotation,
        options: {
          scaleFactor,
          dpr: window.devicePixelRatio,
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
  }, [pageIndex, scaleFactor, formProvides, annotation.id, width, height]);

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
