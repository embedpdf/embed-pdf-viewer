import { useDragResize, type UseDragResizeOptions } from './use-drag-resize.svelte';
import {
  describeResizeFromConfig,
  describeVerticesFromConfig,
  describeRotationFromConfig,
  type ResizeUI,
  type VertexUI,
  type RotationUI,
} from '../../shared/plugin-interaction-primitives';
import { stylesToString } from '../utils/styles-to-string';

export type HandleElementProps = {
  key?: string | number;
  style: string;
  onpointerdown: (e: PointerEvent) => void;
  onpointermove: (e: PointerEvent) => void;
  onpointerup: (e: PointerEvent) => void;
  onpointercancel: (e: PointerEvent) => void;
} & Record<string, any>;

export type RotationHandleElementProps = {
  /** Props for the rotation handle element */
  handle: HandleElementProps;
  /** Props for the connector line element (if shown) */
  connector: {
    style: string;
  } & Record<string, any>;
};

export function useInteractionHandles(
  getOpts: () => {
    controller: UseDragResizeOptions;
    resizeUI?: ResizeUI;
    vertexUI?: VertexUI;
    rotationUI?: RotationUI;
    includeVertices?: boolean;
    includeRotation?: boolean;
    /** Current rotation angle of the annotation (for initializing rotation interaction) */
    currentRotation?: number;
    handleAttrs?: (
      h: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w',
    ) => Record<string, any> | void;
    vertexAttrs?: (i: number) => Record<string, any> | void;
    rotationAttrs?: () => Record<string, any> | void;
  },
) {
  // Use getter function and $derived to maintain reactivity
  const controller = $derived(getOpts().controller);
  const resizeUI = $derived(getOpts().resizeUI);
  const vertexUI = $derived(getOpts().vertexUI);
  const rotationUI = $derived(getOpts().rotationUI);
  const includeVertices = $derived(getOpts().includeVertices ?? false);
  const includeRotation = $derived(getOpts().includeRotation ?? false);
  const currentRotation = $derived(getOpts().currentRotation ?? 0);
  const handleAttrs = $derived(getOpts().handleAttrs);
  const vertexAttrs = $derived(getOpts().vertexAttrs);
  const rotationAttrs = $derived(getOpts().rotationAttrs);

  const dragResize = useDragResize(() => controller);

  // Resize handles: computed from controller config
  const resize = $derived.by((): HandleElementProps[] => {
    const desc = describeResizeFromConfig(controller, resizeUI);
    return desc.map((d) => ({
      key: d.attrs?.['data-epdf-handle'] as string,
      style: stylesToString(d.style),
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
      style: stylesToString(d.style),
      ...dragResize.createVertexProps(i),
      ...(d.attrs ?? {}),
      ...(vertexAttrs?.(i) ?? {}),
    }));
  });

  // Rotation handle: orbits around the center of the element based on current angle
  const rotation = $derived.by((): RotationHandleElementProps | null => {
    if (!includeRotation) return null;
    const desc = describeRotationFromConfig(controller, rotationUI, currentRotation);
    return {
      handle: {
        style: stylesToString(desc.handleStyle),
        ...dragResize.createRotationProps(currentRotation, desc.radius),
        ...(desc.attrs ?? {}),
        ...(rotationAttrs?.() ?? {}),
      },
      connector: {
        style: stylesToString(desc.connectorStyle),
        'data-epdf-rotation-connector': true,
      },
    };
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
    get rotation() {
      return rotation;
    },
  };
}
