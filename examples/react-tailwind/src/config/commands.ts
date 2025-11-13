import { Command } from '@embedpdf/plugin-commands/react';
import { CapturePlugin } from '@embedpdf/plugin-capture/react';
import { ZoomMode, ZoomPlugin } from '@embedpdf/plugin-zoom/react';
import { PanPlugin } from '@embedpdf/plugin-pan/react';
import { SpreadMode, SpreadPlugin } from '@embedpdf/plugin-spread/react';
import { RotatePlugin } from '@embedpdf/plugin-rotate/react';
import {
  ANNOTATION_PLUGIN_ID,
  AnnotationPlugin,
  getToolDefaultsById,
} from '@embedpdf/plugin-annotation/react';
import {
  REDACTION_PLUGIN_ID,
  RedactionMode,
  RedactionPlugin,
} from '@embedpdf/plugin-redaction/react';
import { PrintPlugin } from '@embedpdf/plugin-print/react';
import { ExportPlugin } from '@embedpdf/plugin-export/react';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager/react';
import { HISTORY_PLUGIN_ID, HistoryPlugin } from '@embedpdf/plugin-history/react';
import { State } from './types';
import { UI_PLUGIN_ID, UIPlugin } from '@embedpdf/plugin-ui';
import { ScrollPlugin, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { InteractionManagerPlugin } from '@embedpdf/plugin-interaction-manager';

export const commands: Record<string, Command<State>> = {
  // ─────────────────────────────────────────────────────────
  // Zoom Commands
  // ─────────────────────────────────────────────────────────
  'zoom:in': {
    id: 'zoom:in',
    label: 'Zoom In',
    icon: 'SearchPlus',
    shortcuts: ['Ctrl+=', 'Meta+=', 'Ctrl+NumpadAdd', 'Meta+NumpadAdd'],
    category: 'view',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.zoomIn();
    },
  },

  'zoom:out': {
    id: 'zoom:out',
    label: 'Zoom Out',
    icon: 'SearchMinus',
    shortcuts: ['Ctrl+-', 'Meta+-', 'Ctrl+NumpadSubtract', 'Meta+NumpadSubtract'],
    category: 'view',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.zoomOut();
    },
  },

  'zoom:fit-page': {
    id: 'zoom:fit-page',
    label: 'Fit to Page',
    icon: 'FitPage',
    shortcuts: ['Ctrl+0', 'Meta+0'],
    category: 'tools',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(ZoomMode.FitPage);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === ZoomMode.FitPage,
  },

  'zoom:fit-width': {
    id: 'zoom:fit-width',
    label: 'Fit to Width',
    icon: 'FitWidth',
    shortcuts: ['Ctrl+1', 'Meta+1'],
    category: 'tools',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(ZoomMode.FitWidth);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === ZoomMode.FitWidth,
  },

  'zoom:marquee': {
    id: 'zoom:marquee',
    label: 'Marquee Zoom',
    icon: 'Marquee',
    shortcuts: ['Ctrl+M', 'Meta+M'],
    category: 'tools',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.toggleMarqueeZoom();
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.isMarqueeZoomActive ?? false,
  },

  'zoom:25': {
    id: 'zoom:25',
    label: '25%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(0.25);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 0.25,
  },

  'zoom:50': {
    id: 'zoom:50',
    label: '50%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(0.5);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 0.5,
  },

  'zoom:100': {
    id: 'zoom:100',
    label: '100%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(1);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 1,
  },

  'zoom:125': {
    id: 'zoom:125',
    label: '125%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(1.25);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 1.25,
  },

  'zoom:150': {
    id: 'zoom:150',
    label: '150%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(1.5);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 1.5,
  },

  'zoom:200': {
    id: 'zoom:200',
    label: '200%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(2);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 2,
  },

  'zoom:400': {
    id: 'zoom:400',
    label: '400%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(4);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 4,
  },

  'zoom:800': {
    id: 'zoom:800',
    label: '800%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(8);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 8,
  },

  'zoom:1600': {
    id: 'zoom:1600',
    label: '1600%',
    action: ({ registry, documentId }) => {
      const zoom = registry.getPlugin<ZoomPlugin>('zoom')?.provides();
      if (!zoom) return;

      const scope = zoom.forDocument(documentId);
      scope.requestZoom(16);
    },
    active: ({ state, documentId }) =>
      state.plugins['zoom']?.documents[documentId]?.zoomLevel === 16,
  },

  'zoom:toggle-menu': {
    id: 'zoom:toggle-menu',
    label: 'Zoom Menu',
    icon: 'ChevronDown',
    category: 'tools',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      const scope = ui.forDocument(documentId);
      scope.toggleMenu('zoom-menu', 'zoom:toggle-menu', 'zoom-menu-button');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['zoom-menu'] !== undefined;
    },
  },

  // ─────────────────────────────────────────────────────────
  // Pan Command
  // ─────────────────────────────────────────────────────────
  'pan:toggle': {
    id: 'pan:toggle',
    label: 'Toggle Pan Mode',
    icon: 'Hand',
    shortcuts: ['h'],
    category: 'tools',
    action: ({ registry, documentId }) => {
      const pan = registry.getPlugin<PanPlugin>('pan')?.provides();
      if (!pan) return;

      const scope = pan.forDocument(documentId);
      scope.togglePan();
    },
    active: ({ state, documentId }) =>
      state.plugins['pan']?.documents[documentId]?.isPanMode ?? false,
  },

  // ─────────────────────────────────────────────────────────
  // Pointer Command
  // ─────────────────────────────────────────────────────────
  'pointer:toggle': {
    id: 'pointer:toggle',
    label: 'Toggle Pointer Mode',
    icon: 'Pointer',
    shortcuts: ['p'],
    category: 'tools',
    action: ({ registry, documentId }) => {
      const pointer = registry
        .getPlugin<InteractionManagerPlugin>('interaction-manager')
        ?.provides();
      if (!pointer) return;

      const scope = pointer.forDocument(documentId);
      scope.activate('pointerMode');
    },
    active: ({ state, documentId }) =>
      state.plugins['interaction-manager']?.documents[documentId]?.activeMode === 'pointerMode',
  },

  // ─────────────────────────────────────────────────────────
  // Capture Command
  // ─────────────────────────────────────────────────────────
  'capture:screenshot': {
    id: 'capture:screenshot',
    label: 'Screenshot',
    labelKey: 'commands.screenshot',
    icon: 'Screenshot',
    shortcuts: ['Ctrl+Shift+S', 'Meta+Shift+S'],
    category: 'tools',
    action: ({ registry, documentId }) => {
      const capture = registry.getPlugin<CapturePlugin>('capture')?.provides();
      if (!capture) return;

      const scope = capture.forDocument(documentId);
      if (scope.isMarqueeCaptureActive()) {
        scope.disableMarqueeCapture();
      } else {
        scope.enableMarqueeCapture();
      }
    },
    active: ({ state, documentId }) =>
      state.plugins['interaction-manager'].documents[documentId]?.activeMode === 'marqueeCapture',
  },

  // ─────────────────────────────────────────────────────────
  // Document Commands
  // ─────────────────────────────────────────────────────────
  'document:menu': {
    id: 'document:menu',
    label: 'Document Menu',
    icon: 'Menu',
    category: 'document',
    action: ({ registry, documentId }) => {
      // Toggle the document menu via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleMenu(
        'document-menu',
        'document:menu',
        'document-menu-button', // Must match the item ID in ui-schema
      );
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['document-menu'] !== undefined;
    },
  },

  'document:open': {
    id: 'document:open',
    label: 'Open',
    icon: 'Document',
    shortcuts: ['Ctrl+O', 'Meta+O'],
    category: 'document',
    action: ({ registry }) => {
      const docManager = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
      docManager?.openFileDialog();
    },
  },

  'document:close': {
    id: 'document:close',
    label: 'Close',
    icon: 'Close',
    shortcuts: ['Ctrl+W', 'Meta+W'],
    category: 'document',
    action: ({ registry, documentId }) => {
      const docManager = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
      docManager?.closeDocument(documentId);
    },
  },

  'document:print': {
    id: 'document:print',
    label: 'Print',
    icon: 'Print',
    shortcuts: ['Ctrl+P', 'Meta+P'],
    category: 'document',
    action: ({ registry, documentId }) => {
      const print = registry.getPlugin<PrintPlugin>('print')?.provides();
      print?.forDocument(documentId).print();
    },
  },

  'document:export': {
    id: 'document:export',
    label: 'Export',
    icon: 'Download',
    category: 'document',
    action: ({ registry, documentId }) => {
      const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();
      exportPlugin?.forDocument(documentId).download();
    },
  },

  'document:properties': {
    id: 'document:properties',
    label: 'Properties',
    icon: 'Alert',
    category: 'document',
    action: () => {
      console.log('Document properties clicked');
    },
  },

  // ─────────────────────────────────────────────────────────
  // Panel Commands
  // ─────────────────────────────────────────────────────────
  'panel:toggle-thumbnails': {
    id: 'panel:toggle-thumbnails',
    label: 'Thumbnails',
    icon: 'Thumbnails',
    category: 'panels',
    action: ({ registry, documentId }) => {
      // Toggle the thumbnails panel via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.togglePanel('left', 'main', 'thumbnails-panel');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.activePanels['left-main'] === 'thumbnails-panel';
    },
  },

  'panel:toggle-search': {
    id: 'panel:toggle-search',
    label: 'Search',
    icon: 'Search',
    shortcuts: ['Ctrl+F', 'Meta+F'],
    category: 'panels',
    action: ({ registry, documentId }) => {
      // Toggle the search panel via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.togglePanel('right', 'main', 'search-panel');
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.activePanels['right-main'] === 'search-panel';
    },
  },

  // ─────────────────────────────────────────────────────────
  // Page Settings Commands
  // ─────────────────────────────────────────────────────────
  'page:settings': {
    id: 'page:settings',
    label: 'Page Settings',
    icon: 'Settings',
    category: 'page',
    action: ({ registry, documentId }) => {
      // Toggle the page settings menu via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.toggleMenu(
        'page-settings-menu',
        'page:settings',
        'page-settings-button', // Must match the item ID in ui-schema
      );
    },
    active: ({ state, documentId }) => {
      const uiState = state.plugins['ui']?.documents[documentId];
      return uiState?.openMenus['page-settings-menu'] !== undefined;
    },
  },

  'spread:none': {
    id: 'spread:none',
    label: 'Single Page',
    category: 'page',
    action: ({ registry, documentId }) => {
      const spread = registry.getPlugin<SpreadPlugin>('spread')?.provides();
      spread?.forDocument(documentId).setSpreadMode(SpreadMode.None);
    },
    active: ({ state, documentId }) =>
      state.plugins['spread']?.documents[documentId]?.spreadMode === SpreadMode.None,
  },

  'spread:odd': {
    id: 'spread:odd',
    label: 'Two Page (Odd)',
    category: 'page',
    action: ({ registry, documentId }) => {
      const spread = registry.getPlugin<SpreadPlugin>('spread')?.provides();
      spread?.forDocument(documentId).setSpreadMode(SpreadMode.Odd);
    },
    active: ({ state, documentId }) =>
      state.plugins['spread']?.documents[documentId]?.spreadMode === SpreadMode.Odd,
  },

  'spread:even': {
    id: 'spread:even',
    label: 'Two Page (Even)',
    category: 'page',
    action: ({ registry, documentId }) => {
      const spread = registry.getPlugin<SpreadPlugin>('spread')?.provides();
      spread?.forDocument(documentId).setSpreadMode(SpreadMode.Even);
    },
    active: ({ state, documentId }) =>
      state.plugins['spread']?.documents[documentId]?.spreadMode === SpreadMode.Even,
  },

  'rotate:clockwise': {
    id: 'rotate:clockwise',
    label: 'Rotate Clockwise',
    icon: 'RotateRight',
    shortcuts: ['Ctrl+]', 'Meta+]'],
    category: 'page',
    action: ({ registry, documentId }) => {
      const rotate = registry.getPlugin<RotatePlugin>('rotate')?.provides();
      rotate?.forDocument(documentId).rotateForward();
    },
  },

  'rotate:counter-clockwise': {
    id: 'rotate:counter-clockwise',
    label: 'Rotate Counter-Clockwise',
    icon: 'RotateLeft',
    shortcuts: ['Ctrl+[', 'Meta+['],
    category: 'page',
    action: ({ registry, documentId }) => {
      const rotate = registry.getPlugin<RotatePlugin>('rotate')?.provides();
      rotate?.forDocument(documentId).rotateBackward();
    },
  },

  'scroll:vertical': {
    id: 'scroll:vertical',
    label: 'Vertical',
    category: 'page',
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).setScrollStrategy(ScrollStrategy.Vertical);
    },
    active: ({ state, documentId }) =>
      state.plugins['scroll']?.documents[documentId]?.strategy === ScrollStrategy.Vertical,
  },

  'scroll:horizontal': {
    id: 'scroll:horizontal',
    label: 'Horizontal',
    category: 'page',
    action: ({ registry, documentId }) => {
      const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
      scroll?.forDocument(documentId).setScrollStrategy(ScrollStrategy.Horizontal);
    },
    active: ({ state, documentId }) =>
      state.plugins['scroll']?.documents[documentId]?.strategy === ScrollStrategy.Horizontal,
  },

  // ─────────────────────────────────────────────────────────
  // Mode Commands
  // ─────────────────────────────────────────────────────────
  'mode:view': {
    id: 'mode:view',
    label: 'View',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Clear the secondary toolbar (hide annotation/redaction toolbars)
      const uiScope = ui.forDocument(documentId);
      uiScope.setActiveToolbar('top', 'secondary', '');
    },
    active: ({ state, documentId }) => {
      // Active if no secondary toolbar is shown
      const ui = state.plugins['ui']?.documents[documentId];
      return !ui?.activeToolbars['top-secondary'];
    },
  },

  'mode:annotate': {
    id: 'mode:annotate',
    label: 'Annotate',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the annotation toolbar
      ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      // Active when annotation toolbar is shown
      const ui = state.plugins['ui']?.documents[documentId];
      return ui?.activeToolbars['top-secondary'] === 'annotation-toolbar';
    },
  },

  'mode:shapes': {
    id: 'mode:shapes',
    label: 'Shapes',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the annotation toolbar (shapes use the same toolbar)
      ui.setActiveToolbar('top', 'secondary', 'shapes-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      // Active when annotation toolbar is shown
      const ui = state.plugins['ui']?.documents[documentId];
      return ui?.activeToolbars['top-secondary'] === 'shapes-toolbar';
    },
  },

  'mode:redact': {
    id: 'mode:redact',
    label: 'Redact',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the redaction toolbar
      ui.setActiveToolbar('top', 'secondary', 'redaction-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      // Active when redaction toolbar is shown
      const ui = state.plugins['ui']?.documents[documentId];
      return ui?.activeToolbars['top-secondary'] === 'redaction-toolbar';
    },
  },

  'tabs:overflow-menu': {
    id: 'tabs:overflow-menu',
    label: 'More tabs',
    icon: 'MenuDots',
    category: 'ui',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Toggle the overflow tabs menu
      ui.toggleMenu(
        'mode-tabs-overflow-menu',
        'tabs:overflow-menu',
        'overflow-tabs-button',
        documentId,
      );
    },
  },

  // ─────────────────────────────────────────────────────────
  // Annotation Commands
  // ─────────────────────────────────────────────────────────
  'annotation:add-text': {
    id: 'annotation:add-text',
    label: 'Text',
    icon: 'Text',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'freeText')?.fontColor,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'freeText') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('freeText');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'freeText';
    },
  },

  'annotation:add-highlight': {
    id: 'annotation:add-highlight',
    label: 'Highlight',
    icon: 'Highlight',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'highlight')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'highlight') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('highlight');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'highlight';
    },
  },

  'annotation:add-strikeout': {
    id: 'annotation:add-strikeout',
    label: 'Strikeout',
    icon: 'Strikethrough',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'strikeout')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'strikeout') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('strikeout');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'strikeout';
    },
  },

  'annotation:add-underline': {
    id: 'annotation:add-underline',
    label: 'Underline',
    icon: 'Underline',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'underline')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'underline') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('underline');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'underline';
    },
  },

  'annotation:add-rectangle': {
    id: 'annotation:add-rectangle',
    label: 'Rectangle',
    icon: 'Square',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'square')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'square')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'square') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('square');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'square';
    },
  },

  'annotation:add-circle': {
    id: 'annotation:add-circle',
    label: 'Circle',
    icon: 'Circle',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'circle')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'circle')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'circle') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('circle');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'circle';
    },
  },

  'annotation:add-line': {
    id: 'annotation:add-line',
    label: 'Line',
    icon: 'Line',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'line')?.strokeColor,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'line') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('line');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'line';
    },
  },

  'annotation:add-arrow': {
    id: 'annotation:add-arrow',
    label: 'Arrow',
    icon: 'Arrow',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'line')?.strokeColor,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'lineArrow') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('lineArrow');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'lineArrow';
    },
  },

  'annotation:add-polygon': {
    id: 'annotation:add-polygon',
    label: 'Polygon',
    icon: 'Polygon',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'polygon')?.strokeColor,
      secondaryColor: getToolDefaultsById(state.plugins.annotation, 'polygon')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'polygon') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('polygon');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'polygon';
    },
  },

  'annotation:add-polyline': {
    id: 'annotation:add-polyline',
    label: 'Polyline',
    icon: 'Polyline',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'polyline')?.strokeColor,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'polyline') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('polyline');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'polyline';
    },
  },

  'annotation:add-ink': {
    id: 'annotation:add-ink',
    label: 'Ink',
    icon: 'Pen',
    iconProps: ({ state }) => ({
      primaryColor: getToolDefaultsById(state.plugins.annotation, 'ink')?.color,
    }),
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'ink') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('ink');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'ink';
    },
  },

  'annotation:add-stamp': {
    id: 'annotation:add-stamp',
    label: 'Stamp',
    icon: 'Photo',
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();
      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      if (annotationScope.getActiveTool()?.id === 'stamp') {
        annotationScope.setActiveTool(null);
      } else {
        annotationScope.setActiveTool('stamp');
      }
    },
    active: ({ state, documentId }) => {
      const annotation = state.plugins[ANNOTATION_PLUGIN_ID]?.documents[documentId];
      return annotation?.activeToolId === 'stamp';
    },
  },

  // ─────────────────────────────────────────────────────────
  // Redaction Commands
  // ─────────────────────────────────────────────────────────
  'redaction:redact-area': {
    id: 'redaction:redact-area',
    label: 'Redact Area',
    icon: 'RedactArea',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).toggleMarqueeRedact();
    },
    active: ({ state, documentId }) => {
      const redaction = state.plugins[REDACTION_PLUGIN_ID]?.documents[documentId];
      return redaction?.activeType === RedactionMode.MarqueeRedact;
    },
  },

  'redaction:redact-text': {
    id: 'redaction:redact-text',
    label: 'Redact Text',
    icon: 'RedactText',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).toggleRedactSelection();
    },
    active: ({ state, documentId }) => {
      const redaction = state.plugins[REDACTION_PLUGIN_ID]?.documents[documentId];
      return redaction?.activeType === RedactionMode.RedactSelection;
    },
  },

  'redaction:apply-all': {
    id: 'redaction:apply-all',
    label: 'Apply All',
    icon: 'Check',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).commitAllPending();
    },
  },

  'redaction:clear-all': {
    id: 'redaction:clear-all',
    label: 'Clear All',
    icon: 'Close',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).clearPending();
    },
  },

  // ─────────────────────────────────────────────────────────
  // History Commands
  // ─────────────────────────────────────────────────────────
  'history:undo': {
    id: 'history:undo',
    label: 'Undo',
    icon: 'ArrowBackUp',
    shortcuts: ['Ctrl+Z', 'Meta+Z'],
    category: 'edit',
    action: ({ registry, documentId }) => {
      const history = registry.getPlugin<HistoryPlugin>(HISTORY_PLUGIN_ID)?.provides();
      if (!history) return;

      const scope = history.forDocument(documentId);
      scope.undo();
    },
    disabled: ({ state, documentId }) => {
      const history = state.plugins[HISTORY_PLUGIN_ID]?.documents[documentId];
      return !history?.global.canUndo;
    },
  },

  'history:redo': {
    id: 'history:redo',
    label: 'Redo',
    icon: 'ArrowForwardUp',
    shortcuts: ['Ctrl+Y', 'Meta+Shift+Z'],
    category: 'edit',
    action: ({ registry, documentId }) => {
      const history = registry.getPlugin<HistoryPlugin>(HISTORY_PLUGIN_ID)?.provides();
      if (!history) return;

      const scope = history.forDocument(documentId);
      scope.redo();
    },
    disabled: ({ state, documentId }) => {
      const history = state.plugins[HISTORY_PLUGIN_ID]?.documents[documentId];
      return !history?.global.canRedo;
    },
  },

  'annotation:overflow-tools': {
    id: 'annotation:overflow-tools',
    label: 'Overflow Tools',
    icon: 'MenuDots',
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const uiCapability = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      if (!scope) return;

      scope.toggleMenu(
        'annotation-tools-menu',
        'annotation:overflow-tools',
        'overflow-annotation-tools',
      );
    },
    active: ({ state, documentId }) => {
      const ui = state.plugins['ui']?.documents[documentId];
      return ui?.openMenus['annotation-tools-menu'] !== undefined;
    },
  },
};
