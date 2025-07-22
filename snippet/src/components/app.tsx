import React, { useState, useEffect } from 'preact/compat';
import { h, Fragment } from 'preact';
import styles from '../styles/index.css';
import { EmbedPDF } from '@embedpdf/core/preact';
import { createPluginRegistration } from '@embedpdf/core';
import { usePdfiumEngine } from '@embedpdf/engines/preact';
import {
  AllLogger,
  ConsoleLogger,
  NoopLogger,
  PdfAnnotationSubtype,
  PerfLogger,
  Rotation,
} from '@embedpdf/models';
import {
  VIEWPORT_PLUGIN_ID,
  ViewportPluginConfig,
  ViewportPluginPackage,
  ViewportState,
} from '@embedpdf/plugin-viewport';
import { Viewport } from '@embedpdf/plugin-viewport/preact';
import {
  SCROLL_PLUGIN_ID,
  ScrollPlugin,
  ScrollPluginConfig,
  ScrollPluginPackage,
  ScrollState,
  ScrollStrategy,
} from '@embedpdf/plugin-scroll';
import { Scroller } from '@embedpdf/plugin-scroll/preact';
import {
  SPREAD_PLUGIN_ID,
  SpreadMode,
  SpreadPlugin,
  SpreadPluginConfig,
  SpreadPluginPackage,
  SpreadState,
} from '@embedpdf/plugin-spread';
import { LOADER_PLUGIN_ID, LoaderPlugin, LoaderPluginPackage } from '@embedpdf/plugin-loader';
import { FilePicker } from '@embedpdf/plugin-loader/preact';
import {
  MenuItem,
  defineComponent,
  GlobalStoreState,
  IconRegistry,
  UIComponentType,
  UIPlugin,
  UIPluginConfig,
  UIPluginPackage,
  isActive,
  UI_PLUGIN_ID,
  isDisabled,
} from '@embedpdf/plugin-ui';
import {
  attachmentsRenderer,
  commandMenuRenderer,
  commentRender,
  dividerRenderer,
  groupedItemsRenderer,
  headerRenderer,
  iconButtonRenderer,
  leftPanelMainRenderer,
  LeftPanelMainProps,
  outlineRenderer,
  pageControlsContainerRenderer,
  PageControlsProps,
  pageControlsRenderer,
  panelRenderer,
  searchRenderer,
  selectButtonRenderer,
  tabButtonRenderer,
  textSelectionMenuRenderer,
  thumbnailsRender,
  zoomRenderer,
  ZoomRendererProps,
  printModalRenderer,
  annotationSelectionMenuRenderer,
} from './renderers';
import { leftPanelAnnotationStyleRenderer } from './annotation-sidebar';
import { PluginUIProvider } from '@embedpdf/plugin-ui/preact';
import {
  ZOOM_PLUGIN_ID,
  ZoomMode,
  ZoomPlugin,
  ZoomPluginConfig,
  ZoomPluginPackage,
  ZoomState,
} from '@embedpdf/plugin-zoom';
import { RenderPluginPackage } from '@embedpdf/plugin-render';
import { RenderLayer } from '@embedpdf/plugin-render/preact';
import {
  ROTATE_PLUGIN_ID,
  RotatePlugin,
  RotatePluginConfig,
  RotatePluginPackage,
} from '@embedpdf/plugin-rotate';
import { Rotate } from '@embedpdf/plugin-rotate/preact';
import { SEARCH_PLUGIN_ID, SearchPluginPackage, SearchState } from '@embedpdf/plugin-search';
import { SearchLayer } from '@embedpdf/plugin-search/preact';
import {
  SELECTION_PLUGIN_ID,
  SelectionPlugin,
  SelectionPluginPackage,
  SelectionState,
} from '@embedpdf/plugin-selection';
import { SelectionLayer, CopyToClipboard } from '@embedpdf/plugin-selection/preact';
import { TilingPluginConfig, TilingPluginPackage } from '@embedpdf/plugin-tiling';
import { TilingLayer } from '@embedpdf/plugin-tiling/preact';
import { ThumbnailPluginConfig, ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail';
import {
  ANNOTATION_PLUGIN_ID,
  AnnotationPlugin,
  AnnotationPluginPackage,
  AnnotationState,
  getSelectedAnnotation,
  getSelectedAnnotationWithPageIndex,
  makeVariantKey,
} from '@embedpdf/plugin-annotation';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/preact';
import { PinchWrapper, MarqueeZoom } from '@embedpdf/plugin-zoom/preact';
import { LoadingIndicator } from './ui/loading-indicator';
import { PrintPluginConfig, PrintPluginPackage } from '@embedpdf/plugin-print';
import { PrintProvider } from '@embedpdf/plugin-print/preact';
import {
  FULLSCREEN_PLUGIN_ID,
  FullscreenPlugin,
  FullscreenPluginPackage,
  FullscreenState,
} from '@embedpdf/plugin-fullscreen';
import { FullscreenProvider } from '@embedpdf/plugin-fullscreen/preact';
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark';
import { EXPORT_PLUGIN_ID, ExportPlugin, ExportPluginPackage } from '@embedpdf/plugin-export';
import { Download } from '@embedpdf/plugin-export/preact';
import {
  INTERACTION_MANAGER_PLUGIN_ID,
  InteractionManagerPlugin,
  InteractionManagerPluginPackage,
  InteractionManagerState,
} from '@embedpdf/plugin-interaction-manager';
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/preact';
import { PanMode } from '@embedpdf/plugin-pan/preact';
import { PanPluginPackage } from '@embedpdf/plugin-pan';
import { CAPTURE_PLUGIN_ID, CapturePlugin, CapturePluginPackage } from '@embedpdf/plugin-capture';
import { MarqueeCapture } from '@embedpdf/plugin-capture/preact';
import { RichTextPluginPackage } from '@embedpdf/plugin-rich-text';
import {
  HISTORY_PLUGIN_ID,
  HistoryPlugin,
  HistoryPluginPackage,
  HistoryState,
} from '@embedpdf/plugin-history';
import { Capture } from './capture';
import { HintLayer } from './hint-layer';

export { ScrollStrategy, ZoomMode, SpreadMode, Rotation };

// **Enhanced Configuration Interface**
export interface PluginConfigs {
  viewport?: ViewportPluginConfig;
  scroll?: ScrollPluginConfig;
  zoom?: ZoomPluginConfig;
  spread?: SpreadPluginConfig;
  rotate?: RotatePluginConfig;
  tiling?: TilingPluginConfig;
  thumbnail?: ThumbnailPluginConfig;
  print?: PrintPluginConfig;
}

export interface PDFViewerConfig {
  src: string;
  worker?: boolean;
  wasmUrl?: string;
  plugins?: PluginConfigs;
  log?: boolean;
}

// **Default Plugin Configurations**
const DEFAULT_PLUGIN_CONFIGS: Required<PluginConfigs> = {
  viewport: {
    viewportGap: 10,
  },
  scroll: {
    strategy: ScrollStrategy.Vertical,
  },
  zoom: {
    defaultZoomLevel: ZoomMode.FitPage,
  },
  spread: {
    defaultSpreadMode: SpreadMode.None,
  },
  rotate: {
    defaultRotation: Rotation.Degree0,
  },
  tiling: {
    tileSize: 768,
    overlapPx: 2.5,
    extraRings: 0,
  },
  thumbnail: {
    width: 150,
    gap: 10,
    buffer: 3,
    labelHeight: 30,
  },
  print: {
    batchSize: 3,
  },
};

// **Utility function to merge configurations**
function mergePluginConfigs(userConfigs: PluginConfigs = {}): Required<PluginConfigs> {
  return {
    viewport: { ...DEFAULT_PLUGIN_CONFIGS.viewport, ...userConfigs.viewport },
    scroll: { ...DEFAULT_PLUGIN_CONFIGS.scroll, ...userConfigs.scroll },
    zoom: { ...DEFAULT_PLUGIN_CONFIGS.zoom, ...userConfigs.zoom },
    spread: { ...DEFAULT_PLUGIN_CONFIGS.spread, ...userConfigs.spread },
    rotate: { ...DEFAULT_PLUGIN_CONFIGS.rotate, ...userConfigs.rotate },
    tiling: { ...DEFAULT_PLUGIN_CONFIGS.tiling, ...userConfigs.tiling },
    thumbnail: { ...DEFAULT_PLUGIN_CONFIGS.thumbnail, ...userConfigs.thumbnail },
    print: { ...DEFAULT_PLUGIN_CONFIGS.print, ...userConfigs.print },
  };
}

// **Props for the PDFViewer Component**
interface PDFViewerProps {
  config: PDFViewerConfig;
}

type State = GlobalStoreState<{
  [ZOOM_PLUGIN_ID]: ZoomState;
  [VIEWPORT_PLUGIN_ID]: ViewportState;
  [SCROLL_PLUGIN_ID]: ScrollState;
  [SPREAD_PLUGIN_ID]: SpreadState;
  [SEARCH_PLUGIN_ID]: SearchState;
  [SELECTION_PLUGIN_ID]: SelectionState;
  [ANNOTATION_PLUGIN_ID]: AnnotationState;
  [FULLSCREEN_PLUGIN_ID]: FullscreenState;
  [INTERACTION_MANAGER_PLUGIN_ID]: InteractionManagerState;
  [HISTORY_PLUGIN_ID]: HistoryState;
}>;

export const icons: IconRegistry = {
  menu: {
    id: 'menu',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-menu"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8l16 0" /><path d="M4 16l16 0" /></svg>',
  },
  download: {
    id: 'download',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-download"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>',
  },
  fullscreen: {
    id: 'fullscreen',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-maximize"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" /></svg>',
  },
  fullscreenExit: {
    id: 'fullscreenExit',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-maximize-off"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8v-2c0 -.551 .223 -1.05 .584 -1.412" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2c.545 0 1.04 -.218 1.4 -.572" /><path d="M3 3l18 18" /></svg>',
  },
  save: {
    id: 'save',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-device-floppy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" /><path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M14 4l0 4l-6 0l0 -4" /></svg>',
  },
  print: {
    id: 'print',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-printer"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" /><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" /><path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" /></svg>',
  },
  settings: {
    id: 'settings',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-settings"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>',
  },
  viewSettings: {
    id: 'viewSettings',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-file-settings"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M12 10.5v1.5" /><path d="M12 16v1.5" /><path d="M15.031 12.25l-1.299 .75" /><path d="M10.268 15l-1.3 .75" /><path d="M15 15.803l-1.285 -.773" /><path d="M10.285 12.97l-1.285 -.773" /><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /></svg>',
  },
  rotateClockwise: {
    id: 'rotateClockwise',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-rotate-clockwise"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" /></svg>',
  },
  rotateCounterClockwise: {
    id: 'rotateCounterClockwise',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-rotate"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" /></svg>',
  },
  singlePage: {
    id: 'singlePage',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-columns-1"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 3m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z" /></svg>',
  },
  doublePage: {
    id: 'doublePage',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-columns-2"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 3m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1zm9 -1v18" /></svg>',
  },
  zoomIn: {
    id: 'zoomIn',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-circle-plus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M9 12h6" /><path d="M12 9v6" /></svg>',
  },
  zoomOut: {
    id: 'zoomOut',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-circle-minus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l6 0" /></svg>',
  },
  fitToWidth: {
    id: 'fitToWidth',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-autofit-width"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6" /><path d="M10 18h-7" /><path d="M21 18h-7" /><path d="M6 15l-3 3l3 3" /><path d="M18 15l3 3l-3 3" /></svg>',
  },
  fitToPage: {
    id: 'fitToPage',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-autofit-height"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 20h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h6" /><path d="M18 14v7" /><path d="M18 3v7" /><path d="M15 18l3 3l3 -3" /><path d="M15 6l3 -3l3 3" /></svg>',
  },
  chevronRight: {
    id: 'chevronRight',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 6l6 6l-6 6" /></svg>',
  },
  chevronLeft: {
    id: 'chevronLeft',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-left"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 6l-6 6l6 6" /></svg>',
  },
  chevronDown: {
    id: 'chevronDown',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-down"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>',
  },
  search: {
    id: 'search',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-search"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>',
  },
  comment: {
    id: 'comment',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-message-dots"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 11v.01" /><path d="M8 11v.01" /><path d="M16 11v.01" /><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z" /></svg>',
  },
  sidebar: {
    id: 'sidebar',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-sidebar-left"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 18v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M14 18v-12a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2 -2z" /></svg>',
  },
  dots: {
    id: 'dots',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-dots"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>',
  },
  vertical: {
    id: 'vertical',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrows-vertical"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 7l4 -4l4 4" /><path d="M8 17l4 4l4 -4" /><path d="M12 3l0 18" /></svg>',
  },
  horizontal: {
    id: 'horizontal',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrows-horizontal"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 8l-4 4l4 4" /><path d="M17 8l4 4l-4 4" /><path d="M3 12l18 0" /></svg>',
  },
  book: {
    id: 'book',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-book"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><path d="M3 6l0 13" /><path d="M12 6l0 13" /><path d="M21 6l0 13" /></svg>',
  },
  book2: {
    id: 'book2',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-book-2"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12z" /><path d="M19 16h-12a2 2 0 0 0 -2 2" /><path d="M9 8h6" /></svg>',
  },
  squares: {
    id: 'squares',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-squares"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 10a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-9a2 2 0 0 1 -2 -2z" /><path d="M16 8v-3a2 2 0 0 0 -2 -2h-9a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h3" /></svg>',
  },
  listTree: {
    id: 'listTree',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-list-tree"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 6h11" /><path d="M12 12h8" /><path d="M15 18h5" /><path d="M5 6v.01" /><path d="M8 12v.01" /><path d="M11 18v.01" /></svg>',
  },
  paperclip: {
    id: 'paperclip',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-paperclip"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" /></svg>',
  },
  copy: {
    id: 'copy',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-copy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>',
  },
  underline: {
    id: 'underline',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%"  height="100%" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-baseline"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 20h16" stroke="currentColor" /><path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" /><path d="M8 10h8" stroke="#000000" /></svg>',
  },
  squiggly: {
    id: 'squiggly',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%"  height="100%" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-baseline-wavy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" /><path d="M8 10h8" stroke="#000000" /><path d="M4 20c1.5 -1.5 3.5 -1.5 5 0s3.5 1.5 5 0 3.5 -1.5 5 0" stroke="currentColor" /></svg>',
  },
  strikethrough: {
    id: 'strikethrough',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%"  height="100%" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-baseline"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" /><path d="M4 10h16" stroke="currentColor" /></svg>',
  },
  highlight: {
    id: 'highlight',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%"  height="100%" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-baseline-highlight"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="2" y="6" width="20" height="16" rx="2" fill="currentColor" stroke="none" /><path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000"/><path d="M8 10h8" stroke="#000000"/></svg>',
  },
  palette: {
    id: 'palette',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-palette"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" /><path d="M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>',
  },
  x: {
    id: 'x',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-x"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>',
  },
  fileImport: {
    id: 'fileImport',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-file-import"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3" /></svg>',
  },
  hand: {
    id: 'hand',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-hand-stop"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" /><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" /><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" /><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" /></svg>',
  },
  zoomInArea: {
    id: 'zoomInArea',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-zoom-in-area"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 13v4" /><path d="M13 15h4" /><path d="M15 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" /><path d="M22 22l-3 -3" /><path d="M6 18h-1a2 2 0 0 1 -2 -2v-1" /><path d="M3 11v-1" /><path d="M3 6v-1a2 2 0 0 1 2 -2h1" /><path d="M10 3h1" /><path d="M15 3h1a2 2 0 0 1 2 2v1" /></svg>',
  },
  screenshot: {
    id: 'screenshot',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-screenshot"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 19a2 2 0 0 1 -2 -2" /><path d="M5 13v-2" /><path d="M5 7a2 2 0 0 1 2 -2" /><path d="M11 5h2" /><path d="M17 5a2 2 0 0 1 2 2" /><path d="M19 11v2" /><path d="M19 17v4" /><path d="M21 19h-4" /><path d="M13 19h-2" /></svg>',
  },
  arrowBackUp: {
    id: 'arrowBackUp',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-back-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>',
  },
  arrowForwardUp: {
    id: 'arrowForwardUp',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-forward-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 14l4 -4l-4 -4" /><path d="M19 10h-11a4 4 0 1 0 0 8h1" /></svg>',
  },
  trash: {
    id: 'trash',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-trash"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>',
  },
  deviceFloppy: {
    id: 'deviceFloppy',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-device-floppy"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" /><path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M14 4l0 4l-6 0l0 -4" /></svg>',
  },
  pencilMarker: {
    id: 'pencilMarker',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24" class="icon icon-tabler icons-tabler-outline icon-tabler-writing-draw" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" fill="none"><g transform="rotate(47.565 12.1875 10.75)"><path stroke="#000000" d="m14.18752,16.75l0,-12c0,-1.1 -0.9,-2 -2,-2s-2,0.9 -2,2l0,12l2,2l2,-2z"/><path stroke="#000000" d="m10.18752,6.75l4,0"/></g><path stroke="currentColor" d="m19.37499,20.125c0.56874,0.0625 -4.04999,-0.5625 -6.41249,-0.4375c-2.3625,0.125 -4.75833,1.22916 -6.85624,1.625c-1.76458,0.6875 -3.40416,-0.9375 -1.98125,-2.49999"/></svg>',
  },
  text: {
    id: 'text',
    svg: '<svg  xmlns="http://www.w3.org/2000/svg"  width="100%"  height="100%"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-letter-case"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17.5 15.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0" /><path d="M3 19v-10.5a3.5 3.5 0 0 1 7 0v10.5" /><path d="M3 13h7" /><path d="M21 12v7" /></svg>',
  },
};

export const menuItems: Record<string, MenuItem<State>> = {
  menuCtr: {
    id: 'menuCtr',
    icon: 'menu',
    label: 'Menu',
    //shortcut: 'Shift+M',
    //shortcutLabel: 'M',
    type: 'menu',
    children: ['openFile', 'download', 'enterFS', 'screenshot', 'print'],
    active: (storeState) =>
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'menuCtr',
  },
  download: {
    id: 'download',
    icon: 'download',
    label: 'Download',
    //shortcut: 'Shift+D',
    //shortcutLabel: 'D',
    type: 'action',
    action: (registry) => {
      const exportPlugin = registry.getPlugin<ExportPlugin>(EXPORT_PLUGIN_ID)?.provides();
      if (exportPlugin) {
        exportPlugin.download();
      }
    },
  },
  openFile: {
    id: 'openFile',
    icon: 'fileImport',
    label: 'Open PDF',
    type: 'action',
    action: (registry) => {
      const loader = registry.getPlugin<LoaderPlugin>(LOADER_PLUGIN_ID)?.provides();
      if (loader) {
        loader.openFileDialog();
      }
    },
  },
  enterFS: {
    id: 'enterFS',
    icon: (storeState) => {
      const fullscreen = storeState.plugins.fullscreen.isFullscreen
        ? 'fullscreenExit'
        : 'fullscreen';
      return fullscreen;
    },
    label: (storeState) => {
      const fullscreen = storeState.plugins.fullscreen.isFullscreen
        ? 'Exit full screen'
        : 'Enter full screen';
      return fullscreen;
    },
    //shortcut: 'Shift+F',
    //shortcutLabel: 'F',
    type: 'action',
    action: (registry) => {
      const fullscreen = registry.getPlugin<FullscreenPlugin>(FULLSCREEN_PLUGIN_ID)?.provides();
      if (fullscreen) {
        if (fullscreen.isFullscreen()) {
          fullscreen.exitFullscreen();
        } else {
          fullscreen.enableFullscreen();
        }
      }
    },
  },
  screenshot: {
    id: 'screenshot',
    icon: 'screenshot',
    label: 'Screenshot',
    type: 'action',
    action: (registry) => {
      const capture = registry.getPlugin<CapturePlugin>(CAPTURE_PLUGIN_ID)?.provides();
      if (!capture) return;

      if (capture.isMarqueeCaptureActive()) {
        capture.disableMarqueeCapture();
      } else {
        capture.enableMarqueeCapture();
      }
    },
    active: (storeState) =>
      storeState.plugins[INTERACTION_MANAGER_PLUGIN_ID].activeMode === 'marqueeCapture',
  },
  save: {
    id: 'save',
    icon: 'save',
    label: 'Save',
    //shortcut: 'Shift+S',
    //shortcutLabel: 'S',
    type: 'action',
    action: () => {
      console.log('save');
    },
  },
  print: {
    id: 'print',
    icon: 'print',
    label: 'Print',
    //shortcut: 'Shift+P',
    //shortcutLabel: 'P',
    type: 'action',
    action: (registry, state) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();
      if (ui) {
        ui.updateComponentState({
          componentType: 'floating',
          componentId: 'printModal',
          patch: {
            open: true,
          },
        });
      }
    },
  },
  settings: {
    id: 'settings',
    icon: 'settings',
    label: 'Settings',
    //shortcut: 'Shift+E',
    //shortcutLabel: 'E',
    dividerBefore: true,
    type: 'action',
    action: () => {
      console.log('settings');
    },
  },
  /* --- View controls menu --- */
  viewCtr: {
    id: 'viewCtr',
    icon: 'viewSettings',
    label: 'View controls',
    //shortcut: 'Shift+V',
    //shortcutLabel: 'V',
    type: 'menu',
    children: ['pageOrientation', 'scrollLayout', 'pageLayout', 'enterFS'],
    active: (storeState) =>
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'viewCtr',
  },
  pageOrientation: {
    id: 'pageOrientation',
    label: 'Page orientation',
    type: 'group',
    children: ['rotateClockwise', 'rotateCounterClockwise'],
  },
  rotateClockwise: {
    id: 'rotateClockwise',
    label: 'Rotate clockwise',
    icon: 'rotateClockwise',
    type: 'action',
    action: (registry) => {
      const rotate = registry.getPlugin<RotatePlugin>(ROTATE_PLUGIN_ID)?.provides();
      if (rotate) {
        rotate.rotateForward();
      }
    },
  },
  rotateCounterClockwise: {
    id: 'rotateCounterClockwise',
    label: 'Rotate counter clockwise',
    icon: 'rotateCounterClockwise',
    type: 'action',
    action: (registry) => {
      const rotate = registry.getPlugin<RotatePlugin>(ROTATE_PLUGIN_ID)?.provides();
      if (rotate) {
        rotate.rotateBackward();
      }
    },
  },
  scrollLayout: {
    id: 'scrollLayout',
    label: 'Scroll layout',
    type: 'group',
    children: ['vertical', 'horizontal'],
  },
  vertical: {
    id: 'vertical',
    label: 'Vertical',
    icon: 'vertical',
    type: 'action',
    active: (storeState) => storeState.plugins.scroll.strategy === ScrollStrategy.Vertical,
    action: (registry) => {
      const scroll = registry.getPlugin<ScrollPlugin>(SCROLL_PLUGIN_ID)?.provides();
      if (scroll) {
        scroll.setScrollStrategy(ScrollStrategy.Vertical);
      }
    },
  },
  horizontal: {
    id: 'horizontal',
    label: 'Horizontal',
    icon: 'horizontal',
    type: 'action',
    active: (storeState) => storeState.plugins.scroll.strategy === ScrollStrategy.Horizontal,
    action: (registry) => {
      const scroll = registry.getPlugin<ScrollPlugin>(SCROLL_PLUGIN_ID)?.provides();
      if (scroll) {
        scroll.setScrollStrategy(ScrollStrategy.Horizontal);
      }
    },
  },
  pageLayout: {
    id: 'pageLayout',
    label: 'Page layout',
    type: 'group',
    children: ['singlePage', 'doublePage', 'coverFacingPage'],
  },
  singlePage: {
    id: 'singlePage',
    label: 'Single page',
    icon: 'singlePage',
    type: 'action',
    disabled: (storeState) => storeState.plugins.scroll.strategy === ScrollStrategy.Horizontal,
    active: (storeState) => storeState.plugins.spread.spreadMode === SpreadMode.None,
    action: (registry) => {
      const spread = registry.getPlugin<SpreadPlugin>(SPREAD_PLUGIN_ID)?.provides();
      if (spread) {
        spread.setSpreadMode(SpreadMode.None);
      }
    },
  },
  doublePage: {
    id: 'doublePage',
    label: 'Double page',
    icon: 'book',
    type: 'action',
    disabled: (storeState) => storeState.plugins.scroll.strategy === ScrollStrategy.Horizontal,
    active: (storeState) => storeState.plugins.spread.spreadMode === SpreadMode.Odd,
    action: (registry) => {
      const spread = registry.getPlugin<SpreadPlugin>(SPREAD_PLUGIN_ID)?.provides();
      if (spread) {
        spread.setSpreadMode(SpreadMode.Odd);
      }
    },
  },
  coverFacingPage: {
    id: 'coverFacingPage',
    label: 'Cover facing page',
    icon: 'book2',
    type: 'action',
    disabled: (storeState) => storeState.plugins.scroll.strategy === ScrollStrategy.Horizontal,
    active: (storeState) => storeState.plugins.spread.spreadMode === SpreadMode.Even,
    action: (registry) => {
      const spread = registry.getPlugin<SpreadPlugin>(SPREAD_PLUGIN_ID)?.provides();
      if (spread) {
        spread.setSpreadMode(SpreadMode.Even);
      }
    },
  },
  leftAction: {
    id: 'leftAction',
    label: 'Left action',
    type: 'menu',
    icon: 'dots',
    children: ['viewCtr', 'zoom'],
    active: (storeState) =>
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'leftAction' ||
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'zoom' ||
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'changeZoomLevel' ||
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'viewCtr',
  },
  zoom: {
    id: 'zoom',
    icon: 'zoomIn',
    label: 'Zoom Controls',
    //shortcut: 'Shift+Z',
    //shortcutLabel: 'Z',
    type: 'menu',
    children: ['changeZoomLevel', 'zoomIn', 'zoomOut', 'fitToWidth', 'fitToPage', 'zoomInArea'],
    active: (storeState) => storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'zoom',
  },
  zoomInArea: {
    id: 'zoomInArea',
    label: 'Zoom in area',
    icon: 'zoomInArea',
    type: 'action',
    dividerBefore: true,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();
      if (!zoom) return;

      if (zoom.isMarqueeZoomActive()) {
        zoom.disableMarqueeZoom();
      } else {
        zoom.enableMarqueeZoom();
      }
    },
    active: (storeState) =>
      storeState.plugins[INTERACTION_MANAGER_PLUGIN_ID].activeMode === 'marqueeZoom',
  },
  changeZoomLevel: {
    id: 'changeZoomLevel',
    label: (storeState) =>
      `Zoom level (${(storeState.plugins.zoom.currentZoomLevel * 100).toFixed(0)}%)`,
    type: 'menu',
    children: [
      'zoom25',
      'zoom50',
      'zoom100',
      'zoom125',
      'zoom150',
      'zoom200',
      'zoom400',
      'zoom800',
      'zoom1600',
    ],
    active: (storeState) =>
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'changeZoomLevel',
  },
  zoom25: {
    id: 'zoom25',
    label: '25%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 0.25,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(0.25);
      }
    },
  },
  zoom50: {
    id: 'zoom50',
    label: '50%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 0.5,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(0.5);
      }
    },
  },
  zoom100: {
    id: 'zoom100',
    label: '100%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 1,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(1);
      }
    },
  },
  zoom125: {
    id: 'zoom125',
    label: '125%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 1.25,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(1.25);
      }
    },
  },
  zoom150: {
    id: 'zoom150',
    label: '150%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 1.5,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(1.5);
      }
    },
  },
  zoom200: {
    id: 'zoom200',
    label: '200%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 2,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(2);
      }
    },
  },
  zoom400: {
    id: 'zoom400',
    label: '400%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 4,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(4);
      }
    },
  },
  zoom800: {
    id: 'zoom800',
    label: '800%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 8,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(8);
      }
    },
  },
  zoom1600: {
    id: 'zoom1600',
    label: '1600%',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.currentZoomLevel === 16,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(16);
      }
    },
  },
  zoomIn: {
    id: 'zoomIn',
    label: 'Zoom in',
    icon: 'zoomIn',
    type: 'action',
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.zoomIn();
      }
    },
  },
  zoomOut: {
    id: 'zoomOut',
    label: 'Zoom out',
    icon: 'zoomOut',
    type: 'action',
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.zoomOut();
      }
    },
  },
  search: {
    id: 'search',
    label: 'Search',
    icon: 'search',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({ id: 'rightPanel', visibleChild: 'search' });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.panel.rightPanel.open === true &&
      storeState.plugins.ui.panel.rightPanel.visibleChild === 'search',
  },
  comment: {
    id: 'comment',
    label: 'Comment',
    icon: 'comment',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({ id: 'rightPanel', visibleChild: 'comment' });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.panel.rightPanel.open === true &&
      storeState.plugins.ui.panel.rightPanel.visibleChild === 'comment',
  },
  fitToWidth: {
    id: 'fitToWidth',
    label: 'Fit to width',
    icon: 'fitToWidth',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.zoomLevel === ZoomMode.FitWidth,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(ZoomMode.FitWidth);
      }
    },
  },
  fitToPage: {
    id: 'fitToPage',
    label: 'Fit to page',
    icon: 'fitToPage',
    type: 'action',
    active: (storeState) => storeState.plugins.zoom.zoomLevel === ZoomMode.FitPage,
    action: (registry) => {
      const zoom = registry.getPlugin<ZoomPlugin>(ZOOM_PLUGIN_ID)?.provides();

      if (zoom) {
        zoom.requestZoom(ZoomMode.FitPage);
      }
    },
  },
  sidebar: {
    id: 'sidebar',
    label: 'Sidebar',
    icon: 'sidebar',
    type: 'action',
    action: (registry, state) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({
          id: 'leftPanel',
          visibleChild: 'leftPanelMain',
          open:
            state.plugins.ui.panel.leftPanel.open === true &&
            state.plugins.ui.panel.leftPanel.visibleChild === 'leftPanelMain'
              ? false
              : true,
        });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.panel.leftPanel.open === true &&
      storeState.plugins.ui.panel.leftPanel.visibleChild === 'leftPanelMain',
  },
  sidebarMenu: {
    id: 'sidebarMenu',
    label: 'Sidebar Menu',
    type: 'menu',
    children: ['thumbnails', 'outline' /*, 'attachments'*/],
  },
  thumbnails: {
    id: 'thumbnails',
    label: 'Thumbnails',
    icon: 'squares',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({ id: 'leftPanel', visibleChild: 'leftPanelMain', open: true });
        ui.updateComponentState({
          componentType: 'custom',
          componentId: 'leftPanelMain',
          patch: {
            visibleChild: 'thumbnails',
          },
        });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.custom.leftPanelMain.visibleChild === 'thumbnails',
  },
  outline: {
    id: 'outline',
    label: 'Outline',
    icon: 'listTree',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({ id: 'leftPanel', visibleChild: 'leftPanelMain', open: true });
        ui.updateComponentState({
          componentType: 'custom',
          componentId: 'leftPanelMain',
          patch: {
            visibleChild: 'outline',
          },
        });
      }
    },
    active: (storeState) => storeState.plugins.ui.custom.leftPanelMain.visibleChild === 'outline',
  },
  attachments: {
    id: 'attachments',
    label: 'Attachments',
    icon: 'paperclip',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({ id: 'leftPanel', visibleChild: 'leftPanelMain', open: true });
        ui.updateComponentState({
          componentType: 'custom',
          componentId: 'leftPanelMain',
          patch: {
            visibleChild: 'attachments',
          },
        });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.custom.leftPanelMain.visibleChild === 'attachments',
  },
  view: {
    id: 'view',
    label: 'View',
    type: 'action',
    //shortcut: 'Shift+V',
    //shortcutLabel: 'V',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (ui) {
        ui.setHeaderVisible({ id: 'toolsHeader', visible: false });
        annotation?.setActiveVariant(null);
      }
    },
    active: (storeState) => storeState.plugins.ui.header.toolsHeader.visible === false,
  },
  annotate: {
    id: 'annotate',
    label: 'Annotate',
    type: 'action',
    //shortcut: 'Shift+A',
    //shortcutLabel: 'A',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.setHeaderVisible({ id: 'toolsHeader', visible: true, visibleChild: 'annotationTools' });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.header.toolsHeader.visible === true &&
      storeState.plugins.ui.header.toolsHeader.visibleChild === 'annotationTools',
  },
  shapes: {
    id: 'shapes',
    label: 'Shapes',
    type: 'action',
    //shortcut: 'Shift+S',
    //shortcutLabel: 'S',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.setHeaderVisible({ id: 'toolsHeader', visible: true, visibleChild: 'shapeTools' });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.header.toolsHeader.visible === true &&
      storeState.plugins.ui.header.toolsHeader.visibleChild === 'shapeTools',
  },
  fillAndSign: {
    id: 'fillAndSign',
    label: 'Fill and Sign',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.setHeaderVisible({ id: 'toolsHeader', visible: true, visibleChild: 'fillAndSignTools' });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.header.toolsHeader.visible === true &&
      storeState.plugins.ui.header.toolsHeader.visibleChild === 'fillAndSignTools',
  },
  form: {
    id: 'form',
    label: 'Form',
    type: 'action',
    action: (registry) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.setHeaderVisible({ id: 'toolsHeader', visible: true, visibleChild: 'formTools' });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.header.toolsHeader.visible === true &&
      storeState.plugins.ui.header.toolsHeader.visibleChild === 'formTools',
  },
  tabOverflow: {
    id: 'tabOverflow',
    label: 'More',
    icon: 'dots',
    type: 'menu',
    children: ['view', 'annotate' /*,'shapes', 'fillAndSign', 'form'*/],
    active: (storeState) =>
      storeState.plugins.ui.commandMenu.commandMenu.activeCommand === 'tabOverflow',
  },
  nextPage: {
    id: 'nextPage',
    label: 'Next page',
    icon: 'chevronRight',
    shortcut: 'ArrowRight',
    shortcutLabel: 'Arrow Right',
    type: 'action',
    action: (registry) => {
      const scroll = registry.getPlugin<ScrollPlugin>(SCROLL_PLUGIN_ID)?.provides();

      if (scroll) {
        scroll.scrollToNextPage();
      }
    },
  },
  previousPage: {
    id: 'previousPage',
    label: 'Previous page',
    icon: 'chevronLeft',
    type: 'action',
    shortcut: 'ArrowLeft',
    shortcutLabel: 'Arrow Left',
    action: (registry) => {
      const scroll = registry.getPlugin<ScrollPlugin>(SCROLL_PLUGIN_ID)?.provides();

      if (scroll) {
        scroll.scrollToPreviousPage();
      }
    },
  },
  copy: {
    id: 'copy',
    label: 'Copy',
    icon: 'copy',
    type: 'action',
    shortcut: 'Meta+C',
    shortcutLabel: 'Cmd+C',
    action: (registry) => {
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      if (selection) {
        selection.copyToClipboard();
        selection.clear();
      }
    },
  },
  underline: {
    id: 'underline',
    label: 'Underline',
    type: 'action',
    icon: 'underline',
    action: (registry, state) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        if (
          state.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.UNDERLINE)
        ) {
          annotation.setActiveVariant(null);
        } else {
          annotation.setActiveVariant(makeVariantKey(PdfAnnotationSubtype.UNDERLINE));
        }
      }
    },
    active: (storeState) =>
      storeState.plugins.annotation.activeVariant ===
      makeVariantKey(PdfAnnotationSubtype.UNDERLINE),
  },
  squiggly: {
    id: 'squiggly',
    label: 'Squiggly',
    type: 'action',
    icon: 'squiggly',
    action: (registry, state) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        if (
          state.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.SQUIGGLY)
        ) {
          annotation.setActiveVariant(null);
        } else {
          annotation.setActiveVariant(makeVariantKey(PdfAnnotationSubtype.SQUIGGLY));
        }
      }
    },
    active: (storeState) =>
      storeState.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.SQUIGGLY),
  },
  strikethrough: {
    id: 'strikethrough',
    label: 'Strikethrough',
    type: 'action',
    icon: 'strikethrough',
    action: (registry, state) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        if (
          state.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.STRIKEOUT)
        ) {
          annotation.setActiveVariant(null);
        } else {
          annotation.setActiveVariant(makeVariantKey(PdfAnnotationSubtype.STRIKEOUT));
        }
      }
    },
    active: (storeState) =>
      storeState.plugins.annotation.activeVariant ===
      makeVariantKey(PdfAnnotationSubtype.STRIKEOUT),
  },
  highlight: {
    id: 'highlight',
    label: 'Highlight',
    type: 'action',
    icon: 'highlight',
    action: (registry, state) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        if (
          state.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT)
        ) {
          annotation.setActiveVariant(null);
        } else {
          annotation.setActiveVariant(makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT));
        }
      }
    },
    active: (storeState) =>
      storeState.plugins.annotation.activeVariant ===
      makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT),
  },
  freehand: {
    id: 'freehand',
    label: 'Freehand',
    type: 'action',
    icon: 'pencilMarker',
    action: (registry, state) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        console.log(state.plugins.annotation.activeVariant);
        if (state.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.INK)) {
          annotation.setActiveVariant(null);
        } else {
          annotation.deselectAnnotation();
          annotation.setActiveVariant(makeVariantKey(PdfAnnotationSubtype.INK));
        }
      }
    },
    active: (storeState) =>
      storeState.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.INK),
  },
  freeText: {
    id: 'freeText',
    label: 'Free Text',
    type: 'action',
    icon: 'text',
    action: (registry, state) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        if (
          state.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.FREETEXT)
        ) {
          annotation.setActiveVariant(null);
        } else {
          annotation.deselectAnnotation();
          annotation.setActiveVariant(makeVariantKey(PdfAnnotationSubtype.FREETEXT));
        }
      }
    },
    active: (storeState) =>
      storeState.plugins.annotation.activeVariant === makeVariantKey(PdfAnnotationSubtype.FREETEXT),
  },
  squigglySelection: {
    id: 'squigglySelection',
    label: 'Squiggly Selection',
    type: 'action',
    icon: 'squiggly',
    action: (registry) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      if (!selection || !annotation) return;

      const defaultSettings = annotation.getToolDefaults(
        makeVariantKey(PdfAnnotationSubtype.SQUIGGLY),
      );
      const formattedSelection = selection.getFormattedSelection();
      for (const selection of formattedSelection) {
        annotation.createAnnotation(selection.pageIndex, {
          id: Date.now() + Math.random(),
          type: PdfAnnotationSubtype.SQUIGGLY,
          color: defaultSettings.color,
          opacity: defaultSettings.opacity,
          pageIndex: selection.pageIndex,
          rect: selection.rect,
          segmentRects: selection.segmentRects,
        });
      }

      selection.clear();
    },
  },
  underlineSelection: {
    id: 'underlineSelection',
    label: 'Underline Selection',
    type: 'action',
    icon: 'underline',
    action: (registry) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      if (!selection || !annotation) return;

      const defaultSettings = annotation.getToolDefaults(
        makeVariantKey(PdfAnnotationSubtype.UNDERLINE),
      );
      const formattedSelection = selection.getFormattedSelection();
      for (const selection of formattedSelection) {
        annotation.createAnnotation(selection.pageIndex, {
          id: Date.now() + Math.random(),
          type: PdfAnnotationSubtype.UNDERLINE,
          color: defaultSettings.color,
          opacity: defaultSettings.opacity,
          pageIndex: selection.pageIndex,
          rect: selection.rect,
          segmentRects: selection.segmentRects,
        });
      }

      selection.clear();
    },
  },
  strikethroughSelection: {
    id: 'strikethroughSelection',
    label: 'Strikethrough Selection',
    type: 'action',
    icon: 'strikethrough',
    action: (registry) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      if (!selection || !annotation) return;

      const defaultSettings = annotation.getToolDefaults(
        makeVariantKey(PdfAnnotationSubtype.STRIKEOUT),
      );
      const formattedSelection = selection.getFormattedSelection();
      for (const selection of formattedSelection) {
        annotation.createAnnotation(selection.pageIndex, {
          id: Date.now() + Math.random(),
          type: PdfAnnotationSubtype.STRIKEOUT,
          color: defaultSettings.color,
          opacity: defaultSettings.opacity,
          pageIndex: selection.pageIndex,
          rect: selection.rect,
          segmentRects: selection.segmentRects,
        });
      }

      selection.clear();
    },
  },
  highlightSelection: {
    id: 'highlightSelection',
    label: 'Highlight Selection',
    type: 'action',
    icon: 'highlight',
    action: (registry) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const selection = registry.getPlugin<SelectionPlugin>(SELECTION_PLUGIN_ID)?.provides();
      if (!selection || !annotation) return;

      const defaultSettings = annotation.getToolDefaults(
        makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT),
      );
      const formattedSelection = selection.getFormattedSelection();
      for (const selection of formattedSelection) {
        annotation.createAnnotation(selection.pageIndex, {
          id: Date.now() + Math.random(),
          type: PdfAnnotationSubtype.HIGHLIGHT,
          color: defaultSettings.color,
          opacity: defaultSettings.opacity,
          pageIndex: selection.pageIndex,
          rect: selection.rect,
          segmentRects: selection.segmentRects,
        });
      }

      selection.clear();
    },
  },
  styleAnnotation: {
    id: 'styleAnnotation',
    label: 'Style',
    type: 'action',
    icon: 'palette',
    action: (registry, state) => {
      const ui = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID)?.provides();

      if (ui) {
        ui.togglePanel({
          id: 'leftPanel',
          visibleChild: 'leftPanelAnnotationStyle',
          open:
            state.plugins.ui.panel.leftPanel.open === true &&
            state.plugins.ui.panel.leftPanel.visibleChild === 'leftPanelAnnotationStyle'
              ? false
              : true,
        });
      }
    },
    active: (storeState) =>
      storeState.plugins.ui.panel.leftPanel.open === true &&
      storeState.plugins.ui.panel.leftPanel.visibleChild === 'leftPanelAnnotationStyle',
  },
  deleteAnnotation: {
    id: 'deleteAnnotation',
    label: 'Delete',
    type: 'action',
    icon: 'trash',
    action: (registry) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (!annotation) return;

      const selectedAnnotation = annotation.getSelectedAnnotation();
      if (!selectedAnnotation) return;

      annotation.deleteAnnotation(selectedAnnotation.object.pageIndex, selectedAnnotation.localId);
    },
  },
  panMode: {
    id: 'panMode',
    label: 'Pan',
    type: 'action',
    icon: 'hand',
    action: (registry) => {
      const interactionManager = registry
        .getPlugin<InteractionManagerPlugin>(INTERACTION_MANAGER_PLUGIN_ID)
        ?.provides();
      if (!interactionManager) return;

      if (interactionManager.getActiveMode() === 'panMode') {
        interactionManager.activate('default');
      } else {
        interactionManager.activate('panMode');
      }
    },
    active: (storeState) =>
      storeState.plugins[INTERACTION_MANAGER_PLUGIN_ID].activeMode === 'panMode',
  },
  undo: {
    id: 'undo',
    label: 'Undo',
    type: 'action',
    icon: 'arrowBackUp',
    action: (registry) => {
      const history = registry.getPlugin<HistoryPlugin>(HISTORY_PLUGIN_ID)?.provides();
      if (history) {
        history.undo();
      }
    },
    disabled: (storeState) => {
      const history = storeState.plugins[HISTORY_PLUGIN_ID];
      return !history.global.canUndo;
    },
  },
  redo: {
    id: 'redo',
    label: 'Redo',
    type: 'action',
    icon: 'arrowForwardUp',
    action: (registry) => {
      const history = registry.getPlugin<HistoryPlugin>(HISTORY_PLUGIN_ID)?.provides();
      if (history) {
        history.redo();
      }
    },
    disabled: (storeState) => {
      const history = storeState.plugins[HISTORY_PLUGIN_ID];
      return !history.global.canRedo;
    },
  },
  commitAnnotations: {
    id: 'commitAnnotations',
    label: 'Commit',
    type: 'action',
    icon: 'deviceFloppy',
    action: (registry) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      if (annotation) {
        annotation.commit();
      }
    },
  },
};

