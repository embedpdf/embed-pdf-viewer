import { PdfAnnotationObject, Rect } from '@embedpdf/models';
import {
  CounterRotate,
  useDoublePressProps,
  useInteractionHandles,
} from '@embedpdf/utils/@framework';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import {
  useState,
  JSX,
  CSSProperties,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  createPortal,
} from '@framework';
import { useDocumentPermissions } from '@embedpdf/core/@framework';
import { inferRotationCenterFromRects } from '../../lib/geometry/rotation';

import { useAnnotationCapability, useAnnotationPlugin } from '../hooks';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  AnnotationSelectionMenuRenderFn,
  VertexHandleUI,
  RotationHandleUI,
  GroupSelectionMenuRenderFn,
  BoxedAnnotationRenderer,
  SelectionOutline,
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
  isRotatable?: boolean;
  lockAspectRatio?: boolean;
  style?: CSSProperties;
  vertexConfig?: VertexConfig<T>;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  /** @deprecated Use `selectionOutline.offset` instead */
  outlineOffset?: number;
  onDoubleClick?: (event: any) => void;
  onSelect: (event: any) => void;
  zIndex?: number;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  rotationUI?: RotationHandleUI;
  /** @deprecated Use `selectionOutline.color` instead */
  selectionOutlineColor?: string;
  /** Customize the selection outline (color, style, width, offset) */
  selectionOutline?: SelectionOutline;
  customAnnotationRenderer?: CustomAnnotationRenderer<T>;
  /** Passed from parent but not used - destructured to prevent DOM spread */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  /** Passed from parent but not used - destructured to prevent DOM spread */
  annotationRenderers?: BoxedAnnotationRenderer[];
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
  selectionOutlineColor,
  selectionOutline,
  customAnnotationRenderer,
  // Destructure props that shouldn't be passed to DOM elements
  groupSelectionMenu: _groupSelectionMenu,
  annotationRenderers: _annotationRenderers,
  ...props
}: AnnotationContainerProps<T>): JSX.Element {
  const [preview, setPreview] = useState<T>(trackedAnnotation.object);
  const [liveRotation, setLiveRotation] = useState<number | null>(null); // Track rotation during drag
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [isHandleHovered, setIsHandleHovered] = useState(false);
  const { provides: annotationCapability } = useAnnotationCapability();
  const { plugin } = useAnnotationPlugin();
  const { canModifyAnnotations } = useDocumentPermissions(documentId);
  const gestureBaseRef = useRef<T | null>(null);

  // When multi-selected, disable individual drag/resize - GroupSelectionBox handles it
  const effectiveIsDraggable = canModifyAnnotations && isDraggable && !isMultiSelected;
  const effectiveIsResizable = canModifyAnnotations && isResizable && !isMultiSelected;
  const effectiveIsRotatable = canModifyAnnotations && isRotatable && !isMultiSelected;
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
  const ROTATION_COLOR = rotationUI?.color ?? '#007ACC';
  const ROTATION_CONNECTOR_COLOR = rotationUI?.connectorColor ?? ROTATION_COLOR;
  const HANDLE_SIZE = resizeUI?.size ?? 12;
  const VERTEX_SIZE = vertexUI?.size ?? 12;
  const ROTATION_SIZE = rotationUI?.size ?? 32;
  const ROTATION_MARGIN = rotationUI?.margin; // undefined = use default (20)
  const ROTATION_ICON_COLOR = rotationUI?.iconColor ?? 'white';
  const SHOW_CONNECTOR = rotationUI?.showConnector ?? false;

  // Outline resolution (new object > deprecated props > defaults)
  const outlineColor = selectionOutline?.color ?? selectionOutlineColor ?? '#007ACC';
  const outlineStyle = selectionOutline?.style ?? 'solid';
  const outlineWidth = selectionOutline?.width ?? 1;
  const outlineOff = selectionOutline?.offset ?? outlineOffset ?? 1;

  // Get annotation's current rotation (for simple shapes that store rotation)
  // During drag, use liveRotation if available; otherwise use the annotation's rotation
  const annotationRotation = liveRotation ?? currentObject.rotation ?? 0;
  const rotationDisplay = liveRotation ?? currentObject.rotation ?? 0;
  const normalizedRotationDisplay = Number.isFinite(rotationDisplay)
    ? Math.round(rotationDisplay * 10) / 10
    : 0;
  const rotationActive = liveRotation !== null;

  // Store original rect at gesture start (only need rect for delta calculation)
  const gestureBaseRectRef = useRef<Rect | null>(null);

  // Handle single-annotation drag/resize (only when NOT multi-selected)
  // Uses the unified plugin API - all preview updates come from event subscriptions!
  const handleUpdate = useCallback(
    (
      event: Parameters<
        NonNullable<Parameters<typeof useInteractionHandles>[0]['controller']['onUpdate']>
      >[0],
    ) => {
      if (!event.transformData?.type || isMultiSelected || !plugin) return;

      const { type, changes, metadata } = event.transformData;
      const id = trackedAnnotation.object.id;
      const pageSize = { width: pageWidth, height: pageHeight };

      // Gesture start - initialize plugin drag/resize
      if (event.state === 'start') {
        // Use unrotatedRect as gesture base so deltas are computed in unrotated space
        gestureBaseRectRef.current =
          trackedAnnotation.object.unrotatedRect ?? trackedAnnotation.object.rect;
        gestureBaseRef.current = trackedAnnotation.object; // For vertex edit
        if (type === 'move') {
          plugin.startDrag(documentId, { annotationIds: [id], pageSize });
        } else if (type === 'resize') {
          plugin.startResize(documentId, {
            annotationIds: [id],
            pageSize,
            resizeHandle: metadata?.handle ?? 'se',
          });
        }
      }

      // Gesture update - call plugin, preview comes from subscription
      if (changes.rect && gestureBaseRectRef.current) {
        if (type === 'move') {
          const delta = {
            x: changes.rect.origin.x - gestureBaseRectRef.current.origin.x,
            y: changes.rect.origin.y - gestureBaseRectRef.current.origin.y,
          };
          plugin.updateDrag(documentId, delta);
        } else if (type === 'resize') {
          plugin.updateResize(documentId, changes.rect);
        }
      }

      // Vertex edit - handle directly (no attached link handling needed)
      if (type === 'vertex-edit' && changes.vertices && vertexConfig) {
        const base = gestureBaseRef.current ?? trackedAnnotation.object;
        const vertexChanges = vertexConfig.transformAnnotation(base, changes.vertices);
        const patched = annotationCapability?.transformAnnotation<T>(base, {
          type,
          changes: vertexChanges as Partial<T>,
          metadata,
        });
        if (patched) {
          setPreview((prev) => ({ ...prev, ...patched }));
          if (event.state === 'end') {
            annotationProvides?.updateAnnotation(pageIndex, id, patched);
          }
        }
      }

      if (type === 'rotate') {
        const cursorAngle = metadata?.rotationAngle ?? annotationRotation;
        const cursorPos = metadata?.cursorPosition;
        if (cursorPos) setCursorScreen({ x: cursorPos.clientX, y: cursorPos.clientY });
        if (event.state === 'start') {
          setLiveRotation(cursorAngle);
          plugin.startRotation(documentId, {
            annotationIds: [id],
            cursorAngle,
            rotationCenter: metadata?.rotationCenter,
          });
        } else if (event.state === 'move') {
          setLiveRotation(cursorAngle);
          plugin.updateRotation(documentId, cursorAngle, metadata?.rotationDelta);
        } else if (event.state === 'end') {
          setLiveRotation(null);
          setCursorScreen(null);
          plugin.commitRotation(documentId);
        }
        return;
      }

      // Gesture end - commit
      if (event.state === 'end') {
        gestureBaseRectRef.current = null;
        gestureBaseRef.current = null;
        if (type === 'move') plugin.commitDrag(documentId);
        else if (type === 'resize') plugin.commitResize(documentId);
      }
    },
    [
      plugin,
      documentId,
      trackedAnnotation.object,
      pageWidth,
      pageHeight,
      pageIndex,
      isMultiSelected,
      vertexConfig,
      annotationCapability,
      annotationProvides,
      annotationRotation,
    ],
  );

  // Geometry model:
  // - `rect` is the visible AABB container.
  // - `unrotatedRect` is the local editing frame for resize/vertex operations.
  const explicitUnrotatedRect = currentObject.unrotatedRect;
  const effectiveUnrotatedRect = explicitUnrotatedRect ?? currentObject.rect;
  const rotationPivot =
    explicitUnrotatedRect && annotationRotation !== 0
      ? inferRotationCenterFromRects(effectiveUnrotatedRect, currentObject.rect, annotationRotation)
      : undefined;
  const controllerElement = effectiveUnrotatedRect;

  const {
    dragProps,
    vertices,
    resize,
    rotation: rotationHandle,
  } = useInteractionHandles({
    controller: {
      element: controllerElement,
      vertices: vertexConfig?.extractVertices(currentObject),
      constraints: {
        minWidth: 10,
        minHeight: 10,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: lockAspectRatio,
      pageRotation: rotation,
      annotationRotation: annotationRotation,
      rotationCenter: rotationPivot,
      rotationElement: currentObject.rect,
      scale: scale,
      // Disable interaction handles when multi-selected
      enabled: isSelected && !isMultiSelected,
      onUpdate: handleUpdate,
    },
    resizeUI: {
      handleSize: HANDLE_SIZE,
      spacing: outlineOff,
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
      margin: ROTATION_MARGIN,
      zIndex: zIndex + 3,
      showConnector: SHOW_CONNECTOR,
    },
    includeVertices: vertexConfig ? true : false,
    includeRotation: effectiveIsRotatable,
    currentRotation: annotationRotation,
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

  // Subscribe to unified drag changes - plugin sends pre-computed patches!
  // ALL preview updates come through here (primary, attached links, multi-select)
  useEffect(() => {
    if (!plugin) return;
    const id = trackedAnnotation.object.id;

    const handleEvent = (event: {
      documentId: string;
      type: string;
      previewPatches?: Record<string, any>;
    }) => {
      if (event.documentId !== documentId) return;
      if (event.type === 'end' || event.type === 'cancel') {
        setLiveRotation(null);
      }
      const patch = event.previewPatches?.[id];
      if (event.type === 'update' && patch) setPreview((prev) => ({ ...prev, ...patch }) as T);
      else if (event.type === 'cancel') setPreview(trackedAnnotation.object);
    };

    const unsubs = [
      plugin.onDragChange(handleEvent),
      plugin.onResizeChange(handleEvent),
      plugin.onRotateChange(handleEvent),
    ];

    return () => unsubs.forEach((u) => u());
  }, [plugin, documentId, trackedAnnotation.object]);

  // Determine if we should show the outline
  // When multi-selected, don't show individual outlines - GroupSelectionBox shows the group outline
  const showOutline = isSelected && !isMultiSelected;

  // Three-layer model: outer div (AABB) + inner rotated div (unrotatedRect) + content
  const aabbWidth = currentObject.rect.size.width * scale;
  const aabbHeight = currentObject.rect.size.height * scale;
  const innerWidth = effectiveUnrotatedRect.size.width * scale;
  const innerHeight = effectiveUnrotatedRect.size.height * scale;
  const usesCustomPivot = Boolean(explicitUnrotatedRect) && annotationRotation !== 0;
  const innerLeft = usesCustomPivot
    ? (effectiveUnrotatedRect.origin.x - currentObject.rect.origin.x) * scale
    : (aabbWidth - innerWidth) / 2;
  const innerTop = usesCustomPivot
    ? (effectiveUnrotatedRect.origin.y - currentObject.rect.origin.y) * scale
    : (aabbHeight - innerHeight) / 2;
  const innerTransformOrigin =
    usesCustomPivot && rotationPivot
      ? `${(rotationPivot.x - effectiveUnrotatedRect.origin.x) * scale}px ${(rotationPivot.y - effectiveUnrotatedRect.origin.y) * scale}px`
      : 'center center';
  const centerX = rotationPivot
    ? (rotationPivot.x - currentObject.rect.origin.x) * scale
    : aabbWidth / 2;
  const centerY = rotationPivot
    ? (rotationPivot.y - currentObject.rect.origin.y) * scale
    : aabbHeight / 2;
  const guideLength = Math.max(300, Math.max(aabbWidth, aabbHeight) + 80);

  // For children, override rect to use unrotatedRect so content renders in unrotated space
  const childObject = useMemo(() => {
    if (explicitUnrotatedRect) {
      return { ...currentObject, rect: explicitUnrotatedRect };
    }
    return currentObject;
  }, [currentObject, explicitUnrotatedRect]);

  return (
    <div data-no-interaction>
      {/* Outer div: AABB container - stable center, holds help lines + rotation handle */}
      <div
        style={{
          position: 'absolute',
          left: currentObject.rect.origin.x * scale,
          top: currentObject.rect.origin.y * scale,
          width: aabbWidth,
          height: aabbHeight,
          pointerEvents: 'none',
          zIndex,
          ...style,
        }}
        {...props}
      >
        {/* Rotation guide lines - anchored at stable AABB center */}
        {rotationActive && (
          <>
            {/* Fixed snap lines (cross at 0/90/180/270) */}
            <div
              style={{
                position: 'absolute',
                left: centerX - guideLength / 2,
                top: centerY,
                width: guideLength,
                height: 1,
                backgroundColor: ROTATION_CONNECTOR_COLOR,
                opacity: 0.35,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: centerX,
                top: centerY - guideLength / 2,
                width: 1,
                height: guideLength,
                backgroundColor: ROTATION_CONNECTOR_COLOR,
                opacity: 0.35,
                pointerEvents: 'none',
              }}
            />
            {/* Rotating indicator line showing current angle */}
            <div
              style={{
                position: 'absolute',
                left: centerX - guideLength / 2,
                top: centerY,
                width: guideLength,
                height: 1,
                transformOrigin: 'center center',
                transform: `rotate(${annotationRotation}deg)`,
                backgroundColor: ROTATION_CONNECTOR_COLOR,
                opacity: 0.8,
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* Rotation handle - orbits in AABB space, kept in DOM during rotation */}
        {isSelected &&
          effectiveIsRotatable &&
          rotationHandle &&
          (rotationUI?.component ? (
            <div
              onPointerEnter={() => setIsHandleHovered(true)}
              onPointerLeave={() => {
                setIsHandleHovered(false);
                setCursorScreen(null);
              }}
              onPointerMove={(e: any) => {
                if (!rotationActive) setCursorScreen({ x: e.clientX, y: e.clientY });
              }}
              style={{ display: 'contents' }}
            >
              {rotationUI.component({
                ...rotationHandle.handle,
                backgroundColor: ROTATION_COLOR,
                iconColor: ROTATION_ICON_COLOR,
                connectorStyle: {
                  ...rotationHandle.connector.style,
                  backgroundColor: ROTATION_CONNECTOR_COLOR,
                  opacity: rotationActive ? 0 : 1,
                },
                showConnector: SHOW_CONNECTOR,
                opacity: rotationActive ? 0 : 1,
              })}
            </div>
          ) : (
            <div
              onPointerEnter={() => setIsHandleHovered(true)}
              onPointerLeave={() => {
                setIsHandleHovered(false);
                setCursorScreen(null);
              }}
              onPointerMove={(e: any) => {
                if (!rotationActive) setCursorScreen({ x: e.clientX, y: e.clientY });
              }}
              style={{ display: 'contents' }}
            >
              {/* Connector line */}
              {SHOW_CONNECTOR && (
                <div
                  style={{
                    ...rotationHandle.connector.style,
                    backgroundColor: ROTATION_CONNECTOR_COLOR,
                    opacity: rotationActive ? 0 : 1,
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
                  pointerEvents: 'auto',
                  opacity: rotationActive ? 0 : 1,
                }}
              >
                {/* Default rotation icon - a curved arrow */}
                <svg
                  width={Math.round(ROTATION_SIZE * 0.6)}
                  height={Math.round(ROTATION_SIZE * 0.6)}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={ROTATION_ICON_COLOR}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </div>
            </div>
          ))}

        {/* Inner div: rotated content area - holds content, resize handles, vertex handles */}
        <div
          {...(effectiveIsDraggable && isSelected ? dragProps : {})}
          {...doubleProps}
          style={{
            position: 'absolute',
            left: innerLeft,
            top: innerTop,
            width: innerWidth,
            height: innerHeight,
            transform: annotationRotation !== 0 ? `rotate(${annotationRotation}deg)` : undefined,
            transformOrigin: innerTransformOrigin,
            outline: showOutline ? `${outlineWidth}px ${outlineStyle} ${outlineColor}` : 'none',
            outlineOffset: showOutline ? `${outlineOff}px` : '0px',
            pointerEvents: isSelected && !isMultiSelected ? 'auto' : 'none',
            touchAction: 'none',
            cursor: isSelected && effectiveIsDraggable ? 'move' : 'default',
          }}
        >
          {/* Annotation content - renders in unrotated coordinate space */}
          {(() => {
            const childrenRender =
              typeof children === 'function' ? children(childObject) : children;
            const customRender = customAnnotationRenderer?.({
              annotation: childObject,
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

          {/* Resize handles - rotate with the shape */}
          {isSelected &&
            effectiveIsResizable &&
            !rotationActive &&
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

          {/* Vertex handles - rotate with the shape */}
          {isSelected &&
            canModifyAnnotations &&
            !isMultiSelected &&
            !rotationActive &&
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
      </div>

      {/* Selection menu - hide when multi-selected or rotating */}
      {selectionMenu && !isMultiSelected && !rotationActive && (
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
          {(counterRotateProps) => {
            // The handle's visual angle = annotationRotation + pageRotation (in degrees).
            // `rotation` is in quarter turns (0-3), so multiply by 90 to get degrees.
            // The menu (suggestTop: false) renders at the visual bottom (180deg).
            // Flip the menu to the top when the handle is in the bottom visual hemisphere
            // to prevent it from overlapping with the rotation handle.
            const effectiveAngle = (((annotationRotation + rotation * 90) % 360) + 360) % 360;
            const handleNearMenuSide =
              effectiveIsRotatable && effectiveAngle > 90 && effectiveAngle < 270;

            return selectionMenu({
              ...counterRotateProps,
              context: {
                type: 'annotation',
                annotation: trackedAnnotation,
                pageIndex,
              },
              selected: isSelected,
              placement: {
                suggestTop: handleNearMenuSide,
              },
            });
          }}
        </CounterRotate>
      )}

      {/* Cursor-following rotation tooltip - portaled to document.body to escape CSS transform chain */}
      {(rotationActive || isHandleHovered) &&
        cursorScreen &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: cursorScreen.x + 16,
              top: cursorScreen.y - 16,
              background: 'rgba(0,0,0,0.8)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              pointerEvents: 'none',
              zIndex: 10000,
              whiteSpace: 'nowrap',
            }}
          >
            {normalizedRotationDisplay.toFixed(0)}°
          </div>,
          document.body,
        )}
    </div>
  );
}
