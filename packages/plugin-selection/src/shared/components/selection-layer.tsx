import { useEffect, useMemo, useState } from '@framework';
import { Rect } from '@embedpdf/models';
import { useSelectionPlugin } from '../hooks';
import { useDocumentState } from '@embedpdf/core/@framework';

type Props = {
  documentId: string;
  pageIndex: number;
  scale?: number;
  background?: string;
};

export function SelectionLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  background = 'rgba(33,150,243)',
}: Props) {
  const { plugin: selPlugin } = useSelectionPlugin();
  const documentState = useDocumentState(documentId);
  const [rects, setRects] = useState<Rect[]>([]);
  const [boundingRect, setBoundingRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selPlugin || !documentId) return;

    return selPlugin.registerSelectionOnPage({
      documentId,
      pageIndex,
      onRectsChange: ({ rects, boundingRect }) => {
        setRects(rects);
        setBoundingRect(boundingRect);
      },
    });
  }, [selPlugin, documentId, pageIndex]);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  if (!boundingRect) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: boundingRect.origin.x * actualScale,
        top: boundingRect.origin.y * actualScale,
        width: boundingRect.size.width * actualScale,
        height: boundingRect.size.height * actualScale,
        mixBlendMode: 'multiply',
        isolation: 'isolate',
        pointerEvents: 'none',
      }}
    >
      {rects.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (b.origin.x - boundingRect.origin.x) * actualScale,
            top: (b.origin.y - boundingRect.origin.y) * actualScale,
            width: b.size.width * actualScale,
            height: b.size.height * actualScale,
            background,
          }}
        />
      ))}
    </div>
  );
}
