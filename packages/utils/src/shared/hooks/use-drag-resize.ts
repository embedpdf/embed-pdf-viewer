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
}

export function useDragResize(options: UseDragResizeOptions) {
  const { onUpdate, enabled = true, ...config } = options;
  const controllerRef = useRef<DragResizeController | null>(null);
  const onUpdateRef = useRef<typeof onUpdate>(onUpdate);

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
    config.constraints,
    config.maintainAspectRatio,
    config.pageRotation,
    config.scale,
    config.vertices,
  ]);

  const handleDragStart = useCallback(
    (e: PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      controllerRef.current?.startDrag(e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [enabled],
  );

  const handleMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controllerRef.current?.move(e.clientX, e.clientY);
  }, []);

  const handleEnd = useCallback((e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controllerRef.current?.end();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const createResizeHandler = useCallback(
    (handle: ResizeHandle): ResizeHandleEventProps => ({
      onPointerDown: (e: PointerEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        controllerRef.current?.startResize(handle, e.clientX, e.clientY);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: handleMove,
      onPointerUp: handleEnd,
      onPointerCancel: handleEnd,
    }),
    [enabled, handleMove, handleEnd],
  );

  const createVertexHandler = useCallback(
    (vertexIndex: number): ResizeHandleEventProps => ({
      onPointerDown: (e: PointerEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        controllerRef.current?.startVertexEdit(vertexIndex, e.clientX, e.clientY);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: handleMove,
      onPointerUp: handleEnd,
      onPointerCancel: handleEnd,
    }),
    [enabled, handleMove, handleEnd],
  );

  const createRotationHandler = useCallback(
    (initialRotation: number = 0): ResizeHandleEventProps => ({
      onPointerDown: (e: PointerEvent) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        controllerRef.current?.startRotation(e.clientX, e.clientY, initialRotation);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: handleMove,
      onPointerUp: handleEnd,
      onPointerCancel: handleEnd,
    }),
    [enabled, handleMove, handleEnd],
  );

  return {
    dragProps: enabled
      ? {
          onPointerDown: handleDragStart,
          onPointerMove: handleMove,
          onPointerUp: handleEnd,
          onPointerCancel: handleEnd,
        }
      : {},
    createResizeProps: createResizeHandler,
    createVertexProps: createVertexHandler,
    createRotationProps: createRotationHandler,
  };
}
