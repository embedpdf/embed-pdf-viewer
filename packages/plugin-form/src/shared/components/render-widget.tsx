import { Fragment, HTMLAttributes, CSSProperties, useEffect, useRef, useState } from '@framework';
import { ignore, PdfErrorCode, PdfWidgetAnnoObject } from '@embedpdf/models';

import { useFormCapability } from '../hooks/use-form';

type RenderWidgetProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  pageIndex: number;
  annotation: PdfWidgetAnnoObject;
  scaleFactor?: number;
  dpr?: number;
  renderKey?: number;
  style?: CSSProperties;
};

export function RenderWidget({
  pageIndex,
  annotation,
  scaleFactor = 1,
  renderKey = 0,
  style,
  ...props
}: RenderWidgetProps) {
  const { provides: formProvides } = useFormCapability();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const { width, height } = annotation.rect.size;

  useEffect(() => {
    if (!formProvides) return;

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
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
      urlRef.current = url;
      setImageUrl(url);
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
    };
  }, [pageIndex, scaleFactor, formProvides, annotation.id, width, height, renderKey]);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  return (
    <Fragment>
      {imageUrl && (
        <img
          src={imageUrl}
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
