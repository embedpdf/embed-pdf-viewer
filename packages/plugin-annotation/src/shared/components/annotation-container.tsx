import { PdfAnnotationObject } from '@embedpdf/models';
import {
  CounterRotate,
  useDoublePressProps,
  useInteractionHandles,
} from '@embedpdf/utils/@framework';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useState, JSX, CSSProperties, useRef, useEffect, useMemo, useCallback } from '@framework';
import { useDocumentPermissions } from '@embedpdf/core/@framework';

import { useAnnotationCapability, useAnnotationPlugin } from '../hooks';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  AnnotationSelectionMenuRenderFn,
  VertexHandleUI,
} from './types';
import { VertexConfig } from '../types';

interface AnnotationContainerProps<T extends PdfAnnotationObject> {
  scale: number;
  documentId: string;
  pageIndex: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  trackedAnnotation: TrackedAnnotation<T>;
  children: JSX.Element | ((annotation: T) => JSX.Element);
  isSelected: boolean;
  /** Whether multiple annotations are selected (container becomes passive) */
  isMultiSelected?: boolean;
  isDraggable: boolean;
  isResizable: boolean;
  lockAspectRatio?: boolean;
  style?: CSSProperties;
  vertexConfig?: VertexConfig<T>;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  outlineOffset?: number;
  onDoubleClick?: (event: any) => void;
  onSelect: (event: any) => void;
  zIndex?: number;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  selectionOutlineColor?: string;
  customAnnotationRenderer?: CustomAnnotationRenderer<T>;
}

/**
 * AnnotationContainer wraps individual annotations with interaction handles.
 * When isMultiSelected is true, the container becomes passive - drag/resize
 * is handled by the GroupSelectionBox instead.
 */
