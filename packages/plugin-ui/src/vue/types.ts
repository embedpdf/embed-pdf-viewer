import type { Component } from 'vue';
import { ToolbarSchema, PanelSchema, MenuSchema, SelectionMenuSchema } from '@embedpdf/plugin-ui';
import { SelectionMenuPropsBase } from '@embedpdf/utils/vue';
export type { SelectionMenuPropsBase };

export type UIComponents = Record<string, Component<BaseComponentProps>>;

/**
 * Base props that all custom components must accept
 */
export interface BaseComponentProps {
  documentId: string;
  [key: string]: any;
}

/**
 * Props for toolbar renderer
 * The app provides a component matching this contract
 */
export interface ToolbarRendererProps {
  schema: ToolbarSchema;
  documentId: string;
  isOpen: boolean;
  onClose?: () => void;
  className?: string;
}

export type ToolbarRenderer = Component<ToolbarRendererProps>;

/**
 * Props for panel renderer
 * The app provides a component matching this contract
 */
export interface PanelRendererProps {
  schema: PanelSchema;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export type PanelRenderer = Component<PanelRendererProps>;

/**
 * Props for menu renderer
 * The app provides a component matching this contract
 */
export interface MenuRendererProps {
  schema: MenuSchema;
  documentId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  container?: HTMLElement | null;
}

export type MenuRenderer = Component<MenuRendererProps>;

/**
 * Props for the selection menu renderer component
 */
export interface SelectionMenuRendererProps {
  schema: SelectionMenuSchema;
  documentId: string;
  /** Full props from the layer including context */
  props: SelectionMenuPropsBase;
}

export type SelectionMenuRenderer = Component<SelectionMenuRendererProps>;

/**
 * All renderers the app must provide
 */
export interface UIRenderers {
  toolbar: ToolbarRenderer;
  panel: PanelRenderer;
  menu: MenuRenderer;
  selectionMenu: SelectionMenuRenderer;
}
