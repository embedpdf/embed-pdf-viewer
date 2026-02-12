import { Rect, boundingRectOrEmpty } from '@embedpdf/models';
import { useInteractionHandles, CounterRotate } from '@embedpdf/utils/@framework';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useState, useMemo, useCallback, useRef, useEffect, createPortal } from '@framework';
import { useDocumentPermissions } from '@embedpdf/core/@framework';

import { useAnnotationPlugin } from '../hooks';
import {
  ResizeHandleUI,
  RotationHandleUI,
  GroupSelectionMenuRenderFn,
  SelectionOutline,
} from './types';

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
  /** Whether the group can be rotated */
  isRotatable?: boolean;
  /** Whether to lock aspect ratio during group resize */
  lockAspectRatio?: boolean;
  /** Resize handle UI customization */
  resizeUI?: ResizeHandleUI;
  /** Rotation handle UI customization */
  rotationUI?: RotationHandleUI;
  /** @deprecated Use `selectionOutline.color` instead */
  selectionOutlineColor?: string;
  /** @deprecated Use `selectionOutline.offset` instead */
  outlineOffset?: number;
  /** Customize the selection outline (color, style, width, offset) */
  selectionOutline?: SelectionOutline;
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
  isRotatable = true,
  lockAspectRatio = false,
  resizeUI,
  rotationUI,
  selectionOutlineColor,
  outlineOffset,
  selectionOutline,
  zIndex = 2,
  groupSelectionMenu,
}: GroupSelectionBoxProps): JSX.Element | null {
  const { plugin } = useAnnotationPlugin();
  const { canModifyAnnotations } = useDocumentPermissions(documentId);
  const gestureBaseRef = useRef<Rect | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const [liveRotation, setLiveRotation] = useState<number | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [isHandleHovered, setIsHandleHovered] = useState(false);

  // Check permissions before allowing drag/resize
  const effectiveIsDraggable = canModifyAnnotations && isDraggable;
  const effectiveIsResizable = canModifyAnnotations && isResizable;
  const effectiveIsRotatable = canModifyAnnotations && isRotatable;

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

  useEffect(() => {
    if (!plugin) return;
    const unsubscribe = plugin.onRotateChange((event) => {
      if (event.documentId !== documentId) return;
      if (event.type === 'end' || event.type === 'cancel') {
        setLiveRotation(null);
      }
    });
    return unsubscribe;
  }, [plugin, documentId]);

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

      if (transformType === 'rotate') {
        if (!isRotatable) return;
        const ids = selectedAnnotations.map((ta) => ta.object.id);
        const cursorAngle = event.transformData.metadata?.rotationAngle ?? 0;
        const cursorPos = event.transformData.metadata?.cursorPosition;
        if (cursorPos) setCursorScreen({ x: cursorPos.clientX, y: cursorPos.clientY });
        if (event.state === 'start') {
          setLiveRotation(cursorAngle);
          plugin.startRotation(documentId, {
            annotationIds: ids,
            cursorAngle,
            rotationCenter: event.transformData.metadata?.rotationCenter,
          });
        } else if (event.state === 'move') {
          setLiveRotation(cursorAngle);
          plugin.updateRotation(
            documentId,
            cursorAngle,
            event.transformData.metadata?.rotationDelta,
          );
        } else if (event.state === 'end') {
          setLiveRotation(null);
          setCursorScreen(null);
          plugin.commitRotation(documentId);
        }
        return;
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
      isRotatable,
    ],
  );

  const groupRotationDisplay = liveRotation ?? 0;
  const rotationActive = liveRotation !== null;
  const normalizedRotationDisplay = Number.isFinite(groupRotationDisplay)
    ? Math.round(groupRotationDisplay * 10) / 10
    : 0;

  // UI constants
  const HANDLE_COLOR = resizeUI?.color ?? '#007ACC';
  const HANDLE_SIZE = resizeUI?.size ?? 12;
  const ROTATION_COLOR = rotationUI?.color ?? HANDLE_COLOR;
  const ROTATION_CONNECTOR_COLOR = rotationUI?.connectorColor ?? ROTATION_COLOR;
  const ROTATION_SIZE = rotationUI?.size ?? 32;
  const ROTATION_MARGIN = rotationUI?.margin;
  const ROTATION_ICON_COLOR = rotationUI?.iconColor ?? 'white';
  const SHOW_CONNECTOR = rotationUI?.showConnector ?? false;

  // Outline resolution (new object > deprecated props > group defaults)
  const outlineColor = selectionOutline?.color ?? selectionOutlineColor ?? '#007ACC';
  const outlineStyleVal = selectionOutline?.style ?? 'dashed';
  const outlineWidth = selectionOutline?.width ?? 2;
  const outlineOff = selectionOutline?.offset ?? outlineOffset ?? 2;

  // Use interaction handles for both drag and resize
  const {
    dragProps,
    resize,
    rotation: rotationHandle,
  } = useInteractionHandles({
    controller: {
      element: previewGroupBox,
      constraints: {
        minWidth: 20,
        minHeight: 20,
        boundingBox: { width: pageWidth, height: pageHeight },
      },
      maintainAspectRatio: lockAspectRatio,
      pageRotation: rotation,
      scale: scale,
      enabled: true,
      onUpdate: handleUpdate,
    },
    resizeUI: {
      handleSize: HANDLE_SIZE,
      spacing: outlineOff,
      offsetMode: 'outside',
      includeSides: !lockAspectRatio,
      zIndex: zIndex + 1,
    },
    vertexUI: {
      vertexSize: 0,
      zIndex: zIndex,
    },
    rotationUI: {
      handleSize: ROTATION_SIZE,
      margin: ROTATION_MARGIN,
      zIndex: zIndex + 2,
      showConnector: SHOW_CONNECTOR,
    },
    includeVertices: false,
    includeRotation: effectiveIsRotatable,
    currentRotation: liveRotation ?? 0,
  });

  // Don't render if less than 2 annotations selected
  if (selectedAnnotations.length < 2) {
    return null;
  }

  const groupBoxWidth = previewGroupBox.size.width * scale;
  const groupBoxHeight = previewGroupBox.size.height * scale;
  const groupCenterX = groupBoxWidth / 2;
  const groupCenterY = groupBoxHeight / 2;
  const groupGuideLength = Math.max(300, Math.max(groupBoxWidth, groupBoxHeight) + 80);

  return (
    <div data-group-selection-box data-no-interaction>
      {/* Outer div: AABB container - stable center for help lines and rotation handle */}
      <div
        style={{
          position: 'absolute',
          left: previewGroupBox.origin.x * scale,
          top: previewGroupBox.origin.y * scale,
          width: groupBoxWidth,
          height: groupBoxHeight,
          pointerEvents: 'none',
          zIndex,
        }}
      >
        {/* Rotation guide lines - anchored at stable center */}
        {rotationActive && (
          <>
            {/* Fixed snap lines (cross at 0/90/180/270) */}
            <div
              style={{
                position: 'absolute',
                left: groupCenterX - groupGuideLength / 2,
                top: groupCenterY,
                width: groupGuideLength,
                height: 1,
                backgroundColor: HANDLE_COLOR,
                opacity: 0.35,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: groupCenterX,
                top: groupCenterY - groupGuideLength / 2,
                width: 1,
                height: groupGuideLength,
                backgroundColor: HANDLE_COLOR,
                opacity: 0.35,
                pointerEvents: 'none',
              }}
            />
            {/* Rotating indicator line showing current angle */}
            <div
              style={{
                position: 'absolute',
                left: groupCenterX - groupGuideLength / 2,
                top: groupCenterY,
                width: groupGuideLength,
                height: 1,
                transformOrigin: 'center center',
                transform: `rotate(${groupRotationDisplay}deg)`,
                backgroundColor: HANDLE_COLOR,
                opacity: 0.8,
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* Rotation handle - orbits in AABB space */}
        {effectiveIsRotatable &&
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

        {/* Inner div: group content area with outline and resize handles */}
        <div
          {...(effectiveIsDraggable
            ? dragProps
            : {
                onPointerDown: (e: any) => e.stopPropagation(),
              })}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: groupBoxWidth,
            height: groupBoxHeight,
            outline: rotationActive
              ? 'none'
              : `${outlineWidth}px ${outlineStyleVal} ${outlineColor}`,
            outlineOffset: outlineOff - 1,
            cursor: effectiveIsDraggable ? 'move' : 'default',
            touchAction: 'none',
            pointerEvents: 'auto',
          }}
        >
          {/* Resize handles */}
          {effectiveIsResizable &&
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
        </div>
      </div>

      {/* Cursor-following rotation tooltip */}
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
          {(counterRotateProps) => {
            // The handle's visual angle = groupRotationDisplay + pageRotation (in degrees).
            // `rotation` is in quarter turns (0-3), so multiply by 90 to get degrees.
            // The menu (suggestTop: false) renders at the visual bottom (180deg).
            // Flip the menu to the top when the handle is in the bottom visual hemisphere
            // to prevent it from overlapping with the rotation handle.
            const effectiveAngle = (((groupRotationDisplay + rotation * 90) % 360) + 360) % 360;
            const handleNearMenuSide =
              effectiveIsRotatable && effectiveAngle > 90 && effectiveAngle < 270;

            return groupSelectionMenu({
              ...counterRotateProps,
              context: {
                type: 'group',
                annotations: selectedAnnotations,
                pageIndex,
              },
              selected: true,
              placement: {
                suggestTop: handleNearMenuSide,
              },
            });
          }}
        </CounterRotate>
      )}
    </div>
  );
}
