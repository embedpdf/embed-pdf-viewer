import { useMemo, PointerEvent } from '@framework';
import type { CSSProperties } from '@framework';
import { useDragResize, UseDragResizeOptions } from './use-drag-resize';
import {
  describeResizeFromConfig,
  describeVerticesFromConfig,
  type ResizeUI,
  type VertexUI,
} from '../plugin-interaction-primitives/utils';

export type HandleElementProps = {
  key: string | number;
  style: CSSProperties;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
} & Record<string, any>;

export function useInteractionHandles(opts: {
  controller: UseDragResizeOptions; // SINGLE config (rect/scale/rotation/vertices/…)
  resizeUI?: ResizeUI; // purely visual knobs
  vertexUI?: VertexUI; // purely visual knobs
  includeVertices?: boolean; // default false
  handleAttrs?: (
    h: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w',
  ) => Record<string, any> | void;
  vertexAttrs?: (i: number) => Record<string, any> | void;
}) {
  const {
    controller,
    resizeUI,
    vertexUI,
    includeVertices = false,
    handleAttrs,
    vertexAttrs,
  } = opts;

  const { dragProps, createResizeProps, createVertexProps } = useDragResize(controller);

  // Resize handles: only uses data from the SAME controller config.
  const resize: HandleElementProps[] = useMemo(() => {
    const desc = describeResizeFromConfig(controller, resizeUI);
    return desc.map((d) => ({
      key: d.attrs?.['data-epdf-handle'] as string,
      style: d.style as CSSProperties,
      ...createResizeProps(d.handle),
      ...(d.attrs ?? {}),
      ...(handleAttrs?.(d.handle) ?? {}),
    }));
    // deps: controller geometry knobs + UI knobs + handler factory
  }, [
    controller.element.origin.x,
    controller.element.origin.y,
    controller.element.size.width,
    controller.element.size.height,
    controller.scale,
    controller.pageRotation,
    controller.maintainAspectRatio,
    resizeUI?.handleSize,
    resizeUI?.spacing,
    resizeUI?.offsetMode,
    resizeUI?.includeSides,
    resizeUI?.zIndex,
    resizeUI?.rotationAwareCursor,
    createResizeProps,
    handleAttrs,
  ]);

  // Vertex handles: same source; prefer live vertices if parent rerenders with updated cfg.vertices
  const vertices: HandleElementProps[] = useMemo(() => {
    if (!includeVertices) return [];
    const desc = describeVerticesFromConfig(controller, vertexUI, controller.vertices);
    return desc.map((d, i) => ({
      key: i,
      style: d.style as CSSProperties,
      ...createVertexProps(i),
      ...(d.attrs ?? {}),
      ...(vertexAttrs?.(i) ?? {}),
    }));
  }, [
    includeVertices,
    controller.element.origin.x,
    controller.element.origin.y,
    controller.element.size.width,
    controller.element.size.height,
    controller.scale,
    controller.vertices, // identity/content drives recalculation
    vertexUI?.vertexSize,
    vertexUI?.zIndex,
    createVertexProps,
    vertexAttrs,
  ]);

  return { dragProps, resize, vertices };
}
