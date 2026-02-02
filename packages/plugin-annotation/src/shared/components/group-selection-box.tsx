import { Rect, boundingRectOrEmpty } from '@embedpdf/models';
import { useInteractionHandles, CounterRotate } from '@embedpdf/utils/@framework';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useState, useMemo, useCallback, useRef, useEffect } from '@framework';
import { useDocumentPermissions } from '@embedpdf/core/@framework';

import { useAnnotationPlugin } from '../hooks';
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
  outlineOffset = 2,
  zIndex = 100,
  groupSelectionMenu,
}: GroupSelectionBoxProps): JSX.Element | null {
  const { plugin } = useAnnotationPlugin();
  const { canModifyAnnotations } = useDocumentPermissions(documentId);
  const gestureBaseRef = useRef<Rect | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);

  // Check permissions before allowing drag/resize
  const effectiveIsDraggable = canModifyAnnotations && isDraggable;
  const effectiveIsResizable = canModifyAnnotations && isResizable;

  // Compute the group bounding box from all selected annotations
  const groupBox = useMemo(() => {
    const rects = selectedAnnotations.map((ta) => ta.object.rect);
    return boundingRectOrEmpty(rects);
  }, [selectedAnnotations]);

  // Preview state for the group box during drag/resize
  const [previewGroupBox, setPreviewGroupBox] = useState<Rect>(groupBox);

  // Sync preview with actual group box when not dragging/resizing
  useEffect(() => {
    if (!isDraggingRef.current && !isResizingRef.current) {
      setPreviewGroupBox(groupBox);
    }
  }, [groupBox]);

  // Handle both drag and resize updates using unified plugin API
  // The plugin handles attached links automatically and commits all patches
  const handleUpdate = useCallback(
    (
      event: Parameters<
        NonNullable<Parameters<typeof useInteractionHandles>[0]['controller']['onUpdate']>
      >[0],
    ) => {
      if (!event.transformData?.type) return;
      if (!plugin) return;

      const transformType = event.transformData.type;
      const isMove = transformType === 'move';
      const isResize = transformType === 'resize';

      // Skip drag operations if group is not draggable
      if (isMove && !effectiveIsDraggable) return;

      if (event.state === 'start') {
        gestureBaseRef.current = groupBox;

        if (isMove) {
          isDraggingRef.current = true;
          // Use unified drag API - plugin handles attached links automatically
          plugin.startDrag(documentId, {
            annotationIds: selectedAnnotations.map((ta) => ta.object.id),
            pageSize: { width: pageWidth, height: pageHeight },
          });
        } else if (isResize) {
          isResizingRef.current = true;
          // Use unified resize API - plugin handles attached links automatically
          plugin.startResize(documentId, {
            annotationIds: selectedAnnotations.map((ta) => ta.object.id),
            pageSize: { width: pageWidth, height: pageHeight },
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

        // Plugin clamps delta and emits events (attached links receive updates too)
        const clampedDelta = plugin.updateDrag(documentId, rawDelta);

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

        // Plugin computes rects for all participants and emits events
        plugin.updateResize(documentId, newGroupBox);

        // Update preview
        setPreviewGroupBox(newGroupBox);
      }

      if (event.state === 'end') {
        gestureBaseRef.current = null;

        if (isMove && isDraggingRef.current) {
          isDraggingRef.current = false;
          // Plugin commits all patches (selected + attached links) - no patch building needed!
          plugin.commitDrag(documentId);
        } else if (isResize && isResizingRef.current) {
          isResizingRef.current = false;
          // Plugin commits all patches (selected + attached links) - no patch building needed!
          plugin.commitResize(documentId);
        }
      }
    },
    [
      plugin,
      documentId,
      pageWidth,
      pageHeight,
      groupBox,
      effectiveIsDraggable,
      selectedAnnotations,
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
    <div data-group-selection-box data-no-interaction>
      {/* Group box - draggable only if effectiveIsDraggable is true */}
      <div
        {...(effectiveIsDraggable
          ? dragProps
          : {
              onPointerDown: (e) => e.stopPropagation(),
            })}
        style={{
          position: 'absolute',
          left: previewGroupBox.origin.x * scale,
          top: previewGroupBox.origin.y * scale,
          width: previewGroupBox.size.width * scale,
          height: previewGroupBox.size.height * scale,
          outline: `2px dashed ${selectionOutlineColor}`,
          outlineOffset: outlineOffset - 1,
          cursor: effectiveIsDraggable ? 'move' : 'default',
          touchAction: 'none',
          zIndex,
        }}
      >
        {/* Resize handles */}
        {effectiveIsResizable &&
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
