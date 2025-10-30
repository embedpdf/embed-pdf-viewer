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

export function useDragResize(options: UseDragResizeOptions) {
  const { onUpdate, enabled = true, ...config } = options;

  let controller = $state<DragResizeController | null>(null);
  let currentOnUpdate = $derived<typeof onUpdate>(onUpdate);

  // Initialize or update controller
  $effect(() => {
    if (!controller) {
      controller = new DragResizeController(config, (event) => currentOnUpdate?.(event));
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
    controller?.move(e.clientX, e.clientY);
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
  };
}
