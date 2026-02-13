import { useMemo, PointerEvent } from '@framework';
import type { CSSProperties } from '@framework';
import { useDragResize, UseDragResizeOptions } from './use-drag-resize';
import {
  describeResizeFromConfig,
  describeVerticesFromConfig,
  describeRotationFromConfig,
  type ResizeUI,
  type VertexUI,
  type RotationUI,
} from '../plugin-interaction-primitives/utils';

export type HandleElementProps = {
  key?: string | number;
  style: CSSProperties;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
} & Record<string, any>;

export type RotationHandleProps = {
  /** Props for the rotation handle element */
  handle: HandleElementProps;
  /** Props for the connector line element (if shown) */
  connector: {
    style: CSSProperties;
  } & Record<string, any>;
};

export function useInteractionHandles(opts: {
  controller: UseDragResizeOptions; // SINGLE config (rect/scale/rotation/vertices/…)
  resizeUI?: ResizeUI; // purely visual knobs
  vertexUI?: VertexUI; // purely visual knobs
  rotationUI?: RotationUI; // purely visual knobs for rotation handle
  includeVertices?: boolean; // default false
  includeRotation?: boolean; // default false
  /** Current rotation angle of the annotation (for initializing rotation interaction) */
  currentRotation?: number;
  handleAttrs?: (
    h: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w',
  ) => Record<string, any> | void;
  vertexAttrs?: (i: number) => Record<string, any> | void;
  rotationAttrs?: () => Record<string, any> | void;
}) {
  const {
    controller,
    resizeUI,
    vertexUI,
    rotationUI,
    includeVertices = false,
    includeRotation = false,
    currentRotation = 0,
    handleAttrs,
    vertexAttrs,
    rotationAttrs,
  } = opts;

  const { dragProps, createResizeProps, createVertexProps, createRotationProps } =
    useDragResize(controller);

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
    controller.annotationRotation,
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

  // Rotation handle: orbits around the center of the element based on current angle
  const rotation: RotationHandleProps | null = useMemo(() => {
    if (!includeRotation) return null;
    // Pass the current rotation angle so the handle is positioned correctly
    const desc = describeRotationFromConfig(controller, rotationUI, currentRotation);
    return {
      handle: {
        style: desc.handleStyle as CSSProperties,
        ...createRotationProps(currentRotation, desc.radius),
        ...(desc.attrs ?? {}),
        ...(rotationAttrs?.() ?? {}),
      },
      connector: {
        style: desc.connectorStyle as CSSProperties,
        'data-epdf-rotation-connector': true,
      },
    };
  }, [
    includeRotation,
    controller.element.origin.x,
    controller.element.origin.y,
    controller.element.size.width,
    controller.element.size.height,
    controller.rotationCenter?.x,
    controller.rotationCenter?.y,
    controller.rotationElement?.origin.x,
    controller.rotationElement?.origin.y,
    controller.rotationElement?.size.width,
    controller.rotationElement?.size.height,
    controller.scale,
    currentRotation,
    rotationUI?.handleSize,
    rotationUI?.margin,
    rotationUI?.zIndex,
    rotationUI?.showConnector,
    rotationUI?.connectorWidth,
    createRotationProps,
    rotationAttrs,
  ]);

  return { dragProps, resize, vertices, rotation };
}
