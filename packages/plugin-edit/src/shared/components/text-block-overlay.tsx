import { useEffect, useRef, useState, useMemo, Fragment } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';
import { ignore, PdfErrorCode, PdfTextBlock, Position } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/@framework';
import { useEditCapability } from '../hooks/use-edit';

type TextBlockOverlayProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  block: PdfTextBlock;
  isSelected: boolean;
  offset: Position | null;
  scale?: number;
  style?: CSSProperties;
  onSelect?: () => void;
};

export function TextBlockOverlay({
  documentId,
  pageIndex,
  blockIndex,
  block,
  isSelected,
  offset,
  scale: scaleOverride,
  style,
  onSelect,
  ...props
}: TextBlockOverlayProps) {
  const { provides: editCapability } = useEditCapability();
  const documentState = useDocumentState(documentId);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  // Calculate position with offset
  const position = useMemo(() => {
    const baseX = block.inkBounds.origin.x * actualScale;
    const baseY = block.inkBounds.origin.y * actualScale;
    return {
      left: baseX + (offset?.x ?? 0) * actualScale,
      top: baseY + (offset?.y ?? 0) * actualScale,
      width: block.inkBounds.size.width * actualScale,
      height: block.inkBounds.size.height * actualScale,
    };
  }, [block.inkBounds, actualScale, offset]);

  useEffect(() => {
    if (!editCapability) return;

    const scope = editCapability.forDocument(documentId);
    const task = scope.renderTextBlock(pageIndex, {
      blockIndex,
      scale: actualScale,
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
          message: 'canceled text block render task',
        });
      }
    };
  }, [documentId, pageIndex, blockIndex, actualScale, editCapability]);

  const handleImageLoad = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const handleClick = () => {
    onSelect?.();
  };

  return (
    <div
      {...props}
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
        cursor: 'pointer',
        outline: isSelected ? '2px solid #2196F3' : 'none',
        outlineOffset: '2px',
        ...(style || {}),
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          onLoad={handleImageLoad}
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
