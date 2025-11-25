import type { ComponentType } from '@framework';
import { ToolbarSchema, PanelSchema, MenuSchema } from '@embedpdf/plugin-ui';

export type UIComponents = Record<string, ComponentType<BaseComponentProps>>;

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

export type ToolbarRenderer = ComponentType<ToolbarRendererProps>;

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

export type PanelRenderer = ComponentType<PanelRendererProps>;

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

export type MenuRenderer = ComponentType<MenuRendererProps>;

/**
 * All renderers the app must provide
 */
export interface UIRenderers {
  toolbar: ToolbarRenderer;
  panel: PanelRenderer;
  menu: MenuRenderer;
}
