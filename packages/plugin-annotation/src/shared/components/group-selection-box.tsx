import { Rect, Size } from '@embedpdf/models';
import { useInteractionHandles, CounterRotate } from '@embedpdf/utils/@framework';
import { TrackedAnnotation, AnnotationConstraintInfo } from '@embedpdf/plugin-annotation';
import { useState, useMemo, useCallback, useRef, useEffect } from '@framework';

import { useAnnotationPlugin, useAnnotationCapability } from '../hooks';
import { ResizeHandleUI, GroupSelectionMenuRenderFn } from './types';

interface GroupSelectionBoxProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  /** All selected annotations on this page */
  selectedAnnotations: TrackedAnnotation[];
  /** Whether the group is draggable (all annotations must be group-draggable) */
  isDraggable: boolean;
  /** Whether the group is resizable (all annotations must be group-resizable) */
  isResizable: boolean;
  /** Resize handle UI customization */
  resizeUI?: ResizeHandleUI;
  /** Selection outline color */
  selectionOutlineColor?: string;
  /** Outline offset */
  outlineOffset?: number;
  /** Z-index for the group box */
  zIndex?: number;
  /** Group selection menu render function */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
}

/**
 * Compute the union bounding box of multiple rects.
 */
function computeGroupBoundingBox(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rect of rects) {
    minX = Math.min(minX, rect.origin.x);
    minY = Math.min(minY, rect.origin.y);
    maxX = Math.max(maxX, rect.origin.x + rect.size.width);
    maxY = Math.max(maxY, rect.origin.y + rect.size.height);
  }

  return {
    origin: { x: minX, y: minY },
    size: { width: maxX - minX, height: maxY - minY },
  };
}

/**
 * GroupSelectionBox renders a bounding box around all selected annotations
 * with drag and resize handles for group manipulation.
 */
