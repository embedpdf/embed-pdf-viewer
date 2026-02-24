import { useEffect, useMemo, useState } from '@framework';
import { Rect, Rotation } from '@embedpdf/models';
import { useSelectionPlugin } from '../hooks';
import { useDocumentState } from '@embedpdf/core/@framework';
import { SelectionMenuPlacement } from '@embedpdf/plugin-selection';
import { SelectionSelectionMenuRenderFn } from '../types';
import { CounterRotate } from '@embedpdf/utils/@framework';

type TextSelectionProps = {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: Rotation;
  /** Background color for text selection highlights. Default: 'rgba(33,150,243)' */
  background?: string;
  selectionMenu?: SelectionSelectionMenuRenderFn;
};

/**
 * TextSelection renders text selection highlight rects and the selection menu.
 * It registers the text selection handler on the page and subscribes to menu
 * placement changes.
 *
 * Use this component directly for advanced cases, or use `SelectionLayer`
 * which composes both `TextSelection` and `MarqueeSelection`.
 */
export function TextSelection({
  documentId,
  pageIndex,
  scale: scaleOverride,
  rotation: rotationOverride,
  background = 'rgba(33,150,243)',
  selectionMenu,
}: TextSelectionProps) {
  const { plugin: selPlugin } = useSelectionPlugin();
  const documentState = useDocumentState(documentId);
  const page = documentState?.document?.pages?.[pageIndex];
  const [rects, setRects] = useState<Rect[]>([]);
  const [boundingRect, setBoundingRect] = useState<Rect | null>(null);

  // Store the placement object from the plugin
  const [placement, setPlacement] = useState<SelectionMenuPlacement | null>(null);

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

  useEffect(() => {
    if (!selPlugin || !documentId) return;

    // Subscribe to menu placement changes for this specific document
    return selPlugin.onMenuPlacement(documentId, (newPlacement) => {
      setPlacement(newPlacement);
    });
  }, [selPlugin, documentId]);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  const actualRotation = useMemo(() => {
    if (rotationOverride !== undefined) return rotationOverride;
    // Combine page intrinsic rotation with document rotation
    const pageRotation = page?.rotation ?? 0;
    const docRotation = documentState?.rotation ?? 0;
    return ((pageRotation + docRotation) % 4) as Rotation;
  }, [rotationOverride, page?.rotation, documentState?.rotation]);

  const shouldRenderMenu =
    selectionMenu && placement && placement.pageIndex === pageIndex && placement.isVisible;

  if (!boundingRect) return null;

  return (
    <>
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
      {shouldRenderMenu && (
        <CounterRotate
          rect={{
            origin: {
              x: placement.rect.origin.x * actualScale,
              y: placement.rect.origin.y * actualScale,
            },
            size: {
              width: placement.rect.size.width * actualScale,
              height: placement.rect.size.height * actualScale,
            },
          }}
          rotation={actualRotation}
        >
          {(props) =>
            selectionMenu({
              ...props,
              context: {
                type: 'selection',
                pageIndex,
              },
              selected: true,
              placement,
            })
          }
        </CounterRotate>
      )}
    </>
  );
}
