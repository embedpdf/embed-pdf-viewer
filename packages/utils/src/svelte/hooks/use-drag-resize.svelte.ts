import {
  type DragResizeConfig,
  DragResizeController,
  type InteractionEvent,
  type ResizeHandle,
} from '../../shared/plugin-interaction-primitives';

export interface UseDragResizeOptions extends DragResizeConfig {
  onUpdate?: (event: InteractionEvent) => void;
  enabled?: boolean;
}

export interface ResizeHandleEventProps {
  onpointerdown: (e: PointerEvent) => void;
  onpointermove: (e: PointerEvent) => void;
  onpointerup: (e: PointerEvent) => void;
  onpointercancel: (e: PointerEvent) => void;
}

export function useDragResize(getOptions: () => UseDragResizeOptions) {
  // Use getter function to maintain reactivity
  const config = $derived.by(() => {
    const opts = getOptions();
    const { onUpdate, enabled, ...rest } = opts;
    return rest;
  });

  const enabled = $derived(getOptions().enabled ?? true);
  const onUpdate = $derived(getOptions().onUpdate);

  let controller = $state<DragResizeController | null>(null);

  // Initialize or update controller
  $effect(() => {
    if (!controller) {
      controller = new DragResizeController(config, (event) => onUpdate?.(event));
    } else {
      controller.updateConfig(config);
    }
  });

  const handleDragStart = (e: PointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    controller?.startDrag(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleMove = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controller?.move(e.clientX, e.clientY, e.buttons);
  };

  const handleEnd = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controller?.end();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const createResizeHandler = (handle: ResizeHandle): ResizeHandleEventProps => ({
    onpointerdown: (e: PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      controller?.startResize(handle, e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onpointermove: handleMove,
    onpointerup: handleEnd,
    onpointercancel: handleEnd,
  });

  const createVertexHandler = (vertexIndex: number): ResizeHandleEventProps => ({
    onpointerdown: (e: PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      controller?.startVertexEdit(vertexIndex, e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onpointermove: handleMove,
    onpointerup: handleEnd,
    onpointercancel: handleEnd,
  });

  const createRotationHandler = (
    initialRotation: number = 0,
    orbitRadiusPx?: number,
  ): ResizeHandleEventProps => ({
    onpointerdown: (e: PointerEvent) => {
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
      controller?.startRotation(handleCenterX, handleCenterY, initialRotation, orbitRadiusPx);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onpointermove: handleMove,
    onpointerup: handleEnd,
    onpointercancel: handleEnd,
  });

  const dragProps = $derived(
    enabled
      ? {
          onpointerdown: handleDragStart,
          onpointermove: handleMove,
          onpointerup: handleEnd,
          onpointercancel: handleEnd,
        }
      : {},
  );

  return {
    get dragProps() {
      return dragProps;
    },
    createResizeProps: createResizeHandler,
    createVertexProps: createVertexHandler,
    createRotationProps: createRotationHandler,
  };
}