export function GroupSelectionBox({
  documentId,
  pageIndex,
  scale,
  rotation,
  pageWidth,
  pageHeight,
  selectedAnnotations,
  isDraggable,
  isResizable,
  resizeUI,
  selectionOutlineColor = '#007ACC',
  outlineOffset = 1,
  zIndex = 100,
  groupSelectionMenu,
}: GroupSelectionBoxProps): JSX.Element | null {
  const { plugin } = useAnnotationPlugin();
  const { provides: annotationCapability } = useAnnotationCapability();
  const gestureBaseRef = useRef<Rect | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);

  // Compute the group bounding box from all selected annotations
  const groupBox = useMemo(() => {
    const rects = selectedAnnotations.map((ta) => ta.object.rect);
    return computeGroupBoundingBox(rects);
  }, [selectedAnnotations]);

  // Preview state for the group box during drag/resize
  const [previewGroupBox, setPreviewGroupBox] = useState<Rect>(groupBox);

  // Sync preview with actual group box when not dragging/resizing
  useEffect(() => {
    if (!isDraggingRef.current && !isResizingRef.current) {
      setPreviewGroupBox(groupBox);
    }
  }, [groupBox]);

  // Get scoped API for this document
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  // Build constraint info for all selected annotations
  const buildConstraints = useCallback((): AnnotationConstraintInfo[] => {
    const pageSize: Size = { width: pageWidth, height: pageHeight };
    return selectedAnnotations.map((ta) => ({
      id: ta.object.id,
      rect: ta.object.rect,
      pageIndex: ta.object.pageIndex,
      pageSize,
    }));
  }, [selectedAnnotations, pageWidth, pageHeight]);

  // Handle both drag and resize updates
  const handleUpdate = useCallback(
    (
      event: Parameters<
        NonNullable<Parameters<typeof useInteractionHandles>[0]['controller']['onUpdate']>
      >[0],
    ) => {
      if (!event.transformData?.type) return;
      if (!plugin || !annotationCapability) return;

      const transformType = event.transformData.type;
      const isMove = transformType === 'move';
      const isResize = transformType === 'resize';

      // Skip drag operations if group is not draggable
      if (isMove && !isDraggable) return;

      if (event.state === 'start') {
        gestureBaseRef.current = groupBox;

        if (isMove) {
          isDraggingRef.current = true;
          // Start multi-drag with constraints
          const constraints = buildConstraints();
          plugin.startMultiDrag(documentId, selectedAnnotations[0]?.object.id ?? '', constraints);
        } else if (isResize) {
          isResizingRef.current = true;
          // Start multi-resize with all selected annotations
          const annotations = selectedAnnotations.map((ta) => ({
            id: ta.object.id,
            rect: ta.object.rect,
          }));
          plugin.startMultiResize({
            documentId,
            pageIndex,
            annotations,
            resizeHandle: event.transformData.metadata?.handle ?? 'se',
          });
        }
      }

      const base = gestureBaseRef.current ?? groupBox;

      if (isMove && event.transformData.changes.rect) {
        // Calculate delta from original position
        const newRect = event.transformData.changes.rect;
        const rawDelta = {
          x: newRect.origin.x - base.origin.x,
          y: newRect.origin.y - base.origin.y,
        };

        // Update plugin and get clamped delta
        const clampedDelta = plugin.updateMultiDrag(documentId, rawDelta);

        // Update preview group box with clamped delta
        setPreviewGroupBox({
          ...base,
          origin: {
            x: base.origin.x + clampedDelta.x,
            y: base.origin.y + clampedDelta.y,
          },
        });
      } else if (isResize && event.transformData.changes.rect) {
        const newGroupBox = event.transformData.changes.rect;

        // Update plugin
        plugin.updateMultiResize(documentId, newGroupBox);

        // Update preview
        setPreviewGroupBox(newGroupBox);
      }

      if (event.state === 'end') {
        gestureBaseRef.current = null;

        if (isMove && isDraggingRef.current) {
          isDraggingRef.current = false;

          // End multi-drag and get final delta
          const finalDelta = plugin.endMultiDrag(documentId);

          if (finalDelta.x !== 0 || finalDelta.y !== 0) {
            // Build patches for all selected annotations
            const patches = selectedAnnotations.map((ta) => {
              const newRect: Rect = {
                ...ta.object.rect,
                origin: {
                  x: ta.object.rect.origin.x + finalDelta.x,
                  y: ta.object.rect.origin.y + finalDelta.y,
                },
              };

              // Use transformAnnotation to get proper patch (handles vertices, inkList, etc.)
              const patch = annotationCapability.transformAnnotation(ta.object, {
                type: 'move',
                changes: { rect: newRect },
              });

              return {
                pageIndex: ta.object.pageIndex,
                id: ta.object.id,
                patch,
              };
            });

            if (patches.length > 0) {
              annotationProvides?.updateAnnotations(patches);
            }
          }
        } else if (isResize && isResizingRef.current) {
          isResizingRef.current = false;

          // End multi-resize and get final rects
          const finalRects = plugin.endMultiResize(documentId);

          // Build patches for all selected annotations
          const patches = Object.entries(finalRects).map(([id, newRect]) => {
            const anno = selectedAnnotations.find((ta) => ta.object.id === id);
            if (!anno) {
              return { pageIndex, id, patch: { rect: newRect } };
            }

            // Use transformAnnotation to get proper patch
            const patch = annotationCapability.transformAnnotation(anno.object, {
              type: 'resize',
              changes: { rect: newRect },
            });

            return {
              pageIndex: anno.object.pageIndex,
              id,
              patch,
            };
          });

          if (patches.length > 0) {
            annotationProvides?.updateAnnotations(patches);
          }
        }
      }
    },
    [
      plugin,
      annotationCapability,
      documentId,
      pageIndex,
      groupBox,
      isDraggable,
      selectedAnnotations,
      annotationProvides,
      buildConstraints,
    ],
  );

  // UI constants
  const HANDLE_COLOR = resizeUI?.color ?? '#007ACC';
  const HANDLE_SIZE = resizeUI?.size ?? 12;

  // Use interaction handles for both drag and resize
  const { dragProps, resize } = useInteractionHandles({
    controller: {
      element: previewGroupBox,
      constraints: {
        minWidth: 20,
        minHeight: 20,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: false,
      pageRotation: rotation,
      scale: scale,
      enabled: true,
      onUpdate: handleUpdate,
    },
    resizeUI: {
      handleSize: HANDLE_SIZE,
      spacing: outlineOffset,
      offsetMode: 'outside',
      includeSides: true,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: 0,
      zIndex: zIndex,
    },
    includeVertices: false,
  });

  // Don't render if less than 2 annotations selected
  if (selectedAnnotations.length < 2) {
    return null;
  }

  return (
    <div data-group-selection-box>
      {/* Group box - draggable only if isDraggable is true */}
      <div
        {...(isDraggable ? dragProps : {})}
        style={{
          position: 'absolute',
          left: previewGroupBox.origin.x * scale,
          top: previewGroupBox.origin.y * scale,
          width: previewGroupBox.size.width * scale,
          height: previewGroupBox.size.height * scale,
          outline: `2px dashed ${selectionOutlineColor}`,
          outlineOffset: `${outlineOffset + 2}px`,
          cursor: isDraggable ? 'move' : 'default',
          touchAction: 'none',
          zIndex,
        }}
      >
        {/* Resize handles */}
        {isResizable &&
          resize.map(({ key, ...hProps }) =>
            resizeUI?.component ? (
              resizeUI.component({
                key,
                ...hProps,
                backgroundColor: HANDLE_COLOR,
              })
            ) : (
              <div
                key={key}
                {...hProps}
                style={{ ...hProps.style, backgroundColor: HANDLE_COLOR }}
              />
            ),
          )}
      </div>

      {/* Group selection menu */}
      {groupSelectionMenu && (
        <CounterRotate
          rect={{
            origin: {
              x: previewGroupBox.origin.x * scale,
              y: previewGroupBox.origin.y * scale,
            },
            size: {
              width: previewGroupBox.size.width * scale,
              height: previewGroupBox.size.height * scale,
            },
          }}
          rotation={rotation}
        >
          {(counterRotateProps) =>
            groupSelectionMenu({
              ...counterRotateProps,
              context: {
                type: 'group',
                annotations: selectedAnnotations,
                pageIndex,
              },
              selected: true,
              placement: {
                suggestTop: false,
              },
            })
          }
        </CounterRotate>
      )}
    </div>
  );
}
