// Hooks
export * from './hooks';

// Registries
export * from './registries';

// Provider
export { UIProvider } from './provider';
export type { UIProviderProps } from './provider';

// Types
export type {
  BaseComponentProps,
  ToolbarRendererProps,
  PanelRendererProps,
  MenuRendererProps,
  UIRenderers,
} from './types';

// Re-export plugin and schema types
export * from '@embedpdf/plugin-ui';
