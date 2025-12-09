import { EmbedPdfContainer } from './web-components/container';
import {
  PDFViewerConfig,
  PluginConfigs,
  ScrollStrategy,
  ZoomMode,
  SpreadMode,
  Rotation,
} from './components/app';

// Export theme types and utilities for customization
export {
  Theme,
  ThemeConfig,
  ThemeColors,
  ThemePreference,
  DeepPartial,
  lightTheme,
  darkTheme,
  createTheme,
} from './config/theme';

type ContainerConfig = PDFViewerConfig & {
  type: 'container';
  target: Element;
};

customElements.define('embedpdf-container', EmbedPdfContainer);

function initContainer(config: ContainerConfig) {
  const { type, target, ...viewerConfig } = config;
  const embedPdfElement = document.createElement('embedpdf-container') as EmbedPdfContainer;
  embedPdfElement.config = viewerConfig;
  config.target.appendChild(embedPdfElement);

  return embedPdfElement.registry;
}

export type ReturnContainerType = ReturnType<typeof initContainer>;

// Export types for users
export type { PluginConfigs, ScrollStrategy, ZoomMode, SpreadMode, Rotation };

export default {
  init: (
    config: ContainerConfig,
  ): ReturnType<typeof initContainer> | ReturnContainerType | undefined => {
    if (config.type === 'container') {
      return initContainer(config as ContainerConfig);
    }
  },
};