export function AnnotationContainer<T extends PdfAnnotationObject>({
  scale,
  documentId,
  pageIndex,
  rotation,
  pageWidth,
  pageHeight,
  trackedAnnotation,
  children,
  isSelected,
  isMultiSelected = false,
  isDraggable,
  isResizable,
  lockAspectRatio = false,
  style = {},
  vertexConfig,
  selectionMenu,
  outlineOffset = 1,
  onDoubleClick,
  onSelect,
  zIndex = 1,
  resizeUI,
  vertexUI,
  selectionOutlineColor = '#007ACC',
  customAnnotationRenderer,
  ...props
}: AnnotationContainerProps<T>): JSX.Element {
  const [preview, setPreview] = useState<T>(trackedAnnotation.object);
  const { provides: annotationCapability } = useAnnotationCapability();
  const { plugin } = useAnnotationPlugin();
  const { canModifyAnnotations } = useDocumentPermissions(documentId);
  const gestureBaseRef = useRef<T | null>(null);

  // When multi-selected, disable individual drag/resize - GroupSelectionBox handles it
  const effectiveIsDraggable = canModifyAnnotations && isDraggable && !isMultiSelected;
  const effectiveIsResizable = canModifyAnnotations && isResizable && !isMultiSelected;

  // Get scoped API for this document
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  const currentObject = preview
    ? { ...trackedAnnotation.object, ...preview }
    : trackedAnnotation.object;

  // UI constants
  const HANDLE_COLOR = resizeUI?.color ?? '#007ACC';
  const VERTEX_COLOR = vertexUI?.color ?? '#007ACC';
  const HANDLE_SIZE = resizeUI?.size ?? 12;
  const VERTEX_SIZE = vertexUI?.size ?? 12;

  // Handle single-annotation drag/resize (only when NOT multi-selected)
  const handleUpdate = useCallback(
    (
      event: Parameters<
        NonNullable<Parameters<typeof useInteractionHandles>[0]['controller']['onUpdate']>
      >[0],
    ) => {
      if (!event.transformData?.type) return;
      // Multi-select gestures are handled by GroupSelectionBox
      if (isMultiSelected) return;

      const transformType = event.transformData.type;

      if (event.state === 'start') {
        gestureBaseRef.current = currentObject;
      }

      const base = gestureBaseRef.current ?? currentObject;

      // Apply transform for preview
      const changes = event.transformData.changes.vertices
        ? vertexConfig?.transformAnnotation(base, event.transformData.changes.vertices)
        : { rect: event.transformData.changes.rect };

      const patched = annotationCapability?.transformAnnotation<T>(base, {
        type: transformType,
        changes: changes as Partial<T>,
        metadata: event.transformData.metadata,
      });

      if (patched) {
        setPreview((prev) => ({
          ...prev,
          ...patched,
        }));
      }

      if (event.state === 'end') {
        gestureBaseRef.current = null;

        // Commit the change - reuse patched from preview calculation
        if (patched) {
          annotationProvides?.updateAnnotation(pageIndex, trackedAnnotation.object.id, patched);
        }
      }
    },
    [
      isMultiSelected,
      currentObject,
      trackedAnnotation.object.id,
      annotationCapability,
      annotationProvides,
      pageIndex,
      vertexConfig,
    ],
  );

  const { dragProps, vertices, resize } = useInteractionHandles({
    controller: {
      element: currentObject.rect,
      vertices: vertexConfig?.extractVertices(currentObject),
      constraints: {
        minWidth: 10,
        minHeight: 10,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: lockAspectRatio,
      pageRotation: rotation,
      scale: scale,
      // Disable interaction handles when multi-selected
      enabled: isSelected && !isMultiSelected,
      onUpdate: handleUpdate,
    },
    resizeUI: {
      handleSize: HANDLE_SIZE,
      spacing: outlineOffset,
      offsetMode: 'outside',
      includeSides: lockAspectRatio ? false : true,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: VERTEX_SIZE,
      zIndex: zIndex + 2,
    },
    includeVertices: vertexConfig ? true : false,
  });

  // Wrap onDoubleClick to respect permissions
  const guardedOnDoubleClick = useMemo(() => {
    if (!canModifyAnnotations || !onDoubleClick) return undefined;
    return onDoubleClick;
  }, [canModifyAnnotations, onDoubleClick]);

  const doubleProps = useDoublePressProps(guardedOnDoubleClick);

  // Sync preview with tracked annotation when it changes
  useEffect(() => {
    setPreview(trackedAnnotation.object);
  }, [trackedAnnotation.object]);

  // Subscribe to multi-drag changes (for follower preview updates)
  useEffect(() => {
    if (!plugin || !isMultiSelected) return;

    const unsubscribe = plugin.onMultiDragChange((event) => {
      if (event.documentId !== documentId) return;

      const isParticipating = event.state.participatingIds.includes(trackedAnnotation.object.id);
      if (!isParticipating) return;

      if (event.type === 'update') {
        // Apply delta to preview using transformAnnotation for proper vertex handling
        const delta = event.state.delta;
        const newRect = {
          ...trackedAnnotation.object.rect,
          origin: {
            x: trackedAnnotation.object.rect.origin.x + delta.x,
            y: trackedAnnotation.object.rect.origin.y + delta.y,
          },
        };

        // Use transformAnnotation to properly update vertices (inkList, linePoints, etc.)
        const patched = annotationCapability?.transformAnnotation(trackedAnnotation.object, {
          type: 'move',
          changes: { rect: newRect } as Partial<T>,
        });

        if (patched) {
          setPreview((prev) => ({ ...prev, ...patched }));
        }
      } else if (event.type === 'cancel') {
        // Reset to original
        setPreview(trackedAnnotation.object);
      }
      // On 'end', keep preview - batch update will sync via trackedAnnotation.object
    });

    return unsubscribe;
  }, [plugin, documentId, isMultiSelected, trackedAnnotation.object, annotationCapability]);

  // Subscribe to multi-resize changes (for follower preview updates)
  useEffect(() => {
    if (!plugin || !isMultiSelected) return;

    const unsubscribe = plugin.onMultiResizeChange((event) => {
      if (event.documentId !== documentId) return;

      const newRect = event.computedRects[trackedAnnotation.object.id];
      if (!newRect) return;

      if (event.type === 'update') {
        // Use transformAnnotation to properly update vertices (inkList, linePoints, etc.)
        const patched = annotationCapability?.transformAnnotation(trackedAnnotation.object, {
          type: 'resize',
          changes: { rect: newRect } as Partial<T>,
        });

        if (patched) {
          setPreview((prev) => ({ ...prev, ...patched }));
        }
      } else if (event.type === 'cancel') {
        setPreview(trackedAnnotation.object);
      }
      // On 'end', keep preview - batch update will sync via trackedAnnotation.object
    });

    return unsubscribe;
  }, [plugin, documentId, isMultiSelected, trackedAnnotation.object, annotationCapability]);

  // Determine if we should show the outline
  // When multi-selected, don't show individual outlines - GroupSelectionBox shows the group outline
  const showOutline = isSelected && !isMultiSelected;

  return (
    <div data-no-interaction>
      <div
        {...(effectiveIsDraggable && isSelected ? dragProps : {})}
        {...doubleProps}
        style={{
          position: 'absolute',
          left: currentObject.rect.origin.x * scale,
          top: currentObject.rect.origin.y * scale,
          width: currentObject.rect.size.width * scale,
          height: currentObject.rect.size.height * scale,
          outline: showOutline ? `1px solid ${selectionOutlineColor}` : 'none',
          outlineOffset: showOutline ? `${outlineOffset}px` : '0px',
          pointerEvents: isSelected && !isMultiSelected ? 'auto' : 'none',
          touchAction: 'none',
          cursor: isSelected && effectiveIsDraggable ? 'move' : 'default',
          zIndex,
          ...style,
        }}
        {...props}
      >
        {(() => {
          const childrenRender =
            typeof children === 'function' ? children(currentObject) : children;
          const customRender = customAnnotationRenderer?.({
            annotation: currentObject,
            children: childrenRender,
            isSelected,
            scale,
            rotation,
            pageWidth,
            pageHeight,
            pageIndex,
            onSelect,
          });
          if (customRender !== null && customRender !== undefined) {
            return customRender;
          }
          return childrenRender;
        })()}

        {/* Resize handles - only when single-selected */}
        {isSelected &&
          effectiveIsResizable &&
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

        {/* Vertex handles - only when single-selected */}
        {isSelected &&
          canModifyAnnotations &&
          !isMultiSelected &&
          vertices.map(({ key, ...vProps }) =>
            vertexUI?.component ? (
              vertexUI.component({
                key,
                ...vProps,
                backgroundColor: VERTEX_COLOR,
              })
            ) : (
              <div
                key={key}
                {...vProps}
                style={{ ...vProps.style, backgroundColor: VERTEX_COLOR }}
              />
            ),
          )}
      </div>

      {/* Selection menu - hide when multi-selected */}
      {selectionMenu && !isMultiSelected && (
        <CounterRotate
          rect={{
            origin: {
              x: currentObject.rect.origin.x * scale,
              y: currentObject.rect.origin.y * scale,
            },
            size: {
              width: currentObject.rect.size.width * scale,
              height: currentObject.rect.size.height * scale,
            },
          }}
          rotation={rotation}
        >
          {(counterRotateProps) =>
            selectionMenu({
              ...counterRotateProps,
              context: {
                type: 'annotation',
                annotation: trackedAnnotation,
                pageIndex,
              },
              selected: isSelected,
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