// Define components
export const components: Record<string, UIComponentType<State>> = {
  menuButton: {
    type: 'iconButton',
    id: 'menuButton',
    props: {
      commandId: 'menuCtr',
      active: false,
      label: 'Menu',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.menuCtr, storeState),
    }),
  },
  deleteAnnotationButton: {
    type: 'iconButton',
    id: 'deleteAnnotationButton',
    props: {
      commandId: 'deleteAnnotation',
      active: false,
      label: 'Delete',
    },
  },
  styleButton: {
    type: 'iconButton',
    id: 'styleButton',
    props: {
      commandId: 'styleAnnotation',
      active: false,
      label: 'Style',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.styleAnnotation, storeState),
    }),
  },
  undoButton: {
    type: 'iconButton',
    id: 'undoButton',
    props: {
      commandId: 'undo',
      disabled: false,
      label: 'Undo',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      disabled: isDisabled(menuItems.undo, storeState),
    }),
  },
  redoButton: {
    type: 'iconButton',
    id: 'redoButton',
    props: {
      commandId: 'redo',
      disabled: false,
      label: 'Redo',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      disabled: isDisabled(menuItems.redo, storeState),
    }),
  },
  commitAnnotationsButton: {
    type: 'iconButton',
    id: 'commitAnnotationsButton',
    props: {
      commandId: 'commitAnnotations',
      active: false,
      label: 'Commit',
    },
  },
  copyButton: {
    type: 'iconButton',
    id: 'copyButton',
    props: {
      commandId: 'copy',
      active: false,
      label: 'Copy',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.copy, storeState),
    }),
  },
  panModeButton: {
    type: 'iconButton',
    id: 'panModeButton',
    props: {
      commandId: 'panMode',
      active: false,
      label: 'Pan',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.panMode, storeState),
    }),
  },
  underlineButton: {
    type: 'iconButton',
    id: 'underlineButton',
    props: {
      commandId: 'underline',
      active: false,
      label: 'Underline',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.underline, storeState),
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.UNDERLINE)]!
          .color,
    }),
  },
  squigglyButton: {
    type: 'iconButton',
    id: 'squigglyButton',
    props: {
      commandId: 'squiggly',
      active: false,
      label: 'Squiggly',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.squiggly, storeState),
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.SQUIGGLY)]!
          .color,
    }),
  },
  strikethroughButton: {
    type: 'iconButton',
    id: 'strikethroughButton',
    props: {
      commandId: 'strikethrough',
      active: false,
      label: 'Strikethrough',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.strikethrough, storeState),
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.STRIKEOUT)]!
          .color,
    }),
  },
  highlightButton: {
    type: 'iconButton',
    id: 'highlightButton',
    props: {
      commandId: 'highlight',
      active: false,
      label: 'Highlight',
      color: '#ffcd45',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.highlight, storeState),
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT)]!
          .color,
    }),
  },
  freehandButton: {
    type: 'iconButton',
    id: 'freehandButton',
    props: {
      commandId: 'freehand',
      active: false,
      label: 'Freehand',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.freehand, storeState),
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.INK)]!.color,
    }),
  },
  freeTextButton: {
    type: 'iconButton',
    id: 'freeTextButton',
    props: {
      commandId: 'freeText',
      active: false,
      label: 'Free Text',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.freeText, storeState),
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.FREETEXT)]!
          .color,
    }),
  },
  highlightSelectionButton: {
    type: 'iconButton',
    id: 'highlightSelectionButton',
    props: {
      commandId: 'highlightSelection',
      color: '#ffcd45',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT)]!
          .color,
    }),
  },
  underlineSelectionButton: {
    type: 'iconButton',
    id: 'underlineSelectionButton',
    props: {
      commandId: 'underlineSelection',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.UNDERLINE)]!
          .color,
    }),
  },
  strikethroughSelectionButton: {
    type: 'iconButton',
    id: 'strikethroughSelectionButton',
    props: {
      commandId: 'strikethroughSelection',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.STRIKEOUT)]!
          .color,
    }),
  },
  squigglySelectionButton: {
    type: 'iconButton',
    id: 'squigglySelectionButton',
    props: {
      commandId: 'squigglySelection',
      color: '#e44234',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      color:
        storeState.plugins.annotation.toolDefaults[makeVariantKey(PdfAnnotationSubtype.SQUIGGLY)]!
          .color,
    }),
  },
  viewCtrButton: {
    type: 'iconButton',
    id: 'viewCtrButton',
    props: {
      commandId: 'viewCtr',
      active: false,
      label: 'View settings',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.viewCtr, storeState),
    }),
  },
  commentButton: {
    type: 'iconButton',
    id: 'commentButton',
    props: {
      active: false,
      commandId: 'comment',
      label: 'Comment',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.comment, storeState),
    }),
  },
  searchButton: {
    type: 'iconButton',
    id: 'searchButton',
    props: {
      active: false,
      commandId: 'search',
      label: 'Search',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.search, storeState),
    }),
  },
  filePickerButton: {
    type: 'iconButton',
    id: 'filePickerButton',
    props: {
      label: 'Open File',
      img: 'data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiAgd2lkdGg9IjI0IiAgaGVpZ2h0PSIyNCIgIHZpZXdCb3g9IjAgMCAyNCAyNCIgIGZpbGw9Im5vbmUiICBzdHJva2U9IiMzNDNhNDAiICBzdHJva2Utd2lkdGg9IjIiICBzdHJva2UtbGluZWNhcD0icm91bmQiICBzdHJva2UtbGluZWpvaW49InJvdW5kIiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbi10YWJsZXItb3V0bGluZSBpY29uLXRhYmxlci1maWxlLWltcG9ydCI+PHBhdGggc3Ryb2tlPSJub25lIiBkPSJNIDAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0xNCAzdjRhMSAxIDAgMCAwIDEgMWg0IiAvPjxwYXRoIGQ9Ik01IDEzdi04YTIgMiAwIDAgMSAyIC0yaDdsNSA1djExYTIgMiAwIDAgMSAtMiAyaC01LjVtLTkuNSAtMmg3bS0zIC0zbDMgM2wtMyAzIiAvPjwvc3ZnPg==',
    },
  },
  downloadButton: {
    type: 'iconButton',
    id: 'downloadButton',
    props: {
      label: 'Download',
      img: 'data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiAgd2lkdGg9IjI0IiAgaGVpZ2h0PSIyNCIgIHZpZXdCb3g9IjAgMCAyNCAyNCIgIGZpbGw9Im5vbmUiICBzdHJva2U9IiMzNDNhNDAiICBzdHJva2Utd2lkdGg9IjIiICBzdHJva2UtbGluZWNhcD0icm91bmQiICBzdHJva2UtbGluZWpvaW49InJvdW5kIiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItZG93bmxvYWQiPjxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik00IDE3djJhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMiAtMnYtMiIgLz48cGF0aCBkPSJNNyAxMWw1IDVsNSAtNSIgLz48cGF0aCBkPSJNMTIgNGwwIDEyIiAvPjwvc3ZnPg==',
    },
  },
  zoomButton: {
    type: 'iconButton',
    id: 'zoomButton',
    props: {
      commandId: 'zoom',
      label: 'Zoom',
      img: 'data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiAgd2lkdGg9IjI0IiAgaGVpZ2h0PSIyNCIgIHZpZXdCb3g9IjAgMCAyNCAyNCIgIGZpbGw9Im5vbmUiICBzdHJva2U9IiMzNDNhNDAiICBzdHJva2Utd2lkdGg9IjIiICBzdHJva2UtbGluZWNhcD0icm91bmQiICBzdHJva2UtbGluZWpvaW49InJvdW5kIiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItY2lyY2xlLXBsdXMiPjxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0zIDEyYTkgOSAwIDEgMCAxOCAwYTkgOSAwIDAgMCAtMTggMCIgLz48cGF0aCBkPSJNOSAxMmg2IiAvPjxwYXRoIGQ9Ik0xMiA5djYiIC8+PC9zdmc+',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active:
        isActive(menuItems.zoom, storeState) || isActive(menuItems.changeZoomLevel, storeState),
    }),
  },
  sidebarButton: {
    type: 'iconButton',
    id: 'sidebarButton',
    props: {
      commandId: 'sidebar',
      label: 'Sidebar',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.sidebar, storeState),
    }),
  },
  divider1: {
    type: 'divider',
    id: 'divider1',
  },
  expandLeftActionsButton: {
    type: 'iconButton',
    id: 'expandLeftActionsButton',
    props: {
      commandId: 'leftAction',
      label: 'Left Panel Actions',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.leftAction, storeState),
    }),
  },
  headerStart: {
    id: 'headerStart',
    type: 'groupedItems',
    slots: [
      { componentId: 'menuButton', priority: 0 },
      { componentId: 'divider1', priority: 1, className: 'flex' },
      { componentId: 'sidebarButton', priority: 2 },
      { componentId: 'expandLeftActionsButton', priority: 3, className: '@min-[400px]:hidden' },
      { componentId: 'viewCtrButton', priority: 4, className: 'hidden @min-[400px]:block' },
      { componentId: 'divider1', priority: 6, className: 'hidden @min-[400px]:flex' },
      {
        componentId: 'zoomButton',
        priority: 7,
        className: 'hidden @min-[400px]:block @min-[600px]:hidden',
      },
      { componentId: 'zoom', priority: 8, className: 'hidden @min-[600px]:block' },
      { componentId: 'divider1', priority: 9, className: 'hidden @min-[600px]:flex' },
      { componentId: 'panModeButton', priority: 10, className: 'hidden @min-[600px]:block' },
    ],
    props: {
      gap: 10,
    },
  },
  viewTab: {
    type: 'tabButton',
    id: 'viewTab',
    props: {
      label: 'View',
      commandId: 'view',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.view, storeState),
    }),
  },
  annotateTab: {
    type: 'tabButton',
    id: 'annotateTab',
    props: {
      label: 'Annotate',
      commandId: 'annotate',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.annotate, storeState),
    }),
  },
  shapesTab: {
    type: 'tabButton',
    id: 'shapesTab',
    props: {
      label: 'Shapes',
      commandId: 'shapes',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.shapes, storeState),
    }),
  },
  fillAndSignTab: {
    type: 'tabButton',
    id: 'fillAndSignTab',
    props: {
      label: 'Fill and Sign',
      commandId: 'fillAndSign',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.fillAndSign, storeState),
    }),
  },
  formTab: {
    type: 'tabButton',
    id: 'formTab',
    props: {
      label: 'Form',
      commandId: 'form',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.form, storeState),
    }),
  },
  tabOverflowButton: {
    type: 'iconButton',
    id: 'tabOverflowButton',
    props: {
      label: 'More',
      commandId: 'tabOverflow',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      active: isActive(menuItems.tabOverflow, storeState),
    }),
  },
  selectButton: {
    type: 'selectButton',
    id: 'selectButton',
    props: {
      menuCommandId: 'tabOverflow',
      commandIds: ['view', 'annotate'],
      activeCommandId: 'view',
      active: false,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      activeCommandId:
        ownProps.commandIds.find((commandId) => isActive(menuItems[commandId], storeState)) ??
        ownProps.commandIds[0],
      active: isActive(menuItems.tabOverflow, storeState),
    }),
  },
  headerCenter: {
    id: 'headerCenter',
    type: 'groupedItems',
    slots: [
      { componentId: 'selectButton', priority: 0, className: 'block @min-[500px]:hidden' },
      { componentId: 'viewTab', priority: 1, className: 'hidden @min-[500px]:block' },
      { componentId: 'annotateTab', priority: 2, className: 'hidden @min-[500px]:block' },
    ],
    props: {
      gap: 10,
    },
  },
  headerEnd: {
    id: 'headerEnd',
    type: 'groupedItems',
    slots: [
      { componentId: 'searchButton', priority: 1 },
      //{ componentId: 'commentButton', priority: 2 },
    ],
    props: {
      gap: 10,
    },
  },
  pageControls: defineComponent<
    { currentPage: number; pageCount: number },
    PageControlsProps,
    State
  >()({
    id: 'pageControls',
    type: 'custom',
    render: 'pageControls',
    initialState: {
      currentPage: 1,
      pageCount: 1,
    },
    props: (initialState) => ({
      currentPage: initialState.currentPage,
      pageCount: initialState.pageCount,
      nextPageCommandId: 'nextPage',
      previousPageCommandId: 'previousPage',
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      currentPage: storeState.plugins.scroll.currentPage,
      pageCount: storeState.core.document?.pageCount ?? 1,
    }),
  }),
  pageControlsContainer: {
    id: 'pageControlsContainer',
    type: 'floating',
    props: {
      scrollerPosition: 'outside',
    },
    render: 'pageControlsContainer',
    slots: [{ componentId: 'pageControls', priority: 0 }],
  },
  textSelectionMenuButtons: {
    id: 'textSelectionMenuButtons',
    type: 'groupedItems',
    slots: [
      { componentId: 'copyButton', priority: 0 },
      { componentId: 'highlightSelectionButton', priority: 1 },
      { componentId: 'underlineSelectionButton', priority: 2 },
      { componentId: 'strikethroughSelectionButton', priority: 3 },
      { componentId: 'squigglySelectionButton', priority: 4 },
    ],
    props: {
      gap: 10,
    },
  },
  printModal: {
    id: 'printModal',
    type: 'floating',
    render: 'printModal',
    initialState: {
      open: false,
    },
    props: (initialState) => ({
      open: initialState.open,
      scrollerPosition: 'outside',
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      open: storeState.plugins.ui.floating.printModal.open,
    }),
  },
  textSelectionMenu: {
    id: 'textSelectionMenu',
    type: 'floating',
    render: 'textSelectionMenu',
    props: {
      open: false,
      scrollerPosition: 'inside',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      isScolling: storeState.plugins.viewport.isScrolling,
      scale: storeState.core.scale,
      rotation: storeState.core.rotation,
      spread: storeState.plugins[SPREAD_PLUGIN_ID].spreadMode,
      open:
        storeState.plugins[SELECTION_PLUGIN_ID].active &&
        !storeState.plugins[SELECTION_PLUGIN_ID].selecting,
    }),
    slots: [{ componentId: 'textSelectionMenuButtons', priority: 0 }],
    getChildContext: {
      direction: 'horizontal',
    },
  },
  annotationSelectionMenuButtons: {
    id: 'annotationSelectionMenuButtons',
    type: 'groupedItems',
    slots: [
      { componentId: 'deleteAnnotationButton', priority: 0 },
      { componentId: 'styleButton', priority: 1 },
    ],
    props: {
      gap: 10,
    },
  },
  annotationSelectionMenu: {
    id: 'annotationSelectionMenu',
    type: 'floating',
    render: 'annotationSelectionMenu',
    props: {
      open: false,
      scrollerPosition: 'inside',
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      isScolling: storeState.plugins.viewport.isScrolling,
      scale: storeState.core.scale,
      rotation: storeState.core.rotation,
      selectedUid: storeState.plugins[ANNOTATION_PLUGIN_ID].selectedUid,
      open: storeState.plugins[ANNOTATION_PLUGIN_ID].selectedUid !== null,
    }),
    slots: [{ componentId: 'annotationSelectionMenuButtons', priority: 0 }],
    getChildContext: {
      direction: 'horizontal',
    },
  },
  topHeader: {
    type: 'header',
    id: 'topHeader',
    slots: [
      { componentId: 'headerStart', priority: 0 },
      { componentId: 'headerCenter', priority: 1 },
      { componentId: 'headerEnd', priority: 2 },
    ],
    getChildContext: (props) => ({
      direction:
        props.placement === 'top' || props.placement === 'bottom' ? 'horizontal' : 'vertical',
    }),
    props: {
      placement: 'top',
      style: {
        backgroundColor: '#ffffff',
        gap: '10px',
      },
    },
  },
  annotationTools: {
    id: 'annotationTools',
    type: 'groupedItems',
    slots: [
      { componentId: 'highlightButton', priority: 1 },
      { componentId: 'underlineButton', priority: 2 },
      { componentId: 'strikethroughButton', priority: 3 },
      { componentId: 'squigglyButton', priority: 4 },
      { componentId: 'freehandButton', priority: 5 },
      { componentId: 'freeTextButton', priority: 6 },
      { componentId: 'divider1', priority: 7 },
      { componentId: 'styleButton', priority: 8 },
      { componentId: 'divider1', priority: 9 },
      { componentId: 'undoButton', priority: 10 },
      { componentId: 'redoButton', priority: 11 },
    ],
    props: {
      gap: 10,
    },
  },
  toolsHeader: {
    type: 'header',
    id: 'toolsHeader',
    initialState: {
      visible: false,
      visibleChild: null,
    },
    props: (initialState) => ({
      placement: 'top',
      visible: initialState.visible,
      visibleChild: initialState.visibleChild,
      style: {
        backgroundColor: '#f1f3f5',
        justifyContent: 'center',
      },
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      visible: storeState.plugins.ui.header.toolsHeader.visible,
      visibleChild: storeState.plugins.ui.header.toolsHeader.visibleChild,
    }),
    slots: [{ componentId: 'annotationTools', priority: 0 }],
    getChildContext: (props) => ({
      direction:
        props.placement === 'top' || props.placement === 'bottom' ? 'horizontal' : 'vertical',
    }),
  },
  leftPanelAnnotationStyle: {
    id: 'leftPanelAnnotationStyle',
    type: 'custom',
    render: 'leftPanelAnnotationStyle',
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      selectedAnnotation: getSelectedAnnotationWithPageIndex(
        storeState.plugins[ANNOTATION_PLUGIN_ID],
      ),
      activeVariant: storeState.plugins[ANNOTATION_PLUGIN_ID].activeVariant,
      colorPresets: storeState.plugins[ANNOTATION_PLUGIN_ID].colorPresets,
      toolDefaults: storeState.plugins[ANNOTATION_PLUGIN_ID].toolDefaults,
    }),
  },
  leftPanelMain: defineComponent<{ visibleChild: string }, LeftPanelMainProps, State>()({
    id: 'leftPanelMain',
    type: 'custom',
    render: 'leftPanelMain',
    initialState: {
      visibleChild: 'thumbnails',
    },
    props: (initialState) => ({
      visibleChild: initialState.visibleChild,
      tabsCommandId: 'sidebarMenu',
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      visibleChild: storeState.plugins.ui.custom.leftPanelMain.visibleChild,
    }),
    slots: [
      { componentId: 'thumbnails', priority: 0 },
      { componentId: 'outline', priority: 1 },
      { componentId: 'attachments', priority: 2 },
    ],
  }),
  leftPanel: {
    id: 'leftPanel',
    type: 'panel',
    initialState: {
      open: false,
      visibleChild: 'leftPanelMain',
    },
    props: (initialState) => ({
      open: initialState.open,
      visibleChild: initialState.visibleChild,
      location: 'left',
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      open: storeState.plugins.ui.panel.leftPanel.open,
      visibleChild: storeState.plugins.ui.panel.leftPanel.visibleChild,
    }),
    slots: [
      { componentId: 'leftPanelMain', priority: 0 },
      { componentId: 'leftPanelAnnotationStyle', priority: 1 },
    ],
  },
  thumbnails: {
    id: 'thumbnails',
    type: 'custom',
    render: 'thumbnails',
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      currentPage: storeState.plugins.scroll.currentPage,
    }),
  },
  outline: {
    id: 'outline',
    type: 'custom',
    render: 'outline',
    props: {
      document: null,
    },
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      document: storeState.core.document,
    }),
  },
  attachments: {
    id: 'attachments',
    type: 'custom',
    render: 'attachments',
  },
  search: {
    id: 'search',
    type: 'custom',
    render: 'search',
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      flags: storeState.plugins.search.flags,
      results: storeState.plugins.search.results,
      total: storeState.plugins.search.total,
      activeResultIndex: storeState.plugins.search.activeResultIndex,
      active: storeState.plugins.search.active,
      query: storeState.plugins.search.query,
      loading: storeState.plugins.search.loading,
    }),
  },
  comment: {
    id: 'comment',
    type: 'custom',
    render: 'comment',
  },
  commandMenu: {
    id: 'commandMenu',
    type: 'commandMenu',
    initialState: {
      open: false,
      activeCommand: null,
      triggerElement: undefined,
      position: undefined,
      flatten: false,
    },
    props: (initialState) => ({
      open: initialState.open,
      activeCommand: initialState.activeCommand,
      triggerElement: initialState.triggerElement,
      position: initialState.position,
      flatten: initialState.flatten,
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      open: storeState.plugins.ui.commandMenu.commandMenu.open,
      activeCommand: storeState.plugins.ui.commandMenu.commandMenu.activeCommand,
      triggerElement: storeState.plugins.ui.commandMenu.commandMenu.triggerElement,
      position: storeState.plugins.ui.commandMenu.commandMenu.position,
      flatten: storeState.plugins.ui.commandMenu.commandMenu.flatten,
    }),
  },
  zoom: defineComponent<{ zoomLevel: number }, ZoomRendererProps, State>()({
    id: 'zoom',
    type: 'custom',
    render: 'zoom',
    initialState: {
      zoomLevel: 1,
    },
    props: (initialState) => ({
      zoomLevel: initialState.zoomLevel,
      commandZoomIn: menuItems.zoomIn.id,
      commandZoomOut: menuItems.zoomOut.id,
      commandZoomMenu: menuItems.zoom.id,
      zoomMenuActive: false,
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      zoomLevel: storeState.plugins.zoom.currentZoomLevel,
      zoomMenuActive:
        isActive(menuItems.zoom, storeState) || isActive(menuItems.changeZoomLevel, storeState),
    }),
  }),
  rightPanel: {
    id: 'rightPanel',
    type: 'panel',
    initialState: {
      open: false,
      visibleChild: null,
    },
    props: (initialState) => ({
      open: initialState.open,
      visibleChild: initialState.visibleChild,
      location: 'right',
    }),
    mapStateToProps: (storeState, ownProps) => ({
      ...ownProps,
      open: storeState.plugins.ui.panel.rightPanel.open,
      visibleChild: storeState.plugins.ui.panel.rightPanel.visibleChild,
    }),
    slots: [
      { componentId: 'search', priority: 0 },
      { componentId: 'comment', priority: 1 },
    ],
  },
};

