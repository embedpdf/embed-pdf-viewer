import { Fragment, useEffect, useRef, useState } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';

import { ignore, PdfErrorCode } from '@embedpdf/models';

import { useRenderCapability } from '../hooks/use-render';

type RenderLayerProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  pageIndex: number;
  scaleFactor?: number;
  dpr?: number;
  style?: CSSProperties;
};

export function RenderLayer({
  pageIndex,
  scaleFactor = 1,
  dpr = 1,
  style,
  ...props
}: RenderLayerProps) {
  const { provides: renderProvides } = useRenderCapability();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (renderProvides) {
      const task = renderProvides.renderPage({ pageIndex, scaleFactor, dpr });
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
  }, [pageIndex, scaleFactor, dpr, renderProvides]);

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
            ...(style || {}),
          }}
        />
      )}
    </Fragment>
  );
}
