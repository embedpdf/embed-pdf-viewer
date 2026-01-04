import { PdfAnnotationObject } from '@embedpdf/models';
import {
  CounterRotate,
  useDoublePressProps,
  useInteractionHandles,
} from '@embedpdf/utils/@framework';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useState, JSX, CSSProperties, useRef, useEffect, useMemo } from '@framework';

import { useAnnotationCapability } from '../hooks';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  AnnotationSelectionMenuRenderFn,
  VertexHandleUI,
  RotationHandleUI,
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
  isDraggable: boolean;
  isResizable: boolean;
  isRotatable?: boolean;
  lockAspectRatio?: boolean;
  style?: CSSProperties;
  vertexConfig?: VertexConfig<T>;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  outlineOffset?: number;
  onDoubleClick?: (event: any) => void; // You'll need to import proper MouseEvent type
  onSelect: (event: any) => void;
  zIndex?: number;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  rotationUI?: RotationHandleUI;
  selectionOutlineColor?: string;
  customAnnotationRenderer?: CustomAnnotationRenderer<T>;
}

// Simplified AnnotationContainer
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
  isDraggable,
  isResizable,
  isRotatable = true,
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
  rotationUI,
  selectionOutlineColor = '#007ACC',
  customAnnotationRenderer,
  ...props
}: AnnotationContainerProps<T>): JSX.Element {
  const [preview, setPreview] = useState<T>(trackedAnnotation.object);
  const [liveRotation, setLiveRotation] = useState<number | null>(null); // Track rotation during drag
  const { provides: annotationCapability } = useAnnotationCapability();
  const gestureBaseRef = useRef<T | null>(null);

  // Get scoped API for this document (memoized to prevent infinite loops)
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  const currentObject = preview
    ? { ...trackedAnnotation.object, ...preview }
    : trackedAnnotation.object;

  // Defaults retain current behavior
  const HANDLE_COLOR = resizeUI?.color ?? '#007ACC';
  const VERTEX_COLOR = vertexUI?.color ?? '#007ACC';
  const ROTATION_COLOR = rotationUI?.color ?? '#007ACC';
  const ROTATION_CONNECTOR_COLOR = rotationUI?.connectorColor ?? ROTATION_COLOR;
  const HANDLE_SIZE = resizeUI?.size ?? 12;
  const VERTEX_SIZE = vertexUI?.size ?? 12;
  const ROTATION_SIZE = rotationUI?.size ?? 16;
  const ROTATION_RADIUS = rotationUI?.radius; // undefined = auto-calculate
  const SHOW_CONNECTOR = rotationUI?.showConnector ?? true;

  // Get annotation's current rotation (for simple shapes that store rotation)
  // During drag, use liveRotation if available; otherwise use the annotation's rotation
  const annotationRotation = liveRotation ?? (currentObject as any).rotation ?? 0;

  const {
    dragProps,
    vertices,
    resize,
    rotation: rotationHandle,
  } = useInteractionHandles({
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
      enabled: isSelected,
      onUpdate: (event) => {
        if (!event.transformData?.type) return;

        if (event.state === 'start') {
          gestureBaseRef.current = currentObject;
        }

        const transformType = event.transformData.type;
        const base = gestureBaseRef.current ?? currentObject;

        let changes: Partial<T>;
        if (event.transformData.changes.vertices) {
          changes = vertexConfig?.transformAnnotation(
            base,
            event.transformData.changes.vertices,
          ) as Partial<T>;
        } else if (transformType === 'rotate') {
          // For rotation, pass the rotation through metadata
          changes = {} as Partial<T>;
          // Update live rotation so the handle follows the mouse
          const newRotation = event.transformData.metadata?.rotationAngle ?? 0;
          setLiveRotation(newRotation);
        } else {
          changes = { rect: event.transformData.changes.rect } as Partial<T>;
        }

        const patched = annotationCapability?.transformAnnotation<T>(base, {
          type: transformType,
          changes: changes,
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
          setLiveRotation(null); // Clear live rotation when drag ends
          if (patched) {
            annotationProvides?.updateAnnotation(pageIndex, trackedAnnotation.object.id, patched);
          }
        }
      },
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
    rotationUI: {
      handleSize: ROTATION_SIZE,
      radius: ROTATION_RADIUS,
      zIndex: zIndex + 3,
      showConnector: SHOW_CONNECTOR,
    },
    includeVertices: vertexConfig ? true : false,
    includeRotation: isRotatable,
    currentRotation: annotationRotation,
  });

  const doubleProps = useDoublePressProps(onDoubleClick);

  useEffect(() => {
    setPreview(trackedAnnotation.object);
  }, [trackedAnnotation.object]);

  return (
    <div data-no-interaction>
      <div
        {...(isDraggable && isSelected ? dragProps : {})}
        {...doubleProps}
        style={{
          position: 'absolute',
          left: currentObject.rect.origin.x * scale,
          top: currentObject.rect.origin.y * scale,
          width: currentObject.rect.size.width * scale,
          height: currentObject.rect.size.height * scale,
          outline: isSelected ? `1px solid ${selectionOutlineColor}` : 'none',
          outlineOffset: isSelected ? `${outlineOffset}px` : '0px',
          pointerEvents: isSelected ? 'auto' : 'none',
          touchAction: 'none',
          cursor: isSelected && isDraggable ? 'move' : 'default',
          zIndex,
          ...style,
        }}
        {...props}
      >
        {(() => {
          const childrenRender =
            typeof children === 'function' ? children(currentObject) : children;
          // Check for custom renderer first
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

          // Fall back to default children rendering
          return childrenRender;
        })()}

        {isSelected &&
          isResizable &&
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

        {isSelected &&
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

        {/* Rotation handle */}
        {isSelected &&
          isRotatable &&
          rotationHandle &&
          (rotationUI?.component ? (
            rotationUI.component({
              ...rotationHandle.handle,
              backgroundColor: ROTATION_COLOR,
              connectorStyle: {
                ...rotationHandle.connector.style,
                backgroundColor: ROTATION_CONNECTOR_COLOR,
              },
              showConnector: SHOW_CONNECTOR,
            })
          ) : (
            <>
              {/* Connector line */}
              {SHOW_CONNECTOR && (
                <div
                  style={{
                    ...rotationHandle.connector.style,
                    backgroundColor: ROTATION_CONNECTOR_COLOR,
                  }}
                />
              )}
              {/* Rotation handle */}
              <div
                {...rotationHandle.handle}
                style={{
                  ...rotationHandle.handle.style,
                  backgroundColor: ROTATION_COLOR,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Default rotation icon - a curved arrow */}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </div>
            </>
          ))}
      </div>
      {/* CounterRotate remains unchanged */}
      {selectionMenu && (
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
          {(props) =>
            selectionMenu({
              ...props,
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
