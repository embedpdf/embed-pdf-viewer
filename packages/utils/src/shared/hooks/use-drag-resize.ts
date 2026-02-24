import { useRef, useCallback, useEffect, PointerEvent } from '@framework';
import {
  DragResizeController,
  DragResizeConfig,
  InteractionEvent,
  ResizeHandle,
} from '../plugin-interaction-primitives';

export interface UseDragResizeOptions extends DragResizeConfig {
  onUpdate?: (event: InteractionEvent) => void;
  enabled?: boolean;
}

export interface ResizeHandleEventProps {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onLostPointerCapture?: (e: PointerEvent) => void;
}

export function useDragResize(options: UseDragResizeOptions) {
  const { onUpdate, enabled = true, ...config } = options;
  const controllerRef = useRef<DragResizeController | null>(null);
  const onUpdateRef = useRef<typeof onUpdate>(onUpdate);
  const activePointerIdRef = useRef<number | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Initialize or update controller
  useEffect(() => {
    if (!controllerRef.current) {
      controllerRef.current = new DragResizeController(config, (event) =>
        onUpdateRef.current?.(event),
      );
    } else {
      controllerRef.current.updateConfig(config);
    }
  }, [
    config.element,
    config.rotationCenter,
    config.rotationElement,
    config.constraints,
    config.maintainAspectRatio,
    config.pageRotation,
    config.annotationRotation,
    config.scale,
    config.vertices,
  ]);

  const endPointerSession = useCallback((pointerId?: number) => {
    const activePointerId = activePointerIdRef.current;
    const target = activeTargetRef.current;
    const id = pointerId ?? activePointerId;

    if (target && id !== null) {
      try {
        if (target.hasPointerCapture?.(id)) {
          target.releasePointerCapture?.(id);
        }
      } catch {
        // Ignore release failures when capture is already gone.
      }
    }

    activePointerIdRef.current = null;
    activeTargetRef.current = null;
  }, []);

  const startPointerSession = useCallback(
    (e: PointerEvent) => {
      // Defensive: if a previous interaction got stuck, close it before starting a new one.
      if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
        controllerRef.current?.end();
        endPointerSession(activePointerIdRef.current);
      }

      const target = e.currentTarget as HTMLElement;
      activePointerIdRef.current = e.pointerId;
      activeTargetRef.current = target;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failures - global listeners still provide a fallback.
      }
    },
    [endPointerSession],
  );

  useEffect(() => {
    const eventTarget = globalThis as unknown as Window;
    const handleGlobalPointerEnd = (e: globalThis.PointerEvent) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      controllerRef.current?.end();
      endPointerSession(e.pointerId);
    };

    const handleWindowBlur = () => {
      if (activePointerIdRef.current === null) return;
      controllerRef.current?.end();
      endPointerSession();
    };

    eventTarget.addEventListener('pointerup', handleGlobalPointerEnd, true);
    eventTarget.addEventListener('pointercancel', handleGlobalPointerEnd, true);
    eventTarget.addEventListener('blur', handleWindowBlur, true);

    return () => {
      eventTarget.removeEventListener('pointerup', handleGlobalPointerEnd, true);
      eventTarget.removeEventListener('pointercancel', handleGlobalPointerEnd, true);
      eventTarget.removeEventListener('blur', handleWindowBlur, true);
    };
  }, [endPointerSession]);

  useEffect(() => {
    return () => {
      if (activePointerIdRef.current !== null) {
        controllerRef.current?.end();
        endPointerSession();
      }
    };
  }, [endPointerSession]);

  const handleDragStart = useCallback(
    (e: PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      controllerRef.current?.startDrag(e.clientX, e.clientY);
      startPointerSession(e);
    },
    [enabled, startPointerSession],
  );

  const handleMove = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const activePointerId = activePointerIdRef.current;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      controllerRef.current?.move(e.clientX, e.clientY, e.buttons);

      // Extra guard for environments where pointerup gets swallowed.
      if (activePointerIdRef.current === e.pointerId && e.buttons === 0) {
        endPointerSession(e.pointerId);
      }
    },
    [endPointerSession],
  );

  const handleEndLike = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const activePointerId = activePointerIdRef.current;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      controllerRef.current?.end();
      endPointerSession(e.pointerId);
    },
    [endPointerSession],
  );

  const handleLostPointerCapture = useCallback(
    (e: PointerEvent) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      controllerRef.current?.end();
      endPointerSession(e.pointerId);
    },
    [endPointerSession],
  );

  const createResizeHandler = useCallback(
    (handle: ResizeHandle): ResizeHandleEventProps => ({
      onPointerDown: (e: PointerEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        controllerRef.current?.startResize(handle, e.clientX, e.clientY);
        startPointerSession(e);
      },
      onPointerMove: handleMove,
      onPointerUp: handleEndLike,
      onPointerCancel: handleEndLike,
      onLostPointerCapture: handleLostPointerCapture,
    }),
    [enabled, handleMove, handleEndLike, handleLostPointerCapture, startPointerSession],
  );

  const createVertexHandler = useCallback(
    (vertexIndex: number): ResizeHandleEventProps => ({
      onPointerDown: (e: PointerEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        controllerRef.current?.startVertexEdit(vertexIndex, e.clientX, e.clientY);
        startPointerSession(e);
      },
      onPointerMove: handleMove,
      onPointerUp: handleEndLike,
      onPointerCancel: handleEndLike,
      onLostPointerCapture: handleLostPointerCapture,
    }),
    [enabled, handleMove, handleEndLike, handleLostPointerCapture, startPointerSession],
  );

  const createRotationHandler = useCallback(
    (initialRotation: number = 0, orbitRadiusPx?: number): ResizeHandleEventProps => ({
      onPointerDown: (e: PointerEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        // Use the handle's actual DOM center, not the raw click position.
        // This avoids up to handleSize/2 px error when the user clicks
        // near the edge of the handle circle, which would shift the
        // reverse-engineered center and distort angles near the center.
        const handleRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const handleCenterX = handleRect.left + handleRect.width / 2;
        const handleCenterY = handleRect.top + handleRect.height / 2;
        controllerRef.current?.startRotation(
          handleCenterX,
          handleCenterY,
          initialRotation,
          orbitRadiusPx,
        );
        startPointerSession(e);
      },
      onPointerMove: handleMove,
      onPointerUp: handleEndLike,
      onPointerCancel: handleEndLike,
      onLostPointerCapture: handleLostPointerCapture,
    }),
    [enabled, handleMove, handleEndLike, handleLostPointerCapture, startPointerSession],
  );

  return {
    dragProps: enabled
      ? {
          onPointerDown: handleDragStart,
          onPointerMove: handleMove,
          onPointerUp: handleEndLike,
          onPointerCancel: handleEndLike,
          onLostPointerCapture: handleLostPointerCapture,
        }
      : {},
    createResizeProps: createResizeHandler,
    createVertexProps: createVertexHandler,
    createRotationProps: createRotationHandler,
  };
}
