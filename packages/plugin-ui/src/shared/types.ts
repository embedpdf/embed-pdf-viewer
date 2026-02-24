import type { ComponentType } from '@framework';
import {
  ToolbarSchema,
  SidebarSchema,
  ModalSchema,
  OverlaySchema,
  MenuSchema,
  SelectionMenuSchema,
} from '@embedpdf/plugin-ui';
import type { SelectionMenuPropsBase } from '@embedpdf/utils/@framework';

export type { SelectionMenuPropsBase };

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
 * Props for sidebar renderer
 * The app provides a component matching this contract
 */
export interface SidebarRendererProps {
  schema: SidebarSchema;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export type SidebarRenderer = ComponentType<SidebarRendererProps>;

/**
 * Props for modal renderer (with animation lifecycle support)
 * The app provides a component matching this contract
 */
export interface ModalRendererProps {
  schema: ModalSchema;
  documentId: string;
  isOpen: boolean; // false = animate out, true = visible
  onClose: () => void; // Triggers closeModal()
  onExited: () => void; // Triggers clearModal() after animation completes
  className?: string;
  modalProps?: Record<string, unknown>; // Props passed when opening the modal
}

export type ModalRenderer = ComponentType<ModalRendererProps>;

/**
 * Props for overlay renderer
 * The app provides a component matching this contract
 */
export interface OverlayRendererProps {
  schema: OverlaySchema;
  documentId: string;
  className?: string;
}

export type OverlayRenderer = ComponentType<OverlayRendererProps>;

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
 * Props for the selection menu renderer component
 */
export interface SelectionMenuRendererProps {
  schema: SelectionMenuSchema;
  documentId: string;
  /** Full props from the layer including context */
  props: SelectionMenuPropsBase;
}

export type SelectionMenuRenderer = ComponentType<SelectionMenuRendererProps>;

/**
 * All renderers the app must provide
 */
export interface UIRenderers {
  toolbar: ToolbarRenderer;
  sidebar: SidebarRenderer;
  modal?: ModalRenderer; // Optional for backwards compatibility
  overlay?: OverlayRenderer; // Optional, renders floating overlays
  menu: MenuRenderer;
  selectionMenu: SelectionMenuRenderer;
}
