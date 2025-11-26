import { Command } from '@embedpdf/plugin-commands/vue';
import { CapturePlugin } from '@embedpdf/plugin-capture/vue';
import { ZoomMode, ZoomPlugin } from '@embedpdf/plugin-zoom/vue';
import { PanPlugin } from '@embedpdf/plugin-pan/vue';
import { SpreadMode, SpreadPlugin } from '@embedpdf/plugin-spread/vue';
import { RotatePlugin } from '@embedpdf/plugin-rotate/vue';
import {
  ANNOTATION_PLUGIN_ID,
  AnnotationPlugin,
  getToolDefaultsById,
} from '@embedpdf/plugin-annotation/vue';
import {
  REDACTION_PLUGIN_ID,
  RedactionMode,
  RedactionPlugin,
} from '@embedpdf/plugin-redaction/vue';
import { PrintPlugin } from '@embedpdf/plugin-print/vue';
import { ExportPlugin } from '@embedpdf/plugin-export/vue';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager/vue';
import { HISTORY_PLUGIN_ID, HistoryPlugin } from '@embedpdf/plugin-history/vue';
import { State } from './types';
import { isPanelOpen, isToolbarOpen, UI_PLUGIN_ID, UIPlugin } from '@embedpdf/plugin-ui';
import { ScrollPlugin, ScrollStrategy } from '@embedpdf/plugin-scroll/vue';
import { InteractionManagerPlugin } from '@embedpdf/plugin-interaction-manager';
import { SelectionPlugin } from '@embedpdf/plugin-selection';

