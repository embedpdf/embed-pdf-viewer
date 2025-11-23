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

export function useInteractionHandles(
  getOpts: () => {
    controller: UseDragResizeOptions;
    resizeUI?: ResizeUI;
    vertexUI?: VertexUI;
    includeVertices?: boolean;
    handleAttrs?: (
      h: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w',
    ) => Record<string, any> | void;
    vertexAttrs?: (i: number) => Record<string, any> | void;
  },
) {
  // Use getter function and $derived to maintain reactivity
  const controller = $derived(getOpts().controller);
  const resizeUI = $derived(getOpts().resizeUI);
  const vertexUI = $derived(getOpts().vertexUI);
  const includeVertices = $derived(getOpts().includeVertices ?? false);
  const handleAttrs = $derived(getOpts().handleAttrs);
  const vertexAttrs = $derived(getOpts().vertexAttrs);

  const dragResize = useDragResize(() => controller);

  // Resize handles: computed from controller config
  const resize = $derived.by((): HandleElementProps[] => {
    const desc = describeResizeFromConfig(controller, resizeUI);
    return desc.map((d) => ({
      key: d.attrs?.['data-epdf-handle'] as string,
      style: d.style as Record<string, any>,
      ...dragResize.createResizeProps(d.handle),
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
      ...dragResize.createVertexProps(i),
      ...(d.attrs ?? {}),
      ...(vertexAttrs?.(i) ?? {}),
    }));
  });

  // Return getters to maintain reactivity when accessed from outside
  return {
    get dragProps() {
      return dragResize.dragProps;
    },
    get resize() {
      return resize;
    },
    get vertices() {
      return vertices;
    },
  };
}