// UIPlugin configuration
export const uiConfig: UIPluginConfig = {
  enabled: true,
  components,
  menuItems,
  icons,
};

const logger = new AllLogger([new ConsoleLogger(), new PerfLogger()]);

export function PDFViewer({ config }: PDFViewerProps) {
  const { engine, isLoading } = usePdfiumEngine({
    ...(config.wasmUrl && { wasmUrl: config.wasmUrl }),
    worker: config.worker,
    logger: config.log ? logger : undefined,
  });

  // **Merge user configurations with defaults**
  const pluginConfigs = mergePluginConfigs(config.plugins);

  if (!engine || isLoading)
    return (
      <>
        <style>{styles}</style>
        <div className="flex h-full w-full items-center justify-center">
          <LoadingIndicator size="lg" text="Initializing PDF engine..." />
        </div>
      </>
    );

  return (
    <>
      <style>{styles}</style>
      <EmbedPDF
        engine={engine}
        onInitialized={async (registry) => {
          const uiCapability = registry.getPlugin<UIPlugin>('ui')?.provides();

          if (uiCapability) {
            uiCapability.registerComponentRenderer('groupedItems', groupedItemsRenderer);
            uiCapability.registerComponentRenderer('iconButton', iconButtonRenderer);
            uiCapability.registerComponentRenderer('tabButton', tabButtonRenderer);
            uiCapability.registerComponentRenderer('header', headerRenderer);
            uiCapability.registerComponentRenderer('divider', dividerRenderer);
            uiCapability.registerComponentRenderer('panel', panelRenderer);
            uiCapability.registerComponentRenderer('search', searchRenderer);
            uiCapability.registerComponentRenderer('zoom', zoomRenderer);
            uiCapability.registerComponentRenderer(
              'pageControlsContainer',
              pageControlsContainerRenderer,
            );
            uiCapability.registerComponentRenderer('pageControls', pageControlsRenderer);
            uiCapability.registerComponentRenderer('commandMenu', commandMenuRenderer);
            uiCapability.registerComponentRenderer('comment', commentRender);
            uiCapability.registerComponentRenderer('thumbnails', thumbnailsRender);
            uiCapability.registerComponentRenderer('outline', outlineRenderer);
            uiCapability.registerComponentRenderer('attachments', attachmentsRenderer);
            uiCapability.registerComponentRenderer('selectButton', selectButtonRenderer);
            uiCapability.registerComponentRenderer('textSelectionMenu', textSelectionMenuRenderer);
            uiCapability.registerComponentRenderer(
              'annotationSelectionMenu',
              annotationSelectionMenuRenderer,
            );
            uiCapability.registerComponentRenderer('leftPanelMain', leftPanelMainRenderer);
            uiCapability.registerComponentRenderer('printModal', printModalRenderer);
            uiCapability.registerComponentRenderer(
              'leftPanelAnnotationStyle',
              leftPanelAnnotationStyleRenderer,
            );
          }
        }}
        plugins={[
          createPluginRegistration(UIPluginPackage, uiConfig),
          createPluginRegistration(LoaderPluginPackage, {
            loadingOptions: {
              type: 'url',
              pdfFile: {
                id: 'pdf',
                url: config.src,
              },
              options: {
                mode: 'full-fetch',
              },
            },
          }),
          createPluginRegistration(ViewportPluginPackage, pluginConfigs.viewport),
          createPluginRegistration(ScrollPluginPackage, pluginConfigs.scroll),
          createPluginRegistration(ZoomPluginPackage, pluginConfigs.zoom),
          createPluginRegistration(SpreadPluginPackage, pluginConfigs.spread),
          createPluginRegistration(RenderPluginPackage, {}),
          createPluginRegistration(RotatePluginPackage, pluginConfigs.rotate),
          createPluginRegistration(SearchPluginPackage, {}),
          createPluginRegistration(SelectionPluginPackage, {}),
          createPluginRegistration(TilingPluginPackage, pluginConfigs.tiling),
          createPluginRegistration(ThumbnailPluginPackage, pluginConfigs.thumbnail),
          createPluginRegistration(AnnotationPluginPackage, {}),
          createPluginRegistration(PrintPluginPackage, pluginConfigs.print),
          createPluginRegistration(FullscreenPluginPackage, {}),
          createPluginRegistration(BookmarkPluginPackage, {}),
          createPluginRegistration(ExportPluginPackage, {}),
          createPluginRegistration(InteractionManagerPluginPackage, {}),
          createPluginRegistration(PanPluginPackage, {}),
          createPluginRegistration(CapturePluginPackage, {
            scale: 2,
            imageType: 'image/png',
          }),
          createPluginRegistration(HistoryPluginPackage, {}),
          createPluginRegistration(RichTextPluginPackage, {
            document,
          }),
        ]}
      >
        {({ pluginsReady }) => (
          <PluginUIProvider>
            {({ headers, panels, floating, commandMenu }) => (
              <FullscreenProvider>
                <PrintProvider>
                  <div className="@container relative flex h-full w-full select-none flex-col">
                    {headers.top.length > 0 && <div>{headers.top}</div>}
                    <div className="flex flex-1 flex-row overflow-hidden">
                      <div className="flex flex-col">{headers.left}</div>
                      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
                        {panels.left.length > 0 && <Fragment>{panels.left}</Fragment>}
                        <div className="relative flex w-full flex-1 overflow-hidden">
                          <GlobalPointerProvider>
                            <PanMode />
                            <Viewport
                              style={{
                                width: '100%',
                                height: '100%',
                                flexGrow: 1,
                                backgroundColor: '#f1f3f5',
                                overflow: 'auto',
                              }}
                            >
                              {!pluginsReady && (
                                <div className="flex h-full w-full items-center justify-center">
                                  <LoadingIndicator size="lg" text="Loading PDF document..." />
                                </div>
                              )}
                              {pluginsReady && (
                                <PinchWrapper>
                                  <Scroller
                                    renderPage={({
                                      pageIndex,
                                      scale,
                                      rotation,
                                      width,
                                      height,
                                      rotatedHeight,
                                      rotatedWidth,
                                      document,
                                    }) => (
                                      <Rotate key={document?.id} pageSize={{ width, height }}>
                                        <PagePointerProvider
                                          rotation={rotation}
                                          scale={scale}
                                          pageWidth={rotatedWidth}
                                          pageHeight={rotatedHeight}
                                          pageIndex={pageIndex}
                                          style={{
                                            width,
                                            height,
                                          }}
                                        >
                                          <RenderLayer
                                            pageIndex={pageIndex}
                                            className="pointer-events-none"
                                          />
                                          <TilingLayer
                                            pageIndex={pageIndex}
                                            scale={scale}
                                            className="pointer-events-none"
                                          />
                                          <SearchLayer
                                            pageIndex={pageIndex}
                                            scale={scale}
                                            className="pointer-events-none"
                                          />
                                          <HintLayer />
                                          <AnnotationLayer
                                            pageIndex={pageIndex}
                                            scale={scale}
                                            pageWidth={width}
                                            pageHeight={height}
                                            rotation={rotation}
                                          />
                                          <MarqueeZoom
                                            pageIndex={pageIndex}
                                            scale={scale}
                                            pageWidth={width}
                                            pageHeight={height}
                                          />
                                          <MarqueeCapture
                                            pageIndex={pageIndex}
                                            scale={scale}
                                            pageWidth={width}
                                            pageHeight={height}
                                          />
                                          <SelectionLayer pageIndex={pageIndex} scale={scale} />
                                        </PagePointerProvider>
                                      </Rotate>
                                    )}
                                    overlayElements={floating.insideScroller}
                                  />
                                </PinchWrapper>
                              )}
                              {floating.outsideScroller}
                            </Viewport>
                          </GlobalPointerProvider>
                        </div>
                        {panels.right.length > 0 && <Fragment>{panels.right}</Fragment>}
                      </div>
                      <div className="flex flex-col">{headers.right}</div>
                    </div>
                    {headers.bottom.length > 0 && <div>{headers.bottom}</div>}
                    {commandMenu}
                  </div>
                  <FilePicker />
                  <Download />
                  <Capture />
                  <CopyToClipboard />
                </PrintProvider>
              </FullscreenProvider>
            )}
          </PluginUIProvider>
        )}
      </EmbedPDF>
    </>
  );
}
