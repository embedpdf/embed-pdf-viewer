import { ref, watch, computed, onUnmounted, markRaw, type Ref } from 'vue';
import type { Position, Rect } from '@embedpdf/models';
import {
  DragResizeController,
  type DragResizeConfig,
  type InteractionEvent,
  type ResizeHandle,
} from '../../shared/plugin-interaction-primitives';
import {
  norm,
  rectDTO,
  vertsDTO,
  constraintsDTO,
  boolDTO,
  numDTO,
  type MaybeRef,
} from '../utils/interaction-normalize';

export interface UseDragResizeOptions {
  element: MaybeRef<Rect>;
  vertices?: MaybeRef<Position[]>;
  constraints?: MaybeRef<DragResizeConfig['constraints']>;
  maintainAspectRatio?: MaybeRef<boolean>;
  pageRotation?: MaybeRef<number>;
  annotationRotation?: MaybeRef<number>;
  scale?: MaybeRef<number>;
  onUpdate?: (event: InteractionEvent) => void;
  enabled?: MaybeRef<boolean>;
}

export function useDragResize(options: UseDragResizeOptions) {
  const controller = ref<DragResizeController | null>(null);

  const {
    onUpdate,
    element,
    vertices,
    constraints,
    maintainAspectRatio,
    pageRotation,
    annotationRotation,
    scale,
    enabled,
  } = options;

  // Build initial plain config
  const initialCfg: DragResizeConfig = {
    element: rectDTO(norm(element)),
    vertices: vertices ? vertsDTO(norm(vertices)) : undefined,
    constraints: constraintsDTO(constraints),
    maintainAspectRatio: boolDTO(enabled === undefined ? undefined : norm(maintainAspectRatio!)),
    pageRotation: numDTO(pageRotation === undefined ? undefined : norm(pageRotation!)),
    annotationRotation: numDTO(
      annotationRotation === undefined ? undefined : norm(annotationRotation!),
    ),
    scale: numDTO(scale === undefined ? undefined : norm(scale!)),
  };

  if (!controller.value) {
    controller.value = markRaw(new DragResizeController(initialCfg, (ev) => onUpdate?.(ev)));
  }

  // Reactive updates → always normalize before passing to controller
  watch(
    () => ({
      element,
      vertices,
      constraints,
      maintainAspectRatio,
      pageRotation,
      annotationRotation,
      scale,
    }),
    (nc) => {
      controller.value?.updateConfig({
        element: rectDTO(norm(nc.element)),
        vertices: nc.vertices ? vertsDTO(norm(nc.vertices)) : undefined,
        constraints: constraintsDTO(nc.constraints),
        maintainAspectRatio: boolDTO(
          nc.maintainAspectRatio === undefined ? undefined : norm(nc.maintainAspectRatio!),
        ),
        pageRotation: numDTO(nc.pageRotation === undefined ? undefined : norm(nc.pageRotation!)),
        annotationRotation: numDTO(
          nc.annotationRotation === undefined ? undefined : norm(nc.annotationRotation!),
        ),
        scale: numDTO(nc.scale === undefined ? undefined : norm(nc.scale!)),
      });
    },
    { deep: true },
  );

  onUnmounted(() => {
    controller.value = null;
  });

  const isEnabled = () => Boolean(enabled === undefined ? true : norm(enabled));

  // Pointer handlers
  const handleDragStart = (e: PointerEvent) => {
    if (!isEnabled()) return;
    e.preventDefault();
    e.stopPropagation();
    controller.value?.startDrag(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const handleMove = (e: PointerEvent) => controller.value?.move(e.clientX, e.clientY);
  const handleEnd = (e: PointerEvent) => {
    controller.value?.end();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  const handleCancel = (e: PointerEvent) => {
    controller.value?.cancel();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const createResizeProps = (handle: ResizeHandle) => ({
    onPointerdown: (e: PointerEvent) => {
      if (!isEnabled()) return;
      e.preventDefault();
      e.stopPropagation();
      controller.value?.startResize(handle, e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointermove: handleMove,
    onPointerup: handleEnd,
    onPointercancel: handleCancel,
  });

  const createVertexProps = (vertexIndex: number) => ({
    onPointerdown: (e: PointerEvent) => {
      if (!isEnabled()) return;
      e.preventDefault();
      e.stopPropagation();
      controller.value?.startVertexEdit(vertexIndex, e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointermove: handleMove,
    onPointerup: handleEnd,
    onPointercancel: handleCancel,
  });

  const dragProps = computed(() =>
    isEnabled()
      ? {
          onPointerdown: handleDragStart,
          onPointermove: handleMove,
          onPointerup: handleEnd,
          onPointercancel: handleCancel,
        }
      : {},
  );

  return { dragProps, createResizeProps, createVertexProps };
}
