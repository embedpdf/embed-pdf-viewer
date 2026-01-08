import { useEffect, useRef, useState, useMemo, Fragment } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/@framework';
import { useEditCapability } from '../hooks/use-edit';

type BackgroundLayerProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  scale?: number;
  style?: CSSProperties;
};

export function BackgroundLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  style,
  ...props
}: BackgroundLayerProps) {
  const { provides: editCapability } = useEditCapability();
  const documentState = useDocumentState(documentId);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  useEffect(() => {
    if (!editCapability) return;

    const scope = editCapability.forDocument(documentId);
    const task = scope.renderBackground(pageIndex, { scale: actualScale });

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
          message: 'canceled background render task',
        });
      }
    };
  }, [documentId, pageIndex, actualScale, editCapability]);

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
            pointerEvents: 'none',
            ...(style || {}),
          }}
        />
      )}
    </Fragment>
  );
}
