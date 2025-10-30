import { useDragResize, type UseDragResizeOptions } from './use-drag-resize.svelte';
import {
  describeResizeFromConfig,
  describeVerticesFromConfig,
  type ResizeUI,
  type VertexUI,
} from '../../shared/plugin-interaction-primitives';

export type HandleElementProps = {
  key: string | number;
  style: Record<string, any>;
  onpointerdown: (e: PointerEvent) => void;
  onpointermove: (e: PointerEvent) => void;
  onpointerup: (e: PointerEvent) => void;
  onpointercancel: (e: PointerEvent) => void;
} & Record<string, any>;

export function useInteractionHandles(opts: {
  controller: UseDragResizeOptions;
  resizeUI?: ResizeUI;
  vertexUI?: VertexUI;
  includeVertices?: boolean;
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

  const { dragProps, createResizeProps, createVertexProps } = $derived(useDragResize(controller));

  // Resize handles: computed from controller config
  const resize = $derived.by((): HandleElementProps[] => {
    const desc = describeResizeFromConfig(controller, resizeUI);
    return desc.map((d) => ({
      key: d.attrs?.['data-epdf-handle'] as string,
      style: d.style as Record<string, any>,
      ...createResizeProps(d.handle),
      ...(d.attrs ?? {}),
      ...(handleAttrs?.(d.handle) ?? {}),
    }));
  });

  // Vertex handles: computed from controller config and vertices
  const vertices = $derived.by((): HandleElementProps[] => {
    if (!includeVertices) return [];
    const desc = describeVerticesFromConfig(controller, vertexUI, controller.vertices);
    return desc.map((d, i) => ({
      key: i,
      style: d.style as Record<string, any>,
      ...createVertexProps(i),
      ...(d.attrs ?? {}),
      ...(vertexAttrs?.(i) ?? {}),
    }));
  });

  return {
    get dragProps() {
      return dragProps;
    },
    get resize() {
      return resize;
    },
    get vertices() {
      return vertices;
    },
  };
}
