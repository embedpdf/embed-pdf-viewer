import { useEffect, useRef, useState, useMemo, Fragment } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';
import { ignore, PdfErrorCode, PdfLayoutDebugFlag } from '@embedpdf/models';
import { useEditCapability } from '../hooks/use-edit';

type DebugOverlayProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: number;
  /** Which debug elements to show */
  debugFlags?: PdfLayoutDebugFlag;
  style?: CSSProperties;
};

// Default: show all debug elements
const DEFAULT_DEBUG_FLAGS =
  PdfLayoutDebugFlag.ShowWords |
  PdfLayoutDebugFlag.ShowLines |
  PdfLayoutDebugFlag.ShowColumns |
  PdfLayoutDebugFlag.ShowGutters |
  PdfLayoutDebugFlag.ShowTables |
  PdfLayoutDebugFlag.ShowBlocks |
  PdfLayoutDebugFlag.ShowReadingOrder;

export function DebugOverlay({
  documentId,
  pageIndex,
  scale = 1,
  rotation = 0,
  debugFlags = DEFAULT_DEBUG_FLAGS,
  style,
  ...props
}: DebugOverlayProps) {
  const { provides: editCapability } = useEditCapability();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editCapability) return;

    const scope = editCapability.forDocument(documentId);
    const task = scope.renderDebugOverlay(pageIndex, {
      scale,
      rotation,
      debugFlags,
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
          message: 'canceled debug overlay render task',
        });
      }
    };
  }, [documentId, pageIndex, scale, rotation, debugFlags, editCapability]);

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
