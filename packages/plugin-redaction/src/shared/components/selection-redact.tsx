import { Rect } from '@embedpdf/models';
import { useEffect, useState } from '@framework';
import { useRedactionPlugin } from '../hooks';
import { Highlight } from './highlight';

interface SelectionRedactProps {
  documentId: string;
  pageIndex: number;
  scale: number;
}

export function SelectionRedact({ documentId, pageIndex, scale }: SelectionRedactProps) {
  const { plugin: redactionPlugin } = useRedactionPlugin();
  const [rects, setRects] = useState<Array<Rect>>([]);
  const [boundingRect, setBoundingRect] = useState<Rect | null>(null);

  // Get stroke color from plugin (annotation mode uses tool defaults, legacy uses red)
  const strokeColor = redactionPlugin?.getPreviewStrokeColor() ?? 'red';

  useEffect(() => {
    if (!redactionPlugin) return;
    return redactionPlugin.onRedactionSelectionChange(documentId, (formattedSelection) => {
      const selection = formattedSelection.find((s) => s.pageIndex === pageIndex);
      setRects(selection?.segmentRects ?? []);
      setBoundingRect(selection?.rect ?? null);
    });
  }, [redactionPlugin, documentId, pageIndex]);

  if (!boundingRect) return null;

  return (
    <div
      style={{
        mixBlendMode: 'normal',
        pointerEvents: 'none',
        position: 'absolute',
        inset: 0,
      }}
    >
      <Highlight
        color={'transparent'}
        opacity={1}
        rects={rects}
        scale={scale}
        border={`1px solid ${strokeColor}`}
      />
    </div>
  );
}
