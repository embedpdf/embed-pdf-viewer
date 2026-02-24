import { computed, type CSSProperties } from 'vue';
import { useDragResize, type UseDragResizeOptions } from './use-drag-resize';
import {
  describeResizeFromConfig,
  describeVerticesFromConfig,
  describeRotationFromConfig,
  type ResizeUI,
  type VertexUI,
  type RotationUI,
} from '../../shared/plugin-interaction-primitives/utils';
import type { Position, Rect } from '@embedpdf/models';
import { norm, rectDTO, vertsDTO, type MaybeRef } from '../utils/interaction-normalize';

export type HandleElementProps = {
  key?: string | number;
  style: CSSProperties;
  onPointerdown: (e: PointerEvent) => void;
  onPointermove: (e: PointerEvent) => void;
  onPointerup: (e: PointerEvent) => void;
  onPointercancel: (e: PointerEvent) => void;
} & Record<string, any>;

export type RotationHandleProps = {
  /** Props for the rotation handle element */
  handle: HandleElementProps;
  /** Props for the connector line element (if shown) */
  connector: {
    style: CSSProperties;
  } & Record<string, any>;
};

export interface UseInteractionHandlesOptions {
  controller: UseDragResizeOptions; // may contain refs
  resizeUI?: ResizeUI;
  vertexUI?: VertexUI;
  rotationUI?: RotationUI;
  includeVertices?: boolean;
  includeRotation?: MaybeRef<boolean>;
  /** Current rotation angle of the annotation (for initializing rotation interaction) */
  currentRotation?: MaybeRef<number>;
  handleAttrs?: (
    h: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w',
  ) => Record<string, any> | void;
  vertexAttrs?: (i: number) => Record<string, any> | void;
  rotationAttrs?: () => Record<string, any> | void;
}

export function useInteractionHandles(opts: UseInteractionHandlesOptions) {
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

  // Owns live interaction handlers
  const { dragProps, createResizeProps, createVertexProps, createRotationProps } =
    useDragResize(controller);

  // Plain snapshots for the *descriptor* helpers
  const elementPlain = computed<Rect>(() => rectDTO(norm(controller.element)));
  const verticesPlain = computed<Position[] | undefined>(() =>
    controller.vertices ? vertsDTO(norm(controller.vertices)) : undefined,
  );
  const scalePlain = computed<number>(() => Number(norm(controller.scale ?? 1)));
  const rotationPlain = computed<number>(() => Number(norm(controller.pageRotation ?? 0)));
  const annotationRotationPlain = computed<number | undefined>(() =>
    controller.annotationRotation !== undefined
      ? Number(norm(controller.annotationRotation))
      : undefined,
  );
  const maintainPlain = computed<boolean | undefined>(() =>
    controller.maintainAspectRatio === undefined
      ? undefined
      : Boolean(norm(controller.maintainAspectRatio)),
  );
  const constraintsPlain = computed(() => norm(controller.constraints ?? undefined));

  // Rotation center and element for rotation handle positioning
  const rotationCenterPlain = computed<Position | undefined>(() =>
    controller.rotationCenter ? norm(controller.rotationCenter) : undefined,
  );
  const rotationElementPlain = computed<Rect | undefined>(() =>
    controller.rotationElement ? rectDTO(norm(controller.rotationElement)) : undefined,
  );

  const resize = computed<HandleElementProps[]>(() => {
    const desc = describeResizeFromConfig(
      {
        element: elementPlain.value,
        scale: scalePlain.value,
        pageRotation: rotationPlain.value,
        annotationRotation: annotationRotationPlain.value,
        maintainAspectRatio: maintainPlain.value,
        constraints: constraintsPlain.value,
      },
      resizeUI,
    );
    return desc.map((d) => ({
      key: (d.attrs?.['data-epdf-handle'] as string) ?? d.handle,
      style: d.style as CSSProperties,
      ...createResizeProps(d.handle),
      ...(d.attrs ?? {}),
      ...(handleAttrs?.(d.handle) ?? {}),
    }));
  });

  const vertices = computed<HandleElementProps[]>(() => {
    if (!includeVertices) return [];
    const verts = verticesPlain.value ?? [];
    const desc = describeVerticesFromConfig(
      { element: elementPlain.value, scale: scalePlain.value, vertices: verts },
      vertexUI,
      verts,
    );
    return desc.map((d, i) => ({
      key: i,
      style: d.style as CSSProperties,
      ...createVertexProps(i),
      ...(d.attrs ?? {}),
      ...(vertexAttrs?.(i) ?? {}),
    }));
  });

  // Rotation handle: orbits around the center of the element based on current angle
  const rotation = computed<RotationHandleProps | null>(() => {
    const showRotation = Boolean(norm(includeRotation ?? false));
    if (!showRotation) return null;
    const rot = Number(norm(currentRotation ?? 0));
    const desc = describeRotationFromConfig(
      {
        element: elementPlain.value,
        rotationCenter: rotationCenterPlain.value,
        rotationElement: rotationElementPlain.value,
        scale: scalePlain.value,
      },
      rotationUI,
      rot,
    );
    return {
      handle: {
        style: desc.handleStyle as CSSProperties,
        ...createRotationProps(rot, desc.radius),
        ...(desc.attrs ?? {}),
        ...(rotationAttrs?.() ?? {}),
      },
      connector: {
        style: desc.connectorStyle as CSSProperties,
        'data-epdf-rotation-connector': true,
      },
    };
  });

  return { dragProps, resize, vertices, rotation };
}
