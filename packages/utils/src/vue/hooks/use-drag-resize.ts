import { ref, watch, computed, onUnmounted } from 'vue';
import {
  DragResizeController,
  DragResizeConfig,
  InteractionEvent,
  ResizeHandle,
} from '../../shared/plugin-interaction-primitives';

export interface UseDragResizeOptions extends DragResizeConfig {
  onUpdate?: (event: InteractionEvent) => void;
  enabled?: boolean;
}

export function useDragResize(options: UseDragResizeOptions) {
  const controller = ref<DragResizeController | null>(null);

  // Extract reactive options
  const { onUpdate, enabled = true, ...config } = options;

  // Initialize controller
  if (!controller.value) {
    controller.value = new DragResizeController(config, (event) => onUpdate?.(event));
  }

  // Watch for config changes
  watch(
    () => ({
      element: config.element,
      constraints: config.constraints,
      maintainAspectRatio: config.maintainAspectRatio,
      pageRotation: config.pageRotation,
      scale: config.scale,
    }),
    (newConfig) => {
      controller.value?.updateConfig(newConfig);
    },
    { deep: true },
  );

  // Cleanup on unmount
  onUnmounted(() => {
    controller.value = null;
  });

  // Drag handlers
  const handleDragStart = (e: PointerEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    controller.value?.startDrag(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleMove = (e: PointerEvent) => {
    controller.value?.move(e.clientX, e.clientY);
  };

  const handleEnd = (e: PointerEvent) => {
    controller.value?.end();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handleCancel = (e: PointerEvent) => {
    controller.value?.cancel();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Create resize handler factory
  const createResizeProps = (handle: ResizeHandle) => ({
    onPointerdown: (e: PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      controller.value?.startResize(handle, e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointermove: handleMove,
    onPointerup: handleEnd,
    onPointercancel: handleCancel,
  });

  // Computed drag props
  const dragProps = computed(() =>
    enabled
      ? {
          onPointerdown: handleDragStart,
          onPointermove: handleMove,
          onPointerup: handleEnd,
          onPointercancel: handleCancel,
        }
      : {},
  );

  return {
    dragProps,
    createResizeProps,
  };
}