export const commands: Record<string, Command<State>> = {
  // ─────────────────────────────────────────────────────────
  // Zoom Commands
  // ─────────────────────────────────────────────────────────
  'zoom:in': {
    id: 'zoom:in',
    labelKey: 'zoom.in',
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
    labelKey: 'zoom.out',
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
    labelKey: 'zoom.fitPage',
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
    labelKey: 'zoom.fitWidth',
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
    labelKey: 'zoom.marquee',
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
    labelKey: 'zoom.menu',
    icon: 'ZoomChevronDown',
    iconProps: {
      className: 'h-3.5 w-3.5',
    },
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

  'zoom:toggle-menu-mobile': {
    id: 'zoom:toggle-menu-mobile',
    labelKey: 'zoom.menu',
    icon: 'SearchPlus',
    category: 'tools',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      const scope = ui.forDocument(documentId);
      scope.toggleMenu('zoom-menu', 'zoom:toggle-menu-mobile', 'zoom-menu-button');
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
    labelKey: 'pan.toggle',
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
    labelKey: 'pointer.toggle',
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
    labelKey: 'capture.screenshot',
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
    labelKey: 'document.menu',
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
    labelKey: 'document.open',
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
    labelKey: 'document.close',
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
    labelKey: 'document.print',
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
    labelKey: 'document.export',
    icon: 'Download',
    category: 'document',
    action: ({ registry, documentId }) => {
      const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();
      exportPlugin?.forDocument(documentId).download();
    },
  },

  'document:properties': {
    id: 'document:properties',
    labelKey: 'document.properties',
    icon: 'Alert',
    category: 'document',
    action: () => {
      console.log('Document properties clicked');
    },
  },

  // ─────────────────────────────────────────────────────────
  // Panel Commands
  // ─────────────────────────────────────────────────────────
  'panel:toggle-sidebar': {
    id: 'panel:toggle-sidebar',
    labelKey: 'panel.sidebar',
    icon: 'Sidebar',
    category: 'panels',
    action: ({ registry, documentId }) => {
      // Toggle the thumbnails panel via UI plugin
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.togglePanel('left', 'main', 'sidebar-panel');
    },
    active: ({ state, documentId }) => {
      return isPanelOpen(state.plugins, documentId, 'left', 'main', 'sidebar-panel');
    },
  },

  'panel:toggle-search': {
    id: 'panel:toggle-search',
    labelKey: 'panel.search',
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
      return isPanelOpen(state.plugins, documentId, 'right', 'main', 'search-panel');
    },
  },

  'panel:toggle-comment': {
    id: 'panel:toggle-comment',
    labelKey: 'panel.comment',
    icon: 'Comment',
    category: 'panels',
    action: ({ registry, documentId }) => {
      const uiPlugin = registry.getPlugin<UIPlugin>(UI_PLUGIN_ID);
      if (!uiPlugin || !uiPlugin.provides) return;

      const uiCapability = uiPlugin.provides();
      if (!uiCapability) return;

      const scope = uiCapability.forDocument(documentId);
      scope.togglePanel('right', 'main', 'comment-panel');
    },
    active: ({ state, documentId }) => {
      return isPanelOpen(state.plugins, documentId, 'right', 'main', 'comment-panel');
    },
  },

  // ─────────────────────────────────────────────────────────
  // Page Settings Commands
  // ─────────────────────────────────────────────────────────
  'page:settings': {
    id: 'page:settings',
    labelKey: 'page.settings',
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
    labelKey: 'page.single',
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
    labelKey: 'page.twoOdd',
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
    labelKey: 'page.twoEven',
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
    labelKey: 'rotate.clockwise',
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
    labelKey: 'rotate.counterClockwise',
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
    labelKey: 'page.vertical',
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
    labelKey: 'page.horizontal',
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
    labelKey: 'mode.view',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;
      ui.forDocument(documentId).closeToolbarSlot('top', 'secondary');
    },
    active: ({ state, documentId }) => {
      // Active if no secondary toolbar is shown
      return !isToolbarOpen(state.plugins, documentId, 'top', 'secondary');
    },
  },

  'mode:annotate': {
    id: 'mode:annotate',
    labelKey: 'mode.annotate',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the annotation toolbar
      ui.setActiveToolbar('top', 'secondary', 'annotation-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'annotation-toolbar');
    },
  },

  'mode:shapes': {
    id: 'mode:shapes',
    labelKey: 'mode.shapes',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the annotation toolbar (shapes use the same toolbar)
      ui.setActiveToolbar('top', 'secondary', 'shapes-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'shapes-toolbar');
    },
  },

  'mode:redact': {
    id: 'mode:redact',
    labelKey: 'mode.redact',
    category: 'mode',
    action: ({ registry, documentId }) => {
      const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
      if (!ui) return;

      // Show the redaction toolbar
      ui.setActiveToolbar('top', 'secondary', 'redaction-toolbar', documentId);
    },
    active: ({ state, documentId }) => {
      // Active when redaction toolbar is shown
      return isToolbarOpen(state.plugins, documentId, 'top', 'secondary', 'redaction-toolbar');
    },
  },

  'tabs:overflow-menu': {
    id: 'tabs:overflow-menu',
    labelKey: 'tabs.overflowMenu',
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
    labelKey: 'annotation.text',
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
    labelKey: 'annotation.highlight',
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
    labelKey: 'annotation.strikeout',
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
    labelKey: 'annotation.underline',
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
    labelKey: 'annotation.rectangle',
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
    labelKey: 'annotation.circle',
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
    labelKey: 'annotation.line',
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
    labelKey: 'annotation.arrow',
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
    labelKey: 'annotation.polygon',
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
    labelKey: 'annotation.polyline',
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
    labelKey: 'annotation.ink',
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
    labelKey: 'annotation.stamp',
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

  'annotation:delete-selected': {
    id: 'annotation:delete-selected',
    labelKey: 'annotation.deleteSelected',
    icon: 'Trash',
    category: 'annotation',
    action: ({ registry, documentId }) => {
      const annotation = registry.getPlugin<AnnotationPlugin>(ANNOTATION_PLUGIN_ID)?.provides();

      const annotationScope = annotation?.forDocument(documentId);
      if (!annotationScope) return;

      const selectedAnnotation = annotationScope.getSelectedAnnotation();
      if (!selectedAnnotation) return;

      annotationScope.deleteAnnotation(
        selectedAnnotation.object.pageIndex,
        selectedAnnotation.object.id,
      );
    },
  },

  // ─────────────────────────────────────────────────────────
  // Redaction Commands
  // ─────────────────────────────────────────────────────────
  'redaction:redact-area': {
    id: 'redaction:redact-area',
    labelKey: 'redaction.area',
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
    labelKey: 'redaction.text',
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
    labelKey: 'redaction.applyAll',
    icon: 'Check',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).commitAllPending();
    },
  },

  'redaction:clear-all': {
    id: 'redaction:clear-all',
    labelKey: 'redaction.clearAll',
    icon: 'Close',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      redaction?.forDocument(documentId).clearPending();
    },
  },

  'redaction:delete-selected': {
    id: 'redaction:delete-selected',
    labelKey: 'redaction.deleteSelected',
    icon: 'Trash',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      const selectedRedaction = redaction?.forDocument(documentId).getSelectedPending();
      if (!selectedRedaction) return;
      redaction
        ?.forDocument(documentId)
        .removePending(selectedRedaction.page, selectedRedaction.id);
    },
  },

  'redaction:commit-selected': {
    id: 'redaction:commit-selected',
    labelKey: 'redaction.commitSelected',
    icon: 'Check',
    category: 'redaction',
    action: ({ registry, documentId }) => {
      const redaction = registry.getPlugin<RedactionPlugin>('redaction')?.provides();
      const selectedRedaction = redaction?.forDocument(documentId).getSelectedPending();
      if (!selectedRedaction) return;
      redaction
        ?.forDocument(documentId)
        .commitPending(selectedRedaction.page, selectedRedaction.id);
    },
  },

  'selection:copy': {
    id: 'selection:copy',
    labelKey: 'selection.copy',
    icon: 'Copy',
    category: 'selection',
    action: ({ registry, documentId }) => {
      const plugin = registry.getPlugin<SelectionPlugin>('selection');
      const scope = plugin?.provides().forDocument(documentId);
      scope?.copyToClipboard();
      scope?.clear();
    },
  },

  // ─────────────────────────────────────────────────────────
  // History Commands
  // ─────────────────────────────────────────────────────────
  'history:undo': {
    id: 'history:undo',
    labelKey: 'history.undo',
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
    labelKey: 'history.redo',
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
    labelKey: 'annotation.overflowTools',
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
