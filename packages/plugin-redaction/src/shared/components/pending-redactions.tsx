import { Fragment, useEffect, useState, useCallback, MouseEvent, TouchEvent } from '@framework';
import { CounterRotate } from '@embedpdf/utils/@framework';
import { useRedactionCapability } from '../hooks';
import { RedactionItem } from '@embedpdf/plugin-redaction';
import { Highlight } from './highlight';
import { RedactionSelectionMenuRenderFn } from './types';
import { Rotation } from '@embedpdf/models';

interface PendingRedactionsProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: Rotation;
  bboxStroke?: string;
  selectionMenu?: RedactionSelectionMenuRenderFn;
}

export function PendingRedactions({
  documentId,
  pageIndex,
  scale,
  bboxStroke = 'rgba(0,0,0,0.8)',
  rotation = Rotation.Degree0,
  selectionMenu,
}: PendingRedactionsProps) {
  const { provides: redaction } = useRedactionCapability();
  const [items, setItems] = useState<RedactionItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!redaction) return;

    // Use document-scoped hooks so we only receive events for this document
    const scoped = redaction.forDocument(documentId);

    // Initialize with current state - only show legacy mode items
    const currentState = scoped.getState();
    setItems((currentState.pending[pageIndex] ?? []).filter((it) => it.source === 'legacy'));
    setSelectedId(
      currentState.selected && currentState.selected.page === pageIndex
        ? currentState.selected.id
        : null,
    );

    // Subscribe to future changes - only show legacy mode items
    const off1 = scoped.onPendingChange((map) => {
      setItems((map[pageIndex] ?? []).filter((it) => it.source === 'legacy'));
    });
    const off2 = scoped.onSelectedChange((sel) => {
      setSelectedId(sel && sel.page === pageIndex ? sel.id : null);
    });

    return () => {
      off1?.();
      off2?.();
    };
  }, [redaction, documentId, pageIndex]);

  const select = useCallback(
    (e: MouseEvent | TouchEvent, id: string) => {
      e.stopPropagation();
      if (!redaction) return;
      redaction.forDocument(documentId).selectPending(pageIndex, id);
    },
    [redaction, documentId, pageIndex],
  );

  if (!items.length) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {items.map((it) => {
        if (it.kind === 'area') {
          const r = it.rect;
          return (
            <Fragment key={it.id}>
              <div
                style={{
                  position: 'absolute',
                  left: r.origin.x * scale,
                  top: r.origin.y * scale,
                  width: r.size.width * scale,
                  height: r.size.height * scale,
                  background: 'transparent',
                  outline: selectedId === it.id ? `1px solid ${bboxStroke}` : 'none',
                  outlineOffset: '2px',
                  border: `1px solid ${it.markColor}`,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
                onPointerDown={(e) => select(e, it.id)}
                onTouchStart={(e) => select(e, it.id)}
              />
              {selectionMenu && (
                <CounterRotate
                  rect={{
                    origin: { x: r.origin.x * scale, y: r.origin.y * scale },
                    size: { width: r.size.width * scale, height: r.size.height * scale },
                  }}
                  rotation={rotation}
                >
                  {(props) =>
                    selectionMenu({
                      ...props,
                      context: {
                        type: 'redaction',
                        item: it,
                        pageIndex,
                      },
                      selected: selectedId === it.id,
                      placement: {
                        suggestTop: false,
                      },
                    })
                  }
                </CounterRotate>
              )}
            </Fragment>
          );
        }

        const b = it.rect;
        return (
          <Fragment key={it.id}>
            <div
              style={{
                position: 'absolute',
                left: b.origin.x * scale,
                top: b.origin.y * scale,
                width: b.size.width * scale,
                height: b.size.height * scale,
                background: 'transparent',
                outline: selectedId === it.id ? `1px solid ${bboxStroke}` : 'none',
                outlineOffset: '2px',
                pointerEvents: 'auto',
                cursor: selectedId === it.id ? 'pointer' : 'default',
              }}
            >
              <Highlight
                rect={b}
                rects={it.rects}
                color="transparent"
                border={`1px solid ${it.markColor}`}
                scale={scale}
                onClick={(e) => select(e, it.id)}
              />
            </div>
            {selectionMenu && (
              <CounterRotate
                rect={{
                  origin: { x: b.origin.x * scale, y: b.origin.y * scale },
                  size: { width: b.size.width * scale, height: b.size.height * scale },
                }}
                rotation={rotation}
              >
                {(props) =>
                  selectionMenu({
                    ...props,
                    context: {
                      type: 'redaction',
                      item: it,
                      pageIndex,
                    },
                    selected: selectedId === it.id,
                    placement: {
                      suggestTop: false,
                    },
                  })
                }
              </CounterRotate>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
