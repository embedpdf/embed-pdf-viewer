import type { CSSProperties } from 'vue';
import type { SelectionMenuPropsBase, SelectionMenuRenderFn } from '@embedpdf/utils/vue';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface AnnotationSelectionContext {
  type: 'annotation';
  annotation: TrackedAnnotation;
  pageIndex: number;
}

export interface GroupSelectionContext {
  type: 'group';
  annotations: TrackedAnnotation[];
  pageIndex: number;
}

// For manual component props
export type AnnotationSelectionMenuProps = SelectionMenuPropsBase<AnnotationSelectionContext>;
export type AnnotationSelectionMenuRenderFn = SelectionMenuRenderFn<AnnotationSelectionContext>;

export type GroupSelectionMenuProps = SelectionMenuPropsBase<GroupSelectionContext>;
export type GroupSelectionMenuRenderFn = SelectionMenuRenderFn<GroupSelectionContext>;

/** UI customization for resize handles (Vue) */
export interface ResizeHandleUI {
  /** Handle size in CSS px (default: 12) */
  size?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  // Note: Use #resize-handle slot for custom rendering instead of component prop
}

/** UI customization for vertex handles (Vue) */
export interface VertexHandleUI {
  /** Handle size in CSS px (default: 12) */
  size?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  // Note: Use #vertex-handle slot for custom rendering instead of component prop
}

/** UI customization for rotation handle (Vue) */
export interface RotationHandleUI {
  /** Handle size in CSS px (default: 32) */
  size?: number;
  /** Gap in CSS px between the bounding box edge and the rotation handle center (default: 20) */
  margin?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Color for the connector line (default: same as color) */
  connectorColor?: string;
  /** Whether to show the connector line (default: false) */
  showConnector?: boolean;
  /** Color for the icon inside the handle (default: "white") */
  iconColor?: string;
  // Note: Use #rotation-handle slot for custom rendering instead of component prop
}

/** Slot props passed to the `#rotation-handle` scoped slot */
export interface RotationHandleSlotProps {
  key: string | number;
  style: CSSProperties;
  backgroundColor: string;
  iconColor: string;
  connectorStyle: CSSProperties;
  showConnector: boolean;
  opacity: number;
  [key: string]: any; // pointer event handlers + data attrs
}

export type SelectionOutlineStyle = 'solid' | 'dashed' | 'dotted';

/** Customize the selection outline (color, style, width, offset) */
export interface SelectionOutline {
  /** Outline color (default: '#007ACC') */
  color?: string;
  /** Outline style (default: 'solid' for single, 'dashed' for group) */
  style?: SelectionOutlineStyle;
  /** Outline width in px (default: 1 for single, 2 for group) */
  width?: number;
  /** Outline offset in px (default: 1 for single, 2 for group) */
  offset?: number;
}
